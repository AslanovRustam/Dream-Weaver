// POST /api/landing-blocks
//
// Тексты блоков лендинга под тематику: для отмеченных блоков (бонусы, джекпот,
// промокод, турнир, VIP, FAQ…) одним запросом gpt-5.4-mini — на языке лендинга.
// Вызывается из «Применить тему» вместе с подбором заголовка и промптов.
// Кредиты не списываем — запрос текстовый и копеечный; лимит частоты.
//
// Body: { topic: string, kind: "casino" | "sport", lang: string, blocks: string[] }
// Response: { blocks: { [id]: частичные тексты блока } } — картинки, «вкл.» и
// числа клиент оставляет свои.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { euLang } from "@/lib/euLangs";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { extractUsage, recordUsage } from "@/lib/usage";
import { OFFER_RULE } from "@/lib/offerText";
import { BLOCK_SHAPES as SHAPES, cleanBlockCopy as clean, obj, type Obj } from "@/lib/landingBlocksCopy";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gpt-5.4-mini";

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("landing-blocks", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 8 * 1024);
  if (big) return big;

  let body: { topic?: unknown; kind?: unknown; lang?: unknown; blocks?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
  if (!topic) return Response.json({ error: "Нужна тематика" }, { status: 400 });
  const kind = body.kind === "sport" ? "sport" : "casino";
  const lang = typeof body.lang === "string" ? body.lang : "ru";
  const blocks = (Array.isArray(body.blocks) ? body.blocks : []).filter((b): b is string => typeof b === "string" && b in SHAPES);
  if (!blocks.length) return Response.json({ blocks: {} });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const system = [
    `You write the copy for the content blocks of a ${kind === "sport" ? "sports-betting" : "online casino"} landing page, all in ${euLang(lang).english}.`,
    "Everything must fit the campaign theme the marketer typed: names, wording, examples. Keep proper names from the theme (characters, clubs, events) as they are.",
    "Punchy promo tone, concrete numbers in bonuses. No emoji, no quotes around texts.",
    OFFER_RULE,
    'Return STRICT JSON {"<block id>": {...}} with exactly these blocks and shapes:',
    ...blocks.map((b) => `- "${b}": ${SHAPES[b]}`),
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Theme: ${topic}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Provider error", detail: (await res.text()).slice(0, 300) }, { status: 502 });
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  let parsed: Obj = {};
  try {
    parsed = obj(JSON.parse(data?.choices?.[0]?.message?.content || "{}"));
  } catch {
    /* ниже — пусто */
  }
  const out: Obj = {};
  for (const b of blocks) {
    const c = clean(b, obj(parsed[b]));
    if (c) out[b] = c;
  }
  void recordUsage(user.id, { model: MODEL, feature: "landing-blocks", type: "llm", ...extractUsage(data, MODEL) });
  return Response.json({ blocks: out });
}
