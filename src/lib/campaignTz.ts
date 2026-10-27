// Интерпретация ТЗ кампании: не просто поля, а подбор креативов под задачу.
//
// Модель читает ТЗ как маркетолог и выбирает из того, что умеет продукт:
// механику лендинга (сцена-игра, колесо, слот, crash, матч), сцену плейбла,
// шаблон письма, текст баннера, тему и визуал — и коротко объясняет каждое
// решение. Отдельно — что из ТЗ мы сделать точно не можем (например, заданный
// по шагам сценарий бросков), чтобы это не потерялось молча.
//
// Серверный модуль: вызывается из /api/parse-brief для product: "campaign".

import { OFFER_RULE } from "./offerText";

export type CampaignTzMechanic = "scene" | "wheel" | "slot" | "crash" | "match";

/** Задание на один баннер из ТЗ. */
export type CampaignTzBanner = {
  /** Как называем в интерфейсе: «Баннер 1 — статичный», «1200×628». */
  name: string;
  /** Пропорции «W:H»: 16:9, 1:1, 9:16, 1200:628… */
  aspect: string;
  /** Текст на баннере — из ТЗ дословно (сокращения раскрыты). */
  text: string;
  /** Что на баннере (англ., для генерации): атрибутика игры, персонаж, сцена. */
  visual: string;
  why: string;
};

export type CampaignTzPlan = {
  /** Что просят — одной-двумя фразами, по-русски. */
  summary: string;
  topic: string;
  /** Арт-дирекшн на английском — тема для ИИ-графики. */
  visual: string;
  headline: string;
  /** Текст на баннер (короткий). */
  bannerText: string;
  landing: { make: boolean; mechanic: CampaignTzMechanic; scene: string | null; why: string };
  playable: { make: boolean; scene: string | null; why: string };
  banner: { make: boolean; why: string };
  /**
   * Баннеры, которые просит ТЗ, — каждый своим заданием: формат, текст, что на
   * нём. Пусто — один баннер 16:9 с текстом bannerText.
   */
  banners: CampaignTzBanner[];
  email: { make: boolean; template: string; why: string };
  /** Требования ТЗ, которые кампания не выполнит как написано. */
  notes: string[];
};

/** Что умеет каждая сцена — для выбора игры по ТЗ. */
const SCENES: Record<string, string> = {
  plinko: "ball drops through pegs onto multipliers at the bottom",
  wheel: "fortune wheel with prize sectors",
  slot: "3-reel slot machine",
  scratch: "scratch card revealing symbols",
  chests: "pick one of three chests",
  safe: "crack a safe with a combination dial",
  cases: "open a loot case, item strip spins",
  aviator: "crash game: plane flies up, multiplier grows, cash out",
  mines: "grid of tiles: find gems, avoid bombs",
  roulette: "roulette wheel, bet on red",
  penalty: "football penalty kick past a goalkeeper",
  basket: "basketball shot into the hoop",
  darts: "darts thrown at a prize board",
  dice: "roll two dice for a double",
  claw: "claw machine grabs a prize",
  memory: "find matching card pairs",
  catcher: "catch falling coins with a pot",
  cut: "slice flying objects",
  blast: "tap groups of gems to blast them",
  match3: "match-three gems",
  quiz: "answer a bonus quiz",
};
const MECHANICS: Record<CampaignTzMechanic, string> = {
  scene: "landing built around one of the scene games above (best when the brief names a specific game)",
  wheel: "classic fortune-wheel landing (casino)",
  slot: "classic slot-machine landing (casino)",
  crash: "crash/rocket multiplier landing (casino)",
  match: "sports match prediction landing with odds (sport betting)",
};
const EMAIL_TEMPLATES: Record<string, string> = {
  welcome: "welcome bonus for new players (registration / first deposit)",
  freespins: "free spins in a slot",
  reactivation: "win back inactive players",
  tournament: "tournament / leaderboard",
  cashback: "weekly cashback",
  match: "bet on a specific match",
  reload: "deposit (reload) bonus for existing players",
  birthday: "birthday gift",
  vip: "VIP invitation",
  "deposit-reminder": "unfinished deposit reminder",
  express: "accumulator booster (sport)",
  "level-up": "loyalty level up",
  jackpot: "jackpot drop",
  minimal: "minimal neutral promo",
};

