// Визуальная оценка композиции: модель смотрит на исходный баннер и на варианты, собранные
// по слоям, и выбирает лучший — без дублей текста, без надписей поверх лица и главного
// объекта, с текстом в рамках и плашках, без пустых плашек и остатков старой кнопки.
//
// Body: { original: data:image/… | https://…, candidates: data:image/…[] (2–4, ≤ 768 px) }
// Response: { best: number, scores: number[], issues: string[][] }
// Дёшево (центы), кредиты не списываются; лимит — на пользователя.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

// gpt-4o-mini в low detail выбирал верно, но не видел дубль заголовка и выдумывал наложения;
// gpt-5.4-mini с high detail разбирает точно (проверено на баннере с драконом).
const MODEL = "gpt-5.4-mini";

const SYSTEM = [
  "You are a senior art director reviewing casino / betting advertising banners.",
  "Image 1 is the ORIGINAL banner. The next images are CANDIDATES: the same scene with the lettering re-placed.",
  "Score each candidate 0–10 for composition quality as a finished ad, judging:",
  "- the same text must NOT appear twice; nothing important missing (headline, offer, button);",
  "- ABSOLUTE RULE: if ANY text, button or decoration covers ANY part of a character's face (eyes, nose, mouth) — score that candidate 0;",
  "- text should not cover the main character's body or the key object either;",
  "- text should sit where the scene invites it (inside frames / plaques / empty areas), with a clear hierarchy headline → offer → button;",
  "- no empty plaques or frames left without text, no leftover remains of an old button behind the new one;",
  "- balance and readability close to the original.",
  'Return strict JSON: {"scores": number[], "issues": string[][]} — one score and a short list of concrete problems (English, ≤ 3 items) per candidate, in candidate order.',
].join("\n");

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("judge-composition", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 12 * 1024 * 1024);
  if (big) return big;

  let body: { original?: string; candidates?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const cands = (body.candidates ?? []).slice(0, 4);
  if (cands.length < 2) return Response.json({ error: "Нужно минимум 2 варианта" }, { status: 400 });
  for (const c of cands) {
    const bad = assertImageDataUrl("candidates", c);
    if (bad) return bad;
  }
  let original = (body.original ?? "").trim();
  if (/^https?:\/\//.test(original)) {
    try {
      const { buffer, mime } = await safeFetchImage(original);
      original = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return Response.json({ error: "Не удалось загрузить исходный баннер" }, { status: 400 });
    }
  }
  const badOrig = assertImageDataUrl("original", original);
  if (badOrig) return badOrig;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const img = (url: string) => ({ type: "image_url", image_url: { url, detail: "high" } });
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `ORIGINAL, then ${cands.length} candidates.` },
              img(original),
              ...cands.map(img),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: "Оценка недоступна" }, { status: 502 });
    const u = extractUsage(data, MODEL);
    await recordUsage(user.id, { model: MODEL, feature: "judge-composition", type: "llm", ...u });
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as {
      scores?: unknown[];
      issues?: unknown[];
    };
    const scores = cands.map((_, i) => Number(parsed.scores?.[i]) || 0);
    const issues = cands.map((_, i) =>
      Array.isArray(parsed.issues?.[i]) ? (parsed.issues![i] as unknown[]).map(String).slice(0, 3) : [],
    );
    const best = scores.indexOf(Math.max(...scores));
    return Response.json({ best, scores, issues });
  } catch {
    return Response.json({ error: "Оценка недоступна" }, { status: 502 });
  }
}
