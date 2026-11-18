// План движка ТЗ для «Кампании»: один бриф → лендинг, плейбл, письмо и баннеры
// в одной теме. Сверх общей части задания модель решает, какие части делать,
// механику и игру лендинга, сцену плейбла, шаблон письма, тему и визуал для
// ИИ-графики, заголовок и кнопку — и объясняет каждое решение.
// Словарь решений — тот же, что у прежнего разбора ТЗ кампании (campaignTz.ts).
import type { TzPlanSpec } from "./types";

export type CampaignKind = "casino" | "sport";
export type CampaignMechanic = "scene" | "wheel" | "slot" | "crash" | "match";

export type CampaignSimplePlan = {
  kind: CampaignKind;
  kindWhy: string;
  /** Тема кампании, 1–5 слов по-русски. */
  topic: string;
  /** Арт-дирекшн для ИИ-графики (англ.). */
  visual: string;
  visualWhy: string;
  /** Заголовок на языке креативов. */
  headline: string;
  /** Заголовок дословно из ТЗ — его не переписываем. */
  headlineFromBrief: boolean;
  cta: string;
  /** Ссылка по кнопкам (трекер/оффер) — только если есть в ТЗ. */
  link: string;
  /** Выигрыш в игре: сумма и единица (500 FS, 100 €). */
  amount: number;
  unit: string;
  landing: { make: boolean; mechanic: CampaignMechanic; scene: string; why: string };
  playable: { make: boolean; scene: string; why: string };
  email: { make: boolean; template: string; why: string };
  banner: { make: boolean; why: string };
};

