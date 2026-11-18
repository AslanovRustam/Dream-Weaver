// План движка ТЗ для лендинг-хаба (/landing): какой лендинг собрать и с какими
// текстами. Хаб по плану либо собирает блочный лендинг сам, либо передаёт ТЗ
// конструктору механики (колесо, слот, краш, матч) или сцены — см. LandingGenApp.
//
// Модуль без серверных зависимостей: типы и LANDING_SCENE_IDS берут и клиенты.
import { SCENES } from "@/lib/scenes/presets";
import type { TzPlanSpec } from "./types";

export type LandingPlanType = "blocks" | "wheel" | "slot" | "crash" | "match" | "scene";
export const LANDING_PLAN_TYPES: LandingPlanType[] = ["blocks", "wheel", "slot", "crash", "match", "scene"];

/** Блоки блочного лендинга (= LandingSectionId в landingGen). */
export type LandingPlanBlock = "hero" | "benefits" | "howto" | "trust" | "cta" | "footer";
export const LANDING_PLAN_BLOCKS: LandingPlanBlock[] = ["hero", "benefits", "howto", "trust", "cta", "footer"];

/** Блоки под первым экраном у механик и сцен (landingKit). */
export type LandingKitBlock = "bonuses" | "games" | "trust" | "steps" | "winners" | "timer" | "reviews" | "faq";
export const LANDING_KIT_BLOCKS: LandingKitBlock[] = ["bonuses", "games", "trust", "steps", "winners", "timer", "reviews", "faq"];

export type LandingPlanVertical = "gambling" | "betting" | "sport";

export const LANDING_SCENE_IDS: string[] = SCENES.map((s) => s.id);

export type LandingPlan = {
  type: LandingPlanType;
  /** Только для type: "scene" — id сцены (plinko, aviator…). */
  scene: string | null;
  /** Почему такой лендинг — по-русски, одна фраза. */
  why: string;
  /** Тексты — на языке лендинга. */
  headline: string;
  sub: string;
  cta: string;
  /** Оффер одной строкой, как на кнопке/плашке. */
  offer: string;
  /** Повод (Хэллоуин, финал ЛЧ) — короткая надпись над заголовком; пусто — нет. */
  occasion: string;
  vertical: LandingPlanVertical;
  /** Блочный лендинг: какие блоки включить. */
  blocks: LandingPlanBlock[];
  /** Механика / сцена: какие блоки landingKit под первым экраном. */
  kitBlocks: LandingKitBlock[];
  /** Заголовки блоков блочного лендинга — на языке лендинга. */
  titles: { benefits: string; howto: string; trust: string; cta: string };
  /** ISO-код языка лендинга. */
  language: string;
};

/**
 * Что хаб передаёт конструктору механики / сцены (handoff.decided).
 * mechanic — то же, что target; scene — только у сцены.
 */
export type LandingDecided = {
  mechanic: Exclude<LandingPlanType, "blocks">;
  scene?: string;
  why: string;
  headline: string;
  sub: string;
  cta: string;
  offer: string;
  language: string;
  kitBlocks: LandingKitBlock[];
};

const MECHANICS: Record<LandingPlanType, string> = {
  wheel:
    "classic fortune-wheel landing with its own builder: prize sectors, AI background and characters flanking the wheel; the player spins and wins the bonus (casino welcome / deposit bonus, free spins)",
  slot: "classic 3-reel slot-machine landing with its own builder: AI symbols and characters, the player spins and hits 7-7-7 (casino, slot promo, free spins)",
  crash: "crash / rocket landing: multiplier grows while the rocket flies, the player cashes out (crash games, Aviator-like promos without the Aviator look)",
  match:
    "sports match prediction landing: two teams, odds, timer and offer — buttons go to the bet (sport betting on ONE specific match / event / derby / final)",
  scene:
    "premium landing built around one of the SCENE GAMES below as the first screen, with bonuses / games / reviews / FAQ blocks under it — use when the brief names or describes one of these games (plinko, mines, chests, penalty…) or wants a premium game-like first screen the classic mechanics do not cover",
  blocks:
    "plain static promo page without a game: hero with headline + offer + button, benefits, how to start, trust, CTA, footer 18+ — ONLY when the brief explicitly wants a simple / informational / static page with no game, or no mechanic fits at all",
};

const SCENE_LIST = SCENES.map((s) => `"${s.id}" — ${s.label}: ${s.description}`).join("\n");

