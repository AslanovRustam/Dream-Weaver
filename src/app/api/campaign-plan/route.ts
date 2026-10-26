// POST /api/campaign-plan
//
// Кампания «всё в одном»: пользователь задаёт только тематику («викинги»,
// «Хэллоуин», «финал Лиги чемпионов») — остальное подбирается здесь одним
// запросом gpt-5.4-mini: сцена (механика) из разрешённого списка, описание
// визуала на английском для ИИ-графики и заголовок первого экрана на языке
// кампании. Кредиты не списываем — запрос текстовый и копеечный; лимит частоты.
//
// Body: { theme: string, kind: "casino" | "sport", lang: string, scenes: string[] }
// Response: { scene: string, visual: string, headline: string }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { euLang } from "@/lib/euLangs";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gpt-5.4-mini";

/** Что умеет каждая сцена — чтобы модель выбирала механику по смыслу темы. */
const SCENE_HINTS: Record<string, string> = {
  safe: "crack a vault / safe with a combination dial — heists, banks, treasure rooms, secrets",
  chests: "pick one of three treasure chests — pirates, adventure, fantasy loot, magic",
  cases: "open a loot case with a spinning item strip — esports, gaming, cyber, collectibles",
  mines: "reveal gems on a grid while avoiding bombs — mining, crystals, danger, caves, space",
  match3: "match-three gems on a board — candy, jewels, bright cheerful worlds, fruit",
  penalty: "score a football penalty past a goalkeeper — football, stadiums, finals, heroes",
  basket: "shoot a basketball into the hoop — basketball, streetball, arenas",
  // Остальные — когда игру задали в ТЗ (тогда список из одной сцены).
  plinko: "drop a ball through a peg board onto multipliers — plinko",
  wheel: "spin a fortune wheel", slot: "spin slot reels", scratch: "scratch a card", aviator: "a plane flies up while the multiplier grows",
  memory: "find matching card pairs", catcher: "catch falling coins in a pot", roulette: "spin a roulette wheel", claw: "grab a prize with a claw machine",
  darts: "throw darts at a prize board", dice: "roll two dice", cut: "slice flying objects", blast: "tap groups of gems to blast them", quiz: "answer a bonus quiz",
};

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("campaign-plan", user.id, 30, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 8 * 1024);
  if (big) return big;

  let body: { theme?: unknown; kind?: unknown; lang?: unknown; scenes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 200) : "";
  if (!theme) return Response.json({ error: "Нужна тематика" }, { status: 400 });
  const kind = body.kind === "sport" ? "sport" : "casino";
  const lang = typeof body.lang === "string" ? body.lang : "ru";
  const scenes = (Array.isArray(body.scenes) ? body.scenes : []).filter((s): s is string => typeof s === "string" && s in SCENE_HINTS).slice(0, 10);
  if (!scenes.length) return Response.json({ error: "Нет сцен" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const system = [
    `You plan a ${kind === "sport" ? "sports-betting" : "online casino"} ad campaign (landing page, playable ad, banner) from ONE theme the marketer typed (any language).`,
    'Return JSON {"scene": string, "visual": string, "headline": string}.',
    `- scene: the ONE game mechanic that fits the theme best, chosen ONLY from: ${scenes.map((s) => `"${s}" (${SCENE_HINTS[s]})`).join("; ")}.`,
    "- visual: 15-40 English words describing the art direction for every image of the campaign: setting, materials, colour palette, lighting, mood. Keep proper names from the theme (characters, franchises, events) as they are.",
    `- headline: a punchy hero headline in ${euLang(lang).english}, max 32 characters, upper case, about the theme and the bonus; no quotes, no emoji.`,
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
          { role: "user", content: `Theme: ${theme}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch (e) {
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Provider error", detail: (await res.text()).slice(0, 300) }, { status: 502 });
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;
  let j: { scene?: unknown; visual?: unknown; headline?: unknown } = {};
  try {
    j = JSON.parse(data?.choices?.[0]?.message?.content || "{}") as typeof j;
  } catch {
    /* ниже — запасные значения */
  }
  // Модель ошиблась со сценой — первая из разрешённых; визуал — сама тема.
  const scene = typeof j.scene === "string" && scenes.includes(j.scene) ? j.scene : scenes[0];
  const visual = typeof j.visual === "string" && j.visual.trim() ? j.visual.trim().slice(0, 400) : theme;
  const headline = typeof j.headline === "string" ? j.headline.trim().replace(/^["«]|["»]$/g, "").slice(0, 40) : "";

  void recordUsage(user.id, {
    model: MODEL,
    feature: "campaign-plan",
    type: "llm",
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
    totalTokens: data?.usage?.total_tokens,
    meta: { kind, lang, scene },
  });
  return Response.json({ scene, visual, headline });
}