/** Что умеет каждая игра-сцена — для выбора по ТЗ. */
export const CAMPAIGN_SCENES: Record<string, string> = {
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
const MECHANICS: Record<CampaignMechanic, { kinds: CampaignKind[]; text: string }> = {
  scene: { kinds: ["casino", "sport"], text: "landing built around one of the scene games (best when the brief names or describes a game)" },
  wheel: { kinds: ["casino"], text: "classic fortune-wheel landing (casino only)" },
  slot: { kinds: ["casino"], text: "classic slot-machine landing (casino only)" },
  crash: { kinds: ["casino"], text: "crash/rocket multiplier landing (casino only)" },
  match: { kinds: ["sport"], text: "sports match prediction landing with odds (sport betting only)" },
};
export const CAMPAIGN_EMAIL_TEMPLATES: Record<string, string> = {
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
/** Сцены, где главный объект целиком рисует ИИ, — выглядят лучше всего. */
const BEST_SCENES: Record<CampaignKind, string[]> = { casino: ["safe", "chests", "cases", "mines", "match3"], sport: ["penalty", "basket"] };
const DEFAULT_SCENE: Record<CampaignKind, string> = { casino: "cases", sport: "penalty" };

const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `"${k}" — ${v}`).join("; ");

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const o = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const scene = (v: unknown) => (typeof v === "string" && v in CAMPAIGN_SCENES ? v : "");

export function normalizeCampaignPlan(raw: Record<string, unknown>): CampaignSimplePlan {
  const kind: CampaignKind = raw.kind === "sport" ? "sport" : "casino";
  const l = o(raw.landing), p = o(raw.playable), e = o(raw.email), bn = o(raw.banner);
  let mechanic = (typeof l.mechanic === "string" && l.mechanic in MECHANICS ? l.mechanic : "scene") as CampaignMechanic;
  if (!MECHANICS[mechanic].kinds.includes(kind)) mechanic = "scene";
  // Сцена: своя у лендинга, иначе плейбла; не из чего — лучшая по типу трафика.
  const playScene = scene(p.scene) || scene(l.scene) || DEFAULT_SCENE[kind];
  const landScene = scene(l.scene) || playScene;
  const amount = Math.round(Number(String(raw.amount ?? "").replace(/[^\d.]/g, "")));
  const link = s(raw.link, 500);
  const plan: CampaignSimplePlan = {
    kind,
    kindWhy: s(raw.kindWhy, 240),
    topic: s(raw.topic, 80),
    visual: s(raw.visual, 400),
    visualWhy: s(raw.visualWhy, 240),
    headline: s(raw.headline, 60),
    headlineFromBrief: raw.headlineFromBrief === true,
    cta: s(raw.cta, 24),
    link: /^https?:\/\/\S+$/i.test(link) ? link : "",
    amount: amount > 0 && amount < 1e9 ? amount : 0,
    unit: s(raw.unit, 12),
    landing: { make: l.make !== false, mechanic, scene: landScene, why: s(l.why, 240) },
    playable: { make: p.make !== false, scene: playScene, why: s(p.why, 240) },
    email: {
      make: e.make !== false,
      template: typeof e.template === "string" && e.template in CAMPAIGN_EMAIL_TEMPLATES ? e.template : kind === "sport" ? "express" : "welcome",
      why: s(e.why, 240),
    },
    banner: { make: bn.make !== false, why: s(bn.why, 240) },
  };
  if (!plan.landing.make && !plan.playable.make && !plan.email.make && !plan.banner.make) plan.landing.make = true;
  return plan;
}

export const plan: TzPlanSpec = {
  tool: "an iGaming ad CAMPAIGN in one style: a landing page with a mini-game, a playable ad (HTML5 mini-game), a promo email and static banners (the first banner, without texts, also becomes the email header). All graphics are drawn by AI in one theme",
  banners: true,
  planInstructions: [
    "decide how to build the whole campaign, choosing ONLY from what our product can do:",
    `  kind: "casino" or "sport" (sports betting) — from the offer/operator/brief; kindWhy (Russian).`,
    `  landing.mechanic: ${Object.entries(MECHANICS).map(([k, v]) => `"${k}" — ${v.text}`).join("; ")}.`,
    `  scene games (landing.scene when mechanic is "scene", playable.scene always): ${list(CAMPAIGN_SCENES)}.`,
    `  If the brief names or describes a game, use THAT scene for the landing (mechanic "scene") and the playable. Otherwise prefer the scenes AI draws best: casino ${BEST_SCENES.casino.join(", ")}; sport ${BEST_SCENES.sport.join(", ")}.`,
    `  email.template: ${list(CAMPAIGN_EMAIL_TEMPLATES)}.`,
    "  make (landing/playable/email/banner): if the brief explicitly lists what to make, true ONLY for those ('имитация игры' / game imitation = playable). If it does not say — true for all four. The user also ticks parts in the UI; we intersect.",
    "  topic: campaign theme in 1–5 Russian words (\"Plinko\", \"Хэллоуин\", \"финал ЛЧ\"); only what the brief says or shows, never invent a setting.",
    "  visual: 20–45 ENGLISH words of art direction for ALL campaign graphics (setting, objects, materials, light, palette) — from the references and theme; no brand names, no real people or licensed characters (the image model refuses them: describe them generically). visualWhy (Russian).",
    "  headline: landing/email headline in the creatives' language, ≤ 32 chars; verbatim from the brief if it gives one (headlineFromBrief true), else write a strong one (false).",
    "  cta: button text in the creatives' language, ≤ 20 chars (verbatim if given).",
    "  link: the click / tracking / offer URL from the brief if any, else \"\".",
    "  amount + unit: the prize the mini-game awards, from the offer (e.g. 500 + \"FS\", 100 + \"€\"); 0 and \"\" if the offer has no number.",
    "  why for each part (Russian, one sentence): why this mechanic / game / template fits the brief, or why the part is not made.",
  ].join("\n"),
  planShape:
    '{"kind":"casino"|"sport","kindWhy":string,"topic":string,"visual":string,"visualWhy":string,"headline":string,"headlineFromBrief":boolean,"cta":string,"link":string,"amount":number,"unit":string,"landing":{"make":boolean,"mechanic":string,"scene":string,"why":string},"playable":{"make":boolean,"scene":string,"why":string},"email":{"make":boolean,"template":string,"why":string},"banner":{"make":boolean,"why":string}}',
  normalize: (raw) => normalizeCampaignPlan(raw) as unknown as Record<string, unknown>,
};
