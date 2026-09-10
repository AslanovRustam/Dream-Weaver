// POST /api/brand-lookup
//
// "Найти по сайту" — given the brand's website URL/domain directly, pull its
// best logo candidate and run a vision pass over it to read off an accent
// colour + visual-style descriptor. Feeds the generator's Бренд fields so the
// user doesn't have to type/upload a logo by hand.
//
// (No brand-NAME search — the model resolving a bare name to a domain via a
// hosted web-search tool was dropped: the user only wants the deterministic
// "I already know the URL" path, not a guess.)
//
// Pipeline:
//   1. FETCH   — the given homepage's HTML, via the SSRF-safe arbitrary-URL
//      fetcher (src/lib/safe-fetch.ts — no origin allowlist, but every
//      redirect hop is re-validated against private/loopback/metadata IPs).
//   2. EXTRACT — logo/icon candidates ranked by src/lib/brandExtract.ts
//      (apple-touch-icon > sized <link rel=icon> > og:image > favicon.ico);
//      the first one that actually fetches as an image wins.
//   3. ANALYSE — the winning image + site name go through the SAME
//      gpt-5.4-mini vision pipeline already validated for
//      analyze-banner-for-landing: accent colour, palette, style, and
//      whether it's actually a clean logo (vs. e.g. a busy marketing photo).
//
// Body: { query: string } — a URL or bare domain, e.g. "grandcasino.com".
// Response: { site_url, brand_name, logo_data_url, accent_color_hex, palette, style, is_clean_logo }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { logSystem, newRequestId } from "@/lib/logger";
import { fetchPublicHtml, fetchPublicImage } from "@/lib/safe-fetch";
import { extractLogoCandidates, extractSiteName } from "@/lib/brandExtract";
import { rateLimitResponse } from "@/lib/request-guard";
import { sanitizeVisionText, VISION_VOCAB_RULE } from "@/lib/visionSafety";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { query?: string };

type LookupResult = {
  site_url: string;
  brand_name: string;
  logo_data_url: string;
  accent_color_hex: string;
  palette: string[];
  style: string;
  is_clean_logo: boolean;
};

function looksLikeUrl(q: string): string | null {
  const s = q.trim();
  if (/^https?:\/\//i.test(s)) return s;
  // Bare domain, e.g. "stripe.com" or "www.notion.com" — no scheme.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s) && !s.includes(" ")) return `https://${s}`;
  return null;
}

const ANALYSIS_SYSTEM = [
  "You are a brand visual-identity analyst. You receive ONE image — a logo or",
  "marketing image pulled from a brand's official website — and must describe",
  "it for reuse as a design reference in an ad-creative generator.",
  "",
  VISION_VOCAB_RULE,
  "",
  "Return STRICT JSON only, no markdown fences, matching exactly:",
  "{",
  '  "accent_color_hex": string,  // the ONE dominant brand colour, format "#RRGGBB"',
  '  "palette": string[],         // 2-5 dominant colours as hex codes, most prominent first',
  '  "style": string,             // 1 short sentence, ENGLISH, describing the visual style (e.g. "flat minimalist wordmark", "bold gradient tech logo", "playful rounded mascot")',
  '  "is_clean_logo": boolean     // true if this image IS a standalone logo/wordmark on a plain background; false if it is a busy photo/screenshot unsuitable as a logo asset',
  "}",
  "Output ONLY the JSON, nothing else.",
].join("\n");

async function analyzeLogoImage(
  dataUrl: string,
  brandName: string,
  apiKey: string,
): Promise<{ accent_color_hex: string; palette: string[]; style: string; is_clean_logo: boolean } | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      temperature: 0,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `Brand name: ${brandName || "(unknown)"}. Analyse this image.` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const hexOk = (s: unknown) => (typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s) ? s : "");
    return {
      accent_color_hex: hexOk(parsed.accent_color_hex),
      palette: Array.isArray(parsed.palette)
        ? parsed.palette.filter((s): s is string => typeof s === "string").slice(0, 5)
        : [],
      style: sanitizeVisionText(String(parsed.style ?? "")).slice(0, 200),
      is_clean_logo: Boolean(parsed.is_clean_logo),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();
  let user;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }

  // Tight limit — this fans out into a web search + several third-party
  // fetches per call, unlike the single-provider-call endpoints elsewhere.
  const rl = rateLimitResponse("brand-lookup", user.id, 10, 60_000);
  if (rl) return rl;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Сервис временно недоступен, попробуйте позже" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const query = (body.query || "").trim().slice(0, 200);
  if (!query) {
    return Response.json({ error: "Введите адрес сайта, например grandcasino.com" }, { status: 400 });
  }

  const siteUrl = looksLikeUrl(query);
  if (!siteUrl) {
    return Response.json(
      { error: "Введите адрес сайта, например grandcasino.com" },
      { status: 400 },
    );
  }

  try {
    // 1. FETCH the homepage (SSRF-safe, redirect-revalidated, size-capped).
    let html: string;
    let finalUrl: string;
    try {
      ({ html, finalUrl } = await fetchPublicHtml(siteUrl));
    } catch {
      // Don't leak the raw fetch/network error (often just "не удалось открыть
      // сайт" with no actionable detail — e.g. a gambling operator's regional
      // block, a timeout, TLS refusal). Same friendly fallback either way:
      // point the user at the manual logo upload right below this field.
      return Response.json(
        { error: "Сайт недоступен — загрузите логотип вручную ниже", site_url: siteUrl },
        { status: 502 },
      );
    }

    // 2. EXTRACT candidates + a clean site-name fallback.
    const candidates = extractLogoCandidates(html, finalUrl);
    const siteName = extractSiteName(html) || query;

    let logoDataUrl = "";
    for (const c of candidates.slice(0, 6)) {
      try {
        const { buffer, mime } = await fetchPublicImage(c.url);
        if (buffer.byteLength < 100) continue; // 1x1 tracking-pixel-style "icon"
        logoDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
        break;
      } catch {
        continue; // try the next candidate
      }
    }
    if (!logoDataUrl) {
      return Response.json(
        {
          error: "Логотип не найден на сайте — загрузите вручную ниже",
          site_url: finalUrl,
          brand_name: siteName,
        },
        { status: 404 },
      );
    }

    // 3. ANALYSE — colour/style/logo-quality vision pass.
    const analysis = await analyzeLogoImage(logoDataUrl, siteName, apiKey);

    const result: LookupResult = {
      site_url: finalUrl,
      brand_name: sanitizeVisionText(siteName),
      logo_data_url: logoDataUrl,
      accent_color_hex: analysis?.accent_color_hex ?? "",
      palette: analysis?.palette ?? [],
      style: analysis?.style ?? "",
      is_clean_logo: analysis?.is_clean_logo ?? true,
    };

    void logSystem({
      level: "info",
      category: "image-gen",
      message: "brand lookup succeeded",
      user_id: user.id,
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      context: { query, site_url: finalUrl, is_clean_logo: result.is_clean_logo },
    });
    return Response.json({ result });
  } catch (e) {
    // Log the real error server-side for diagnosis, but never surface a raw
    // fetch/parser/provider message to the user — same friendly fallback as
    // the fetch-failure branch above: try the manual upload instead.
    void logSystem({
      level: "error",
      category: "image-gen",
      message: "brand lookup unexpected failure",
      user_id: user.id,
      request_id: requestId,
      context: { query },
      error: e,
    });
    return Response.json(
      { error: "Не удалось найти бренд — загрузите логотип вручную ниже" },
      { status: 500 },
    );
  }
}