export const plan: TzPlanSpec = {
  tool: "landing page generator for iGaming / betting (gamified landings with a game mechanic as the first screen, or a plain promo page)",
  banners: false,
  planInstructions: [
    "decide WHICH landing to build and write its texts.",
    `type — one of: ${LANDING_PLAN_TYPES.map((t) => `"${t}" — ${MECHANICS[t]}`).join("; ")}.`,
    "Choosing rules: a game named or described in the brief wins (fortune wheel → wheel, slot → slot, crash/rocket → crash, a specific match → match, plinko/mines/chests/aviator/penalty/… → scene with that scene id). Aviator by name → scene \"aviator\"; a generic rocket/multiplier → crash. Sport betting on a concrete match → match; sport without a match but with a game (penalty, basketball, darts) → scene. Casino bonus with no game named → wheel. Plain informational page asked explicitly → blocks.",
    "scene — ONLY for type \"scene\": the scene id from this list, else null:\n" + SCENE_LIST,
    "why — one Russian sentence: why this landing fits the brief.",
    "headline (≤ 48 chars), sub (≤ 110 chars, the supporting line under the headline), cta (≤ 22 chars), offer (≤ 80 chars, the offer as it should be printed on the page, from the brief's offer; empty if the brief has no offer) — all in the landing's language, verbatim from the brief when it gives them, else strong short ones. Never invent bonus numbers.",
    "occasion — short event label above the headline (holiday, tournament, match) in the landing's language, or \"\".",
    "vertical — gambling (casino), betting (sportsbook in general) or sport (a concrete match / event).",
    `blocks — for type "blocks": which sections to include, from ${LANDING_PLAN_BLOCKS.join(", ")} (hero and footer always; drop what the brief says it does not want). For other types — all of them.`,
    `kitBlocks — for game landings: blocks under the first screen, from ${LANDING_KIT_BLOCKS.join(", ")} (default bonuses, trust, steps, reviews, faq; games for casino; timer only if the brief has a deadline; winners for casino feeds). Follow the brief if it lists sections.`,
    "titles — section titles for a blocks landing (benefits, howto, trust, cta) in the landing's language.",
    "language — ISO code of the landing's language (same as job language).",
  ].join("\n"),
  planShape:
    '{"type": string, "scene": string|null, "why": string, "headline": string, "sub": string, "cta": string, "offer": string, "occasion": string, "vertical": string, "blocks": string[], "kitBlocks": string[], "titles": {"benefits": string, "howto": string, "trust": string, "cta": string}, "language": string}',
  normalize: (raw) => normalizeLandingPlan(raw) as unknown as Record<string, unknown>,
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pickList = <T extends string>(v: unknown, allowed: T[]): T[] =>
  Array.isArray(v) ? allowed.filter((a) => v.includes(a)) : [];

/** Привести план к безопасной форме: enum-ы и сцены — только из списков. */
export function normalizeLandingPlan(raw: Record<string, unknown>): LandingPlan {
  const verticals: LandingPlanVertical[] = ["gambling", "betting", "sport"];
  const vertical = verticals.includes(raw.vertical as LandingPlanVertical) ? (raw.vertical as LandingPlanVertical) : "gambling";
  let type: LandingPlanType = LANDING_PLAN_TYPES.includes(raw.type as LandingPlanType) ? (raw.type as LandingPlanType) : "wheel";
  // Модель иногда пишет сцену в type («plinko») — это сцена.
  const sceneRaw = str(raw.scene, 24).toLowerCase() || (LANDING_SCENE_IDS.includes(String(raw.type)) ? String(raw.type) : "");
  if (!LANDING_PLAN_TYPES.includes(raw.type as LandingPlanType) && LANDING_SCENE_IDS.includes(sceneRaw)) type = "scene";
  let scene: string | null = type === "scene" && LANDING_SCENE_IDS.includes(sceneRaw) ? sceneRaw : null;
  // Сцена без валидного id: казино — колесо, спорт — блочный лендинг.
  if (type === "scene" && !scene) type = vertical === "gambling" ? "wheel" : "blocks";
  if (type !== "scene") scene = null;
  const blocks = pickList(raw.blocks, LANDING_PLAN_BLOCKS);
  for (const must of ["hero", "footer"] as const) if (!blocks.includes(must)) blocks.push(must);
  const kit = pickList(raw.kitBlocks, LANDING_KIT_BLOCKS);
  const t = raw.titles && typeof raw.titles === "object" ? (raw.titles as Record<string, unknown>) : {};
  return {
    type,
    scene,
    why: str(raw.why, 240),
    headline: str(raw.headline, 60),
    sub: str(raw.sub, 140),
    cta: str(raw.cta, 28),
    offer: str(raw.offer, 120),
    occasion: str(raw.occasion, 40),
    vertical,
    blocks: LANDING_PLAN_BLOCKS.filter((b) => blocks.includes(b)),
    kitBlocks: kit.length ? kit : ["bonuses", "trust", "steps", "reviews", "faq"],
    titles: { benefits: str(t.benefits, 60), howto: str(t.howto, 60), trust: str(t.trust, 60), cta: str(t.cta, 60) },
    language: str(raw.language, 8).toLowerCase(),
  };
}