const SYSTEM = [
  "You are a senior iGaming performance marketer. You read a client's brief (ТЗ, any language) for an ad campaign and choose the creatives our product should build so they fit the brief best.",
  "Our product builds four parts: a landing page, a playable ad, a 16:9 banner and a promo email. Choose from ONLY these options:",
  `Landing mechanics: ${Object.entries(MECHANICS).map(([k, v]) => `"${k}" — ${v}`).join("; ")}.`,
  `Scene games (for landing mechanic "scene" and for the playable): ${Object.entries(SCENES).map(([k, v]) => `"${k}" — ${v}`).join("; ")}.`,
  `Email templates: ${Object.entries(EMAIL_TEMPLATES).map(([k, v]) => `"${k}" — ${v}`).join("; ")}.`,
  "Rules:",
  "- If the brief explicitly lists what to make, make ONLY those parts (a 'game imitation' / 'имитация игры' is the playable). If it does not say, recommend the parts that make sense for the goal.",
  "- If the brief names or describes a game, use that scene game for the landing (mechanic \"scene\") and for the playable.",
  "- The brand is the casino/bookmaker operator (from the site), never a game title like Plinko or Aviator.",
  "- Texts (headline, bannerText) in the language of the creatives the brief asks for; why/summary/notes in Russian.",
  `- ${OFFER_RULE}`,
  "- banners: EVERY banner the brief asks for, one entry each — different sizes, formats (static / game-like), texts or variants (\"1x\", \"2x\", \"баннер 1\", sizes like 1200×628) are separate banners. If the brief gives one banner or none — one entry (16:9). Max 6.",
  "- notes: requirements of the brief our product cannot follow exactly as written (e.g. a scripted sequence of outcomes per throw, several different popups, a specific game reference look), in Russian, short. Empty array if none.",
  "Return STRICT JSON:",
  '{"summary": string, "topic": string (the campaign theme in 1-5 Russian words, e.g. "Plinko", "Хэллоуин", "финал ЛЧ"; only what the brief says, never invent a setting), "visual": string (15-40 English words of art direction), "headline": string (<=32 chars), "bannerText": string (the banner text from the brief word for word if it gives one (only shorthand expanded per the rule below), else <=60 chars),',
  ' "landing": {"make": boolean, "mechanic": string, "scene": string|null, "why": string},',
  ' "playable": {"make": boolean, "scene": string|null, "why": string},',
  ' "banner": {"make": boolean, "why": string},',
  ' "banners": [{"name": string (short, Russian), "aspect": string ("W:H", e.g. "16:9", "1:1", "9:16", "1200:628"), "text": string (text on this banner, word for word from the brief with shorthand expanded), "visual": string (10-30 English words: what this banner shows), "why": string (Russian)}],',
  ' "email": {"make": boolean, "template": string, "why": string},',
  ' "notes": string[]}',
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const scene = (v: unknown) => (typeof v === "string" && v in SCENES ? v : null);

/** «1200x628», «1200×628», «16/9» → «1200:628», «16:9»; непонятное — 16:9. */
export function normAspect(v: unknown): string {
  const m = typeof v === "string" ? /(\d{1,4})\s*[:x×х/*]\s*(\d{1,4})/i.exec(v) : null;
  if (!m) return "16:9";
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h || w / h > 4 || h / w > 4) return "16:9";
  return `${w}:${h}`;
}

function normalizeBanners(raw: unknown): CampaignTzBanner[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 6)
    .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {}))
    .map((b, i) => ({
      name: str(b.name, 60) || `Баннер ${i + 1}`,
      aspect: normAspect(b.aspect),
      text: str(b.text, 120),
      visual: str(b.visual, 300),
      why: str(b.why, 200),
    }));
}

/** Проверить и привести ответ модели к плану; мусор — к безопасным значениям. */
export function normalizeTzPlan(raw: unknown): CampaignTzPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, Record<string, unknown> | unknown>;
  const part = (k: string) => (j[k] && typeof j[k] === "object" ? (j[k] as Record<string, unknown>) : {});
  const l = part("landing"), p = part("playable"), bn = part("banner"), e = part("email");
  const mechanic = (typeof l.mechanic === "string" && l.mechanic in MECHANICS ? l.mechanic : "scene") as CampaignTzMechanic;
  const plan: CampaignTzPlan = {
    summary: str(j.summary, 300),
    topic: str(j.topic, 200),
    visual: str(j.visual, 400),
    headline: str(j.headline, 40),
    bannerText: str(j.bannerText, 80),
    landing: { make: l.make !== false, mechanic, scene: scene(l.scene), why: str(l.why, 240) },
    playable: { make: p.make !== false, scene: scene(p.scene), why: str(p.why, 240) },
    banner: { make: bn.make !== false, why: str(bn.why, 240) },
    email: { make: e.make !== false, template: typeof e.template === "string" && e.template in EMAIL_TEMPLATES ? e.template : "welcome", why: str(e.why, 240) },
    banners: normalizeBanners(j.banners),
    notes: Array.isArray(j.notes) ? (j.notes as unknown[]).map((n) => str(n, 200)).filter(Boolean).slice(0, 6) : [],
  };
  // Сцена-механика без сцены — берём сцену плейбла; не из чего — колесо.
  if (plan.landing.mechanic === "scene" && !plan.landing.scene) plan.landing.scene = plan.playable.scene;
  if (plan.landing.mechanic === "scene" && !plan.landing.scene) plan.landing.mechanic = "wheel";
  if (!plan.landing.make && !plan.playable.make && !plan.banner.make && !plan.email.make) plan.landing.make = true;
  return plan;
}

/** Интерпретировать ТЗ (gpt-5.4-mini). null — модель не ответила, остаются поля ТЗ. */
export async function interpretCampaignTz(brief: string, apiKey: string): Promise<{ plan: CampaignTzPlan | null; usage: unknown }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `ТЗ:\n"""${brief}"""` },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return { plan: null, usage: null };
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  try {
    return { plan: normalizeTzPlan(JSON.parse(data?.choices?.[0]?.message?.content || "{}")), usage: data };
  } catch {
    return { plan: null, usage: data };
  }
}
