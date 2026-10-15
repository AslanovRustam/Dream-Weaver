// Кампания: один бриф → лендинг, плейбл, письмо и баннер в одном стиле.
//
// Бриф — бренд, оффер, ссылка, язык, тема (landingThemes) и выбор механик.
// Отсюда собираются готовые файлы (для превью и «Скачать всё») и черновики
// редакторов — чтобы любую часть можно было открыть и довести руками.
// Без ИИ: фон — рисованный фон темы, тексты — из брифа и пресетов. ИИ-графику
// каждый редактор добавляет уже у себя.

import { buildCrashHtml } from "./crashExport";
import { applyTemplate, EMAIL_TEMPLATES } from "./emailTemplates";
import { defaultExtras, type LandingExtras, type LandingKind, type LandingLang } from "./landingKit";
import { landingThemesFor, themeBackground, type LandingTheme } from "./landingThemes";
import { newDraft, type EmailDraft } from "./mailing";
import { buildMatchHtml } from "./matchExport";
import { sceneDraftKey } from "./projects";
import { wrapSceneLanding } from "./sceneLanding";
import { buildScenePlayable, type SceneConfig, type SceneId, type SceneLoader } from "./scenes/build";
import { DEFAULT_WIN_INDEX, SCENE_LANGS, scenePreset } from "./scenes/presets";
import { buildSlotHtml } from "./slotExport";
import { buildWheelHtml } from "./wheelExport";

export type CampaignLanding = "wheel" | "slot" | "crash" | "match" | "scene";

export type CampaignBrief = {
  brand: string;
  /** Лого (data URL) — необязательно. */
  logo: string;
  kind: LandingKind;
  lang: LandingLang;
  themeId: string;
  /** Заголовок первого экрана; пусто — заголовок темы. */
  headline: string;
  /** Главный оффер: «+200% к депозиту и 500 FS». */
  offer: string;
  /** Сумма и единица выигрыша в плейбле: 500 FS, 100 €. */
  amount: number;
  unit: string;
  cta: string;
  link: string;
  landing: CampaignLanding;
  /** Сцена плейбла (и лендинга, если landing === "scene"). */
  scene: SceneId;
};

const OFFER: Record<LandingKind, Record<LandingLang, string>> = {
  casino: { ru: "+200% к депозиту и 500 фриспинов", uk: "+200% до депозиту і 500 фриспінів", en: "+200% deposit bonus and 500 free spins", es: "+200% de depósito y 500 giros gratis" },
  sport: { ru: "Фрибет 100 € за первую ставку", uk: "Фрібет 100 € за першу ставку", en: "€100 free bet on your first bet", es: "Apuesta gratis de 100 € en tu primera apuesta" },
};
const CTA: Record<LandingLang, string> = { ru: "Забрать бонус", uk: "Забрати бонус", en: "Claim bonus", es: "Reclamar bono" };

export function defaultBrief(kind: LandingKind = "casino", lang: LandingLang = "ru"): CampaignBrief {
  return {
    brand: "",
    logo: "",
    kind,
    lang,
    themeId: landingThemesFor(kind)[0].id,
    headline: "",
    offer: OFFER[kind][lang],
    amount: kind === "sport" ? 100 : 500,
    unit: kind === "sport" ? "€" : "FS",
    cta: CTA[lang],
    link: "",
    landing: kind === "sport" ? "match" : "wheel",
    scene: kind === "sport" ? "penalty" : "cases",
  };
}

export function briefTheme(b: CampaignBrief): LandingTheme {
  const list = landingThemesFor(b.kind);
  return list.find((t) => t.id === b.themeId) ?? list[0];
}
export const briefHeadline = (b: CampaignBrief) => b.headline.trim() || briefTheme(b).headline[b.lang];
const brandName = (b: CampaignBrief) => b.brand.trim() || "BRAND";

/** Блоки лендинга: язык, объекты темы, оффер — первой карточкой бонусов. */
export function briefExtras(b: CampaignBrief): LandingExtras {
  const x = defaultExtras(b.lang, b.kind);
  x.look = { ...x.look, floatTheme: briefTheme(b).id };
  if (b.offer.trim()) {
    x.bonuses = { ...x.bonuses, items: x.bonuses.items.map((it, i) => (i === 0 ? { ...it, title: b.offer.trim().slice(0, 40) } : it)) };
  }
  return x;
}

const WHEEL_PRIZES = (b: CampaignBrief) => [
  { label: `${b.amount} ${b.unit}` },
  { label: "x2" },
  { label: "100 FS" },
  { label: "TRY AGAIN" },
  { label: "50 FS" },
  { label: "BONUS" },
];

/** Общие поля лендинга-механики — и для файла, и для черновика редактора. */
function mechanicCommon(b: CampaignBrief) {
  const t = briefTheme(b);
  return {
    brand: brandName(b),
    brandLogo: b.logo,
    headline: briefHeadline(b),
    accent: t.accent,
    dark: true,
    ctaText: b.cta,
    ctaUrl: b.link,
    bgImage: themeBackground(t.id),
    charLeft: "",
    charRight: "",
    extras: briefExtras(b),
  };
}

function matchFields(b: CampaignBrief) {
  return {
    sport: "football" as const,
    eventName: "",
    teamHome: "",
    teamAway: "",
    odds: { home: 1.9, draw: 3.4, away: 4.1 },
    oddsFormat: "decimal" as const,
    highlightFavourite: true,
    showOffer: true,
    prizeType: "freebet" as const,
    prizeAmount: String(b.amount),
    prizeCurrency: b.unit,
    offerText: b.offer,
    countdownMode: "minutes" as const,
    countdownMinutes: 15,
    countdownDate: "",
  };
}

