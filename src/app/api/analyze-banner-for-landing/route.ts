// POST /api/analyze-banner-for-landing
//
// "Сделать лендинг из баннера" — a vision-LLM pass over the approved banner
// that extracts everything the landing builders (wheel/slot/crash) need to
// prefill themselves from the banner's actual PIXELS, not just the form
// state that was used to generate it (which can drift — history-restored
// banners, hand-edited text, a regenerated image, etc.):
//   • every printed text (headline / subheadline / CTA) + the brand name
//   • the dominant accent colour, to seed the landing's own accent
//   • whether a person/character is visible, and if so a ready character-gen
//     prompt (safety-vocabulary scrubbed) for the landing's character slot
//   • a ready background-gen prompt capturing the banner's scene/mood
//
// Model: gpt-5.4-mini — of every vision-capable chat model on our OpenAI key
// (gpt-4o-mini/4.1-mini, gpt-5-mini, gpt-5-nano, gpt-5.4-mini), it gave the
// most accurate extraction on this exact JSON-schema task at ~4s and ~1.6k
// tokens — roughly 3-5x faster and cheaper than gpt-5-mini/nano (13-20s,
// 2.5-3.7k tokens) and far more token-efficient than gpt-4o-mini (~26k
// tokens for the same 1024x1024 image). Good fit for a call that blocks the
// UI right before navigating to the landing builder.
//
// Body: { source_image: string (dataURL or allowed http(s) URL), mechanic?: "wheel"|"slot"|"crash" }
// Response: { result: BannerLandingAnalysis }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { logSystem, newRequestId } from "@/lib/logger";
import { assertAllowedImageUrl } from "@/lib/safe-fetch";
import { rateLimitResponse } from "@/lib/request-guard";
import { sanitizeVisionText, VISION_VOCAB_RULE } from "@/lib/visionSafety";

export const runtime = "nodejs";
export const maxDuration = 60;

type Mechanic = "wheel" | "slot" | "crash";
type Body = { source_image?: string; mechanic?: Mechanic };

export type BannerLandingAnalysis = {
  headline: string;
  subheadline: string;
  cta_text: string;
  brand_name: string;
  accent_color_hex: string;
  palette: string[];
  has_person: boolean;
  character_prompt: string;
  background_prompt: string;
  /** Exactly 6 slot-reel symbols themed to the banner, ONLY when mechanic
   *  is "slot" — empty for wheel/crash. */
  symbols: string[];
};

const EMPTY: BannerLandingAnalysis = {
  headline: "",
  subheadline: "",
  cta_text: "",
  brand_name: "",
  accent_color_hex: "",
  palette: [],
  has_person: false,
  character_prompt: "",
  background_prompt: "",
  symbols: [],
};

const MECH_LABEL: Record<Mechanic, string> = {
  wheel: "a fortune-wheel landing page",
  slot: "a slot-machine landing page",
  crash: "a crash-game (rising multiplier) landing page",
};

function buildSystem(mechanic: Mechanic | undefined): string {
  const mech = mechanic ? MECH_LABEL[mechanic] : "a gamified landing page";
  const isSlot = mechanic === "slot";
  return [
    "You are a visual analyst for a banner-to-landing-page pipeline. You receive",
    "ONE approved ad banner image and must extract structured facts so a landing",
    `page generator can rebuild it as ${mech} — same brand, same texts, same`,
    "colour mood, same character if there is one.",
    "",
    VISION_VOCAB_RULE,
    "",
    "Return STRICT JSON only, no markdown fences, matching exactly:",
    "{",
    '  "headline": string,          // the main/largest headline text, EXACTLY as printed (any language, do not translate)',
    '  "subheadline": string,       // secondary supporting text if any, else ""',
    '  "cta_text": string,          // the button/CTA text EXACTLY as printed, else ""',
    '  "brand_name": string,        // the brand/logo name if visible as text, else ""',
    '  "accent_color_hex": string,  // ONE dominant accent colour (the colour behind the CTA button or the boldest highlight colour), format "#RRGGBB"',
    '  "palette": string[],         // 3-5 dominant colours as hex codes "#RRGGBB", most prominent first — this drives the landing\'s own colour scheme, so read the banner\'s ACTUAL colours carefully',
    '  "has_person": boolean,       // true if a human figure/character is visible anywhere in the banner',
    '  "character_prompt": string,  // ONLY if has_person: a concise (2-3 sentences) ENGLISH description of that SAME person, written as an image-gen prompt for a STANDALONE full-body character cutout that must stay RECOGNISABLE as the identical character — hair colour/style, face/head shape, exact outfit colours and type, any distinctive accessories, markings or mascot-design details. Neutral factual pose. Empty string if has_person is false.',
    '  "background_prompt": string, // a concise (1-2 sentences) ENGLISH description of the banner\'s BACKGROUND scene/setting/mood/motifs (colours, environment, props, lighting) suitable as an image-gen prompt for a background-only image. Do NOT mention any person, text, logo or button.',
    '  "symbols": string[]          // ' +
      (isSlot
        ? "EXACTLY 6 short slot-machine reel symbols themed to this banner's subject (prefer single emoji; else a 1-3 character string). Match the banner's actual theme — e.g. a fruit/classic-fruit-machine banner → fruit emoji (🍒🍋🍇🍉), an Egypt theme → pyramid/scarab/ankh-style symbols, a treasure/pirate theme → gold coin/skull/anchor, a generic bright casino banner → classic reel icons (💎 7️⃣ 🔔 ⭐ 🍀 💰). Never leave this empty when mechanic is slot."
        : "always an empty array — this landing isn't a slot machine, so no reel symbols are needed."),
    "}",
    "",
    "Rules:",
    "- Reproduce all text EXACTLY as printed — do not translate, do not correct typos, do not invent text that isn't there.",
    "- If no text of a kind is visible, use an empty string for that field.",
    "- accent_color_hex and palette must be your best visual estimate — always fill them in, never leave blank.",
    "- Output ONLY the JSON, nothing else.",
    "- Before outputting, re-read character_prompt and background_prompt. If ANY forbidden word from the",
    "  vocabulary rule above appears, rewrite that sentence with neutral product-datasheet vocabulary.",
  ].join("\n");
}

