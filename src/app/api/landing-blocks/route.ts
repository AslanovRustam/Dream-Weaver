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

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gpt-5.4-mini";

/** Что вернуть по каждому блоку — для промпта. */
const SHAPES: Record<string, string> = {
  timer: '{"text": "short urgency line before a countdown, <=40 chars"}',
  bonuses: '{"title": "<=40", "items": [4 × {"title": "bonus name with numbers, <=28", "text": "<=60"}]}',
  jackpot: '{"title": "<=40, a growing jackpot / prize pool headline"}',
  express:
    '{"title": "<=30", "items": [3 × {"match": "Team A — Team B", "pick": "outcome, <=20", "odd": "decimal like 1.85"}]} — an accumulator: 3 DIFFERENT matches (never the same match twice); if the theme names a match, it goes first with its real teams, the other two are other plausible matches of the same league or day',
  promo: '{"title": "<=32", "code": "LATIN UPPERCASE 6-12 chars, themed", "text": "what the code gives, <=80"}',
  games: '{"title": "<=32", "items": [8 × {"title": "slot or match name, <=22", "sub": "RTP 96.5% or kick-off time, <=16"}]}',
  features: '{"title": "<=36", "items": [4 × {"title": "<=24", "text": "<=60"}]}',
  steps: '{"title": "<=36", "items": [3 short steps, each <=40]}',
  tournament: '{"title": "<=36", "prize": "prize pool with currency, <=16", "text": "<=90"}',
  vip: '{"title": "<=24", "items": [4 × {"name": "tier name, <=14", "perk": "<=56"}]}',
  reviews: '{"title": "<=32", "items": [3 × {"name": "first name", "city": "city", "text": "<=110"}]}',
  app: '{"title": "<=32", "text": "<=90"}',
  faq: '{"title": "<=32", "items": [3 × {"q": "<=70", "a": "<=180"}]}',
  final: '{"title": "<=36", "text": "<=100", "button": "<=22"}',
};

type Obj = Record<string, unknown>;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Привести ответ модели к ожидаемым полям; пустое — выбросить (клиент оставит своё). */
function clean(id: string, raw: Obj): Obj | null {
  const o: Obj = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === "string" ? v : Array.isArray(v) ? v.length : v) o[k] = v;
  };
  const items = <T,>(max: number, f: (it: Obj) => T | null) => arr(raw.items, max).map((it) => f(obj(it))).filter((x): x is T => !!x);
  if (id !== "timer") put("title", s(raw.title, 48));
  switch (id) {
    case "timer": put("text", s(raw.text, 48)); break;
    case "bonuses": put("items", items(4, (it) => (s(it.title, 32) ? { title: s(it.title, 32), text: s(it.text, 70) } : null))); break;
    case "express":
      put("items", items(5, (it) => (s(it.match, 48) ? { match: s(it.match, 48), pick: s(it.pick, 28), odd: /^\d{1,2}([.,]\d{1,2})?$/.test(s(it.odd, 6)) ? s(it.odd, 6).replace(",", ".") : "1.80" } : null)));
      break;
    case "promo": put("code", s(raw.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, "")); put("text", s(raw.text, 100)); break;
    case "games": put("items", items(8, (it) => (s(it.title, 24) ? { title: s(it.title, 24), sub: s(it.sub, 18) } : null))); break;
    case "features": put("items", items(4, (it) => (s(it.title, 28) ? { title: s(it.title, 28), text: s(it.text, 70) } : null))); break;
    case "steps": put("items", arr(raw.items, 3).map((t) => s(t, 48)).filter(Boolean)); break;
    case "tournament": put("prize", s(raw.prize, 20)); put("text", s(raw.text, 110)); break;
    case "vip": put("items", items(4, (it) => (s(it.name, 16) ? { name: s(it.name, 16), perk: s(it.perk, 64) } : null))); break;
    case "reviews": put("items", items(3, (it) => (s(it.text, 140) ? { name: s(it.name, 20), city: s(it.city, 20), text: s(it.text, 140) } : null))); break;
    case "app": put("text", s(raw.text, 110)); break;
    case "faq": put("items", items(3, (it) => (s(it.q, 80) ? { q: s(it.q, 80), a: s(it.a, 220) } : null))); break;
    case "final": put("text", s(raw.text, 120)); put("button", s(raw.button, 24)); break;
  }
  return Object.keys(o).length ? o : null;
}

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