/** Конфиг сцены плейбла: тексты пресета, сумма и кнопка — из брифа, фон — темы. */
export function briefScene(b: CampaignBrief): SceneConfig {
  const p = scenePreset(b.scene, b.lang);
  const loc = SCENE_LANGS.find((l) => l.id === b.lang) ?? SCENE_LANGS[0];
  return {
    scene: b.scene,
    text: { ...p.text, cta: b.cta || p.text.cta },
    amount: b.amount,
    unit: b.unit || p.unit,
    locale: loc.locale,
    clickUrl: b.link,
    legal: p.legal,
    brandName: brandName(b),
    logo: b.logo,
    bgImage: themeBackground(briefTheme(b).id),
    prizes: p.prizes,
    winIndex: DEFAULT_WIN_INDEX,
    lang: b.lang,
  };
}

/** Лендинг — готовый HTML (сцена — асинхронно: файлы сценария грузятся). */
export async function briefLandingHtml(b: CampaignBrief, load: SceneLoader): Promise<string> {
  const c = mechanicCommon(b);
  if (b.landing === "wheel") return buildWheelHtml({ ...c, prizes: WHEEL_PRIZES(b) });
  if (b.landing === "slot") return buildSlotHtml({ ...c, symbols: ["🍒", "⭐", "7", "💎", "🔔", "🍋"].map((symbol) => ({ symbol })), attempts: [b.offer || `${b.amount} ${b.unit}`] });
  if (b.landing === "crash") return buildCrashHtml({ ...c, maxAttempts: 2 });
  if (b.landing === "match") return buildMatchHtml({ ...c, ...matchFields(b) });
  const scene = await buildScenePlayable(briefScene(b), { network: "web", preview: false, load });
  return wrapSceneLanding(scene, { extras: c.extras, accent: c.accent, ctaUrl: b.link, kind: b.kind, title: c.brand });
}

export async function briefPlayableHtml(b: CampaignBrief, load: SceneLoader, network: "web" | "mraid" = "web"): Promise<string> {
  return buildScenePlayable(briefScene(b), { network, preview: network === "web", load });
}

/** Письмо: шаблон по типу трафика, тексты и цвет — из брифа. */
export function briefEmail(b: CampaignBrief): EmailDraft {
  const t = briefTheme(b);
  const tpl = EMAIL_TEMPLATES.find((x) => x.id === (b.kind === "sport" ? "express" : "welcome")) ?? EMAIL_TEMPLATES[0];
  const d = applyTemplate({ ...newDraft(), brand: brandName(b), ctaUrl: b.link }, tpl);
  const offer = b.offer.trim();
  return {
    ...d,
    name: `Кампания · ${brandName(b)}`,
    subject: offer ? `${brandName(b)}: ${offer}` : d.subject,
    heroTitle: offer ? `${briefHeadline(b)}: **${offer.toUpperCase()}**` : d.heroTitle,
    ctaText: b.cta ? b.cta.toUpperCase() : d.ctaText,
    accent: t.accent,
    ...(b.logo ? { logo: b.logo, brandMode: "logo" as const } : {}),
  };
}

/** Баннер: пресет по типу трафика и промпт из бренда, оффера и темы. */
export function briefBanner(b: CampaignBrief): { preset: string; prompt: string } {
  const t = briefTheme(b);
  return {
    preset: b.kind === "sport" ? "preset4" : "preset1",
    prompt: `${brandName(b)} — ${b.offer || briefHeadline(b)}. ${t.theme}.`,
  };
}

// ---------------------------------------------------------------- черновики редакторов

const MECH_KEY: Record<Exclude<CampaignLanding, "scene">, { key: string; route: string }> = {
  wheel: { key: "dw_wheel_draft", route: "/wheel" },
  slot: { key: "dw_slot_draft", route: "/slot" },
  crash: { key: "dw_crash_draft", route: "/crash" },
  match: { key: "dw_match_draft", route: "/match" },
};

/** Черновик сцены в формате SceneStudio (недостающее он дополнит сам). */
function sceneDraft(b: CampaignBrief, landing: boolean) {
  const c = briefScene(b);
  return {
    lang: b.lang,
    text: c.text,
    amount: c.amount,
    unit: c.unit,
    legal: c.legal,
    prizes: c.prizes ?? [],
    winIndex: DEFAULT_WIN_INDEX,
    brandName: c.brandName,
    logo: b.logo,
    clickUrl: b.link,
    targets: ["mraid"],
    bgImage: c.bgImage,
    ...(landing ? { extras: briefExtras(b) } : {}),
  };
}

/** Что записать в localStorage и куда перейти, чтобы открыть часть кампании в редакторе. */
export function briefEditorDraft(b: CampaignBrief, part: "landing" | "playable"): { writes: [string, unknown][]; route: string } {
  if (part === "playable") {
    return { writes: [[sceneDraftKey(b.scene, false), sceneDraft(b, false)]], route: `/playable?pick=scene-${b.scene}` };
  }
  if (b.landing === "scene") {
    return { writes: [[sceneDraftKey(b.scene, true), sceneDraft(b, true)]], route: `/landing/scene?pick=scene-${b.scene}` };
  }
  const m = MECH_KEY[b.landing];
  const c = mechanicCommon(b);
  const t = briefTheme(b);
  const data: Record<string, unknown> = { ...c, topic: b.offer, theme: t.theme };
  if (b.landing === "wheel") data.prizes = WHEEL_PRIZES(b);
  if (b.landing === "slot") data.attempts = [b.offer || `${b.amount} ${b.unit}`];
  if (b.landing === "crash") data.maxAttempts = 2;
  if (b.landing === "match") Object.assign(data, matchFields(b));
  return { writes: [[m.key, data]], route: m.route };
}