function parseResponse(raw: string): BannerLandingAnalysis {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return EMPTY;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<
      Record<keyof BannerLandingAnalysis, unknown>
    >;
    const hexOk = (s: unknown) => (typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s) ? s : "");
    return {
      headline: sanitizeVisionText(String(parsed.headline ?? "")),
      subheadline: sanitizeVisionText(String(parsed.subheadline ?? "")),
      cta_text: sanitizeVisionText(String(parsed.cta_text ?? "")),
      brand_name: sanitizeVisionText(String(parsed.brand_name ?? "")),
      accent_color_hex: hexOk(parsed.accent_color_hex),
      palette: Array.isArray(parsed.palette)
        ? parsed.palette.filter((s): s is string => typeof s === "string").slice(0, 6)
        : [],
      has_person: Boolean(parsed.has_person),
      character_prompt: parsed.has_person
        ? sanitizeVisionText(String(parsed.character_prompt ?? "")).slice(0, 600)
        : "",
      background_prompt: sanitizeVisionText(String(parsed.background_prompt ?? "")).slice(0, 600),
      symbols: Array.isArray(parsed.symbols)
        ? parsed.symbols
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 8))
            .slice(0, 6)
        : [],
    };
  } catch {
    return EMPTY;
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

  const rl = rateLimitResponse("analyze-banner-for-landing", user.id, 20, 60_000);
  if (rl) return rl;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const src = body.source_image;
  if (!src) return Response.json({ error: "source_image required" }, { status: 400 });
  if (!src.startsWith("data:") && !src.startsWith("http://") && !src.startsWith("https://")) {
    return Response.json({ error: "source_image must be a dataURL or http(s) URL" }, { status: 400 });
  }
  // SSRF guard for URL sources (OpenAI fetches image_url server-side).
  if (!src.startsWith("data:")) {
    try {
      await assertAllowedImageUrl(src);
    } catch {
      return Response.json({ error: "source_image URL not allowed" }, { status: 400 });
    }
  }

  const mechanic: Mechanic | undefined =
    body.mechanic === "wheel" || body.mechanic === "slot" || body.mechanic === "crash"
      ? body.mechanic
      : undefined;

  const MODEL = "gpt-5.4-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: buildSystem(mechanic) },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the landing facts for this banner." },
              { type: "image_url", image_url: { url: src } },
            ],
          },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      void logSystem({
        level: "error",
        category: "image-gen",
        message: "banner-for-landing analysis provider error",
        user_id: user.id,
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        context: { model: MODEL, status: res.status, response_preview: text.slice(0, 300) },
      });
      return Response.json({ error: "Vision provider error", detail: text.slice(0, 500) }, { status: 502 });
    }
    const data = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const result = parseResponse(raw);
    void logSystem({
      level: "info",
      category: "image-gen",
      message: "banner-for-landing analysis succeeded",
      user_id: user.id,
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      context: {
        model: MODEL,
        mechanic: mechanic ?? null,
        total_tokens: data.usage?.total_tokens ?? null,
        has_person: result.has_person,
      },
    });
    return Response.json({ result });
  } catch (e) {
    void logSystem({
      level: "error",
      category: "image-gen",
      message: "banner-for-landing analysis unexpected failure",
      user_id: user.id,
      request_id: requestId,
      context: { model: MODEL },
      error: e,
    });
    return Response.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
