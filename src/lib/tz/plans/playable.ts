// План движка ТЗ для плейбла на премиум-сцене (/playable) и лендинга на сцене
// (/landing/scene): какую сцену-игру взять и почему, все тексты сцены на языке
// креатива, сумма и единица в попапе, сектора колеса, юр. строка, тема для
// ИИ-графики (англ.) и площадки размещения. Каталог сцен — из пресетов сцен,
// собирается при загрузке модуля: новая сцена попадёт сюда сама.
import type { SceneId } from "@/lib/scenes/build";
import { SCENES } from "@/lib/scenes/presets";
import type { TzPlanSpec } from "./types";

/** Что происходит в сцене — по-английски, для выбора игры по ТЗ (нет в списке — берём русское описание). */
const SCENE_EN: Partial<Record<SceneId, string>> = {
  safe: "crack a safe: first taps fail, the third opens the door to gold (universal casino welcome bonus)",
  wheel: "fortune wheel with prize sectors: first spin is one step from the jackpot, second lands on it (universal casino bonus)",
  scratch: "scratch card: the finger wipes the foil, three matching coins appear",
  slot: "3-reel slot machine, second spin hits three in a row (slots / free spins offers)",
  chests: "pick one of three chests, they shuffle, the second pick wins",
  aviator: "crash game: plane flies up, multiplier grows, cash out in time (Aviator / crash games)",
  plinko: "ball drops through pegs onto multipliers at the bottom (Plinko)",
  memory: "find matching card pairs",
  catcher: "catch falling coins with a pot",
  basket: "basketball shot into the hoop — free bet (sports betting, basketball)",
  penalty: "football penalty kick past a goalkeeper — free bet (sports betting, football)",
  roulette: "roulette wheel, bet on red (live casino / roulette)",
  mines: "grid of tiles: find gems, avoid bombs, multiplier grows (Mines)",
  cases: "open a loot case, item strip spins (CS-style cases)",
  claw: "claw machine grabs a prize",
  darts: "darts thrown at a prize board",
  dice: "roll two dice for a double six",
  cut: "slice flying coins, avoid bombs",
  blast: "tap groups of gems to blast them",
  match3: "match-three gems",
  quiz: "answer a bonus quiz question (question + one right and two wrong answers)",
};

export const PLAYABLE_SCENE_IDS: SceneId[] = SCENES.map((s) => s.id);

const CATALOG = SCENES.map(
  (s) =>
    `${s.id} — ${SCENE_EN[s.id] ?? s.description}. texts: ${s.fields.map((f) => `${f.key} «${f.label}»${f.multiline ? " (may use \\n)" : ""}`).join(", ")}`,
).join("\n");

const NETWORKS = ["mraid", "google", "meta", "web"] as const;

export const plan: TzPlanSpec = {
  tool: "interactive playable ad mini-game built on one of the premium scene games below (finished choreography, AI art in one theme, export for ad networks); the same scene can also be the first screen of a landing page",
  banners: false,
  planInstructions: [
    "decide the playable for this brief.",
    "scene: the ONE scene id from the SCENE CATALOG that fits the brief best — the game the brief names or shows on references first (crash/Aviator → aviator, Plinko → plinko, Mines → mines, slots/free spins → slot or wheel, roulette → roulette, football betting → penalty, basketball → basket, quiz → quiz); generic casino welcome bonus → wheel, safe or chests; sports betting without a sport → penalty. why: one Russian sentence why this scene.",
    "texts: EVERY text key of the chosen scene, in the creatives' language. Offer words verbatim from the brief where they fit. title — the headline, ≤ 40 chars, may be split into two lines with \\n; cta — popup button, ≤ 20 chars; bonus — short line above the amount in the win popup («Your bonus:»); counter keys (…Left, spins, pairs, mult, sum, caught…) end with «: » or a space because a number follows; other keys ≤ 28 chars, punchy.",
    "headline / cta / bonusLabel: the same as texts.title / texts.cta / texts.bonus.",
    "amount: the main number of the offer, counted up in the win popup (500 for «500 FS», 5000000 for «5 000 000 so‘m», 200 for «200%»); unit: what it counts, short, in the creatives' language («фриспинов», «FS», «€», «so‘m», «%»). No offer in the brief → amount 500, unit free spins in that language, and say so in assumptions.",
    "prizes: only for scene wheel — 6–8 short sector labels (≤ 12 chars) in the creatives' language built from the offer; winPrize — index of the sector the wheel lands on (the main offer). Other scenes: prizes [] and winPrize 0.",
    "legal: the legal line verbatim from the brief (18+, T&C…), else a short standard one in the creatives' language.",
    "theme: ENGLISH visual theme for the AI art of the whole scene (background, game objects, reward): concrete setting, materials, colours, light and mood taken from the references and the brief's style; ≤ 250 chars; never brand names, real people or licensed characters (the image model refuses them) — describe them generically.",
    "networks: where the playable runs, only if the brief says it: AppLovin / Unity / ironSource / Mintegral / Liftoff / Vungle / any MRAID network → mraid; Google Ads → google; Facebook / Instagram / Meta → meta; own site / landing → web. Nothing said → [].",
    "\nSCENE CATALOG (id — what happens. texts: key «what it is»):\n" + CATALOG,
  ].join("\n  "),
  planShape:
    "{scene:string, why:string, language:string, headline:string, cta:string, bonusLabel:string, amount:number, unit:string, texts:{[key:string]:string}, prizes:string[], winPrize:number, legal:string, theme:string, networks:string[]}",
  normalize: (raw) => normalizePlayablePlan(raw),
};

