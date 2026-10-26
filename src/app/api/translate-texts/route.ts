// POST /api/translate-texts
//
// Перевод текстов кампании на язык без готового набора (немецкий, польский…):
// словарь «путь → текст» уходит в gpt-5.4-mini одним запросом и возвращается
// с теми же ключами. Кредиты не списываем — запрос текстовый и копеечный
// (~2–4k токенов на всю кампанию), а клиент кэширует результат по языку
// и отпечатку словаря; лимит частоты — как у разбора баннера.
//
// Body: { lang: string (код из EU_LANGS), texts: Record<string, string> }
// Response: { texts: Record<string, string> } — только те ключи, что пришли.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { euLang, EU_LANGS } from "@/lib/euLangs";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "gpt-5.4-mini";
const MAX_KEYS = 400;

const SYSTEM = (language: string) =>
  [
    `You localise iGaming marketing copy (casino and sports-betting landing pages, playable ads, emails) into ${language}.`,
    "You receive a JSON object of key → source text. Return a JSON object with EXACTLY the same keys and the translated texts as values.",
    "Rules:",
    "- Natural, punchy native marketing tone; keep each text about as short as the source (buttons and labels must stay short).",
    "- Keep numbers, percentages, currency symbols and codes (€, $, FS), multiplication signs (×, x2), emoji, URLs, HTML-like markup and **bold** markers exactly.",
    "- Keep line breaks (\\n) where they are.",
    "- Keep brand names, game titles and licence names (e.g. Curaçao) untranslated.",
    "- Reviewer first names and cities (keys ending in .name / .city): replace with typical ones for a country where the language is spoken.",
    "- A text ending with a space or a colon (e.g. a counter prefix) must end the same way.",
    "- 'FS' means free spins; use the usual local term or keep 'FS' if that is common in the market.",
    "- Output ONLY the JSON object.",
  ].join("\n");

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("translate-texts", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 128 * 1024);
  if (big) return big;

  let body: { lang?: unknown; texts?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lang = typeof body.lang === "string" ? body.lang : "";
  if (!EU_LANGS.some((l) => l.id === lang)) return Response.json({ error: "Неизвестный язык" }, { status: 400 });
  const src = body.texts && typeof body.texts === "object" ? (body.texts as Record<string, unknown>) : {};
  const texts: Record<string, string> = {};
  for (const [k, v] of Object.entries(src).slice(0, MAX_KEYS)) {
    if (typeof v === "string" && v.trim() && k.length <= 120) texts[k] = v.slice(0, 600);
  }
  if (!Object.keys(texts).length) return Response.json({ texts: {} });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM(euLang(lang).english) },
          { role: "user", content: JSON.stringify(texts) },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch (e) {
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!res.ok) {
    return Response.json({ error: "Provider error", detail: (await res.text()).slice(0, 300) }, { status: 502 });
  }
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Перевод пришёл в неверном формате" }, { status: 502 });
  }
  // Только запрошенные ключи и только строки; пропавшее клиент оставит на английском.
  const out: Record<string, string> = {};
  for (const k of Object.keys(texts)) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) out[k] = v.slice(0, 800);
  }

  void recordUsage(user.id, {
    model: MODEL,
    feature: "campaign-translate",
    type: "llm",
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
    totalTokens: data?.usage?.total_tokens,
    meta: { lang, keys: Object.keys(texts).length },
  });

  return Response.json({ texts: out });
}
