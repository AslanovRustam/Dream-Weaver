// POST /api/tz/check — проверка готового креатива по списку требований ТЗ.
// Body: { image: data URL | https, requirements: [{id, text, exact?}] }
// Response: { results: [{id, ok, note}], faceCovered: boolean }
// Модель смотрит на картинку и по каждому пункту отвечает «выполнено / нет» с
// причиной; тексты сверяются с точной строкой. Кредиты не списываются.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { extractUsage, recordUsage } from "@/lib/usage";
import { llmJson } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Модель проверки: gpt-5.4-mini или claude-haiku-5-5 (провайдер — по названию, lib/llm). */
const MODEL = process.env.TZ_CHECK_MODEL || "gpt-5.4-mini";

const SYSTEM = [
  "You are a strict QA reviewer of advertising creatives. You get ONE finished banner image and a checklist of client requirements.",
  "For EACH requirement decide ok true/false by looking at the image. For a requirement with an exact text: ok only if that text is clearly visible on the banner and spelled correctly (case differences are fine; missing, extra or wrong letters or numbers are NOT).",
  "Requirements that cannot be judged from one image (resizes, other formats, delivery) → ok true with note «не проверяется по картинке».",
  "Also report faceCovered: true if any text, button or badge overlaps a character's face.",
  "note: a short Russian reason (what is wrong, or what you saw).",
  'Return STRICT JSON {"results":[{"id":string,"ok":boolean,"note":string}],"faceCovered":boolean}.',
].join("\n");

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("tz-check", user.id, 30, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 14 * 1024 * 1024);
  if (big) return big;
  let body: { image?: string; requirements?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  let image = String(body.image ?? "");
  if (/^https?:\/\//.test(image)) {
    try {
      const { buffer, mime } = await safeFetchImage(image);
      image = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return Response.json({ error: "Не удалось загрузить баннер" }, { status: 400 });
    }
  }
  const bad = assertImageDataUrl("image", image);
  if (bad) return bad;
  if (!image.startsWith("data:image/")) return Response.json({ error: "image required" }, { status: 400 });
  const reqs = (Array.isArray(body.requirements) ? body.requirements : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r?.id === "string" && typeof r?.text === "string")
    .slice(0, 30)
    .map((r) => ({
      id: String(r.id).slice(0, 8),
      text: String(r.text).slice(0, 240),
      exact: typeof r.exact === "string" ? r.exact.slice(0, 160) : undefined,
    }));
  if (!reqs.length) return Response.json({ results: [], faceCovered: false });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  try {
    const r = await llmJson({
      model: MODEL,
      system: SYSTEM,
      parts: [
        { type: "text", text: "CHECKLIST:\n" + reqs.map((q) => `${q.id}: ${q.text}${q.exact ? ` [exact text: «${q.exact}»]` : ""}`).join("\n") },
        { type: "image", url: image, detail: "high" },
      ],
      effort: "low",
      maxTokens: 8_000,
      timeoutMs: 50_000,
    });
    await recordUsage(user.id, { model: r.model, feature: "tz-check", type: "llm", ...extractUsage({ usage: r.usage }, MODEL) });
    const j = r.json as {
      results?: { id?: unknown; ok?: unknown; note?: unknown }[];
      faceCovered?: unknown;
    };
    const known = new Set(reqs.map((r) => r.id));
    const results = (j.results ?? [])
      .filter((r) => known.has(String(r.id)))
      .map((r) => ({ id: String(r.id), ok: r.ok === true, note: String(r.note ?? "").slice(0, 200) }));
    return Response.json({ results, faceCovered: j.faceCovered === true });
  } catch {
    return Response.json({ error: "Проверка недоступна" }, { status: 502 });
  }
}