export type PlayablePlan = {
  scene: SceneId;
  why: string;
  language: string;
  headline: string;
  cta: string;
  bonusLabel: string;
  amount: number;
  unit: string;
  texts: Record<string, string>;
  prizes: string[];
  winPrize: number;
  legal: string;
  theme: string;
  networks: (typeof NETWORKS)[number][];
};

/** Строка без лишних пробелов; переводы строк — только если разрешены (заголовок). */
const str = (v: unknown, max: number, lines = false) =>
  typeof v === "string"
    ? (lines ? v.replace(/\\n/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{2,}/g, "\n") : v.replace(/\s+/g, " ")).trim().slice(0, max)
    : "";

export function normalizePlayablePlan(raw: Record<string, unknown>): PlayablePlan {
  const scene = (PLAYABLE_SCENE_IDS as string[]).includes(String(raw.scene)) ? (raw.scene as SceneId) : "wheel";
  const meta = SCENES.find((s) => s.id === scene)!;
  const t = raw.texts && typeof raw.texts === "object" ? (raw.texts as Record<string, unknown>) : {};
  const texts: Record<string, string> = {};
  for (const f of meta.fields) {
    // Счётчики идут перед числом — хвостовой пробел нужен, поэтому без trim справа.
    const v = typeof t[f.key] === "string" ? (t[f.key] as string) : "";
    const clean = f.multiline ? str(v, 80, true) : v.replace(/\s+/g, " ").replace(/^\s+/, "").slice(0, 48);
    if (clean.trim()) texts[f.key] = clean;
  }
  const headline = str(raw.headline, 80, true);
  const cta = str(raw.cta, 28);
  const bonusLabel = str(raw.bonusLabel, 48);
  if (headline && !texts.title) texts.title = headline;
  if (cta && !texts.cta) texts.cta = cta;
  if (bonusLabel && !texts.bonus) texts.bonus = bonusLabel;
  const amount = Math.round(Number(raw.amount));
  const prizes =
    scene === "wheel" && Array.isArray(raw.prizes)
      ? raw.prizes.map((p) => str(p, 12)).filter(Boolean).slice(0, 12)
      : [];
  const okPrizes = prizes.length >= 4 ? prizes : [];
  const win = Math.round(Number(raw.winPrize));
  return {
    scene,
    why: str(raw.why, 240),
    language: str(raw.language, 8),
    headline: texts.title ?? "",
    cta: texts.cta ?? "",
    bonusLabel: texts.bonus ?? "",
    amount: Number.isFinite(amount) && amount > 0 ? Math.min(amount, 1_000_000_000) : 0,
    unit: str(raw.unit, 24),
    texts,
    prizes: okPrizes,
    winPrize: okPrizes.length && win >= 0 && win < okPrizes.length ? win : 0,
    legal: str(raw.legal, 240),
    theme: str(raw.theme, 300),
    networks: Array.isArray(raw.networks)
      ? [...new Set(raw.networks.filter((n): n is PlayablePlan["networks"][number] => (NETWORKS as readonly string[]).includes(String(n))))]
      : [],
  };
}
