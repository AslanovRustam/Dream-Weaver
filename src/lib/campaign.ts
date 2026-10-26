// Кампания: один бриф → лендинг, плейбл, письмо и баннер в одном стиле.
//
// Бриф — бренд, оффер, ссылка, язык, референс и выбор механик. Референс —
// картинка, по которой собирается кампания: с неё берутся цвета (или
// пипеткой), фон (размытый реф) и описание сцены — оно уходит темой в
// редакторы, чтобы «Вся графика под тему» рисовала в стиле рефа. Отсюда
// собираются готовые файлы (для превью и «Скачать всё») и черновики
// редакторов — чтобы любую часть можно было открыть и довести руками.
//
// Язык — любой европейский: у ru/uk/en/es готовые тексты, остальные собираются
// на английском наборе с переводом поверх (campaignI18n.ts, brief.i18n).
//
// «Мне повезёт» (brief.art): одной кнопкой — тема (с рефа или случайная),
// лендинг на сцене и вся графика от ИИ — фон, детали сцены, символы, награда,
// картинки бонусов и игр. Одни и те же картинки идут в лендинг и в плейбл.

import { buildCrashHtml } from "./crashExport";
import { applyFlat, campaignSource, kitStringsFrom, type CampaignI18n } from "./campaignI18n";
import { applyTemplate, EMAIL_TEMPLATES } from "./emailTemplates";
import { baseLang, euLang, isBuiltInLang } from "./euLangs";
import { accentFromPalette, paletteFromHex, uiFromPalette, wheelFromPalette, type ImagePalette } from "./imagePalette";
import { defaultExtras, type LandingExtras, type LandingKind, type LandingLang } from "./landingKit";
import { newDraft, type EmailDraft } from "./mailing";
import { buildMatchHtml } from "./matchExport";
import { sceneDraftKey } from "./projects";
import { wrapSceneLanding } from "./sceneLanding";
import { buildScenePlayable, type SceneConfig, type SceneId, type SceneLoader } from "./scenes/build";
import type { FrameArt } from "./scenes/art";
import { DEFAULT_WIN_INDEX, scenePreset } from "./scenes/presets";
import { buildSlotHtml } from "./slotExport";
import { buildWheelHtml } from "./wheelExport";

export type CampaignLanding = "wheel" | "slot" | "crash" | "match" | "scene";

export type CampaignBrief = {
  /**
   * Тематика кампании своими словами («викинги», «Хэллоуин», «финал ЛЧ») —
   * главный ввод: по ней подбираются сцена, визуал для ИИ и заголовок
   * (/api/campaign-plan), и рисует «Мне повезёт». Пусто — тема с рефа или случайная.
   */
  topic: string;
  /** Заголовок, подобранный по тематике; свой заголовок (headline) главнее. */
  autoHeadline: string;
  brand: string;
  /** Лого (data URL) — необязательно. */
  logo: string;
  kind: LandingKind;
  /** Код языка из EU_LANGS. */
  lang: string;
  /** Заголовок первого экрана; пусто — заголовок по умолчанию. */
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
  /** Референс — картинка, по которой собирается кампания (data URL, ужатая). Пусто — без рефа. */
  ref: string;
  /** Сцена и настроение рефа (англ.), из разбора картинки: тема для ИИ в редакторах и промпт баннера. */
  refScene: string;
  /** Палитра рефа — считается в браузере при загрузке. */
  refPalette?: ImagePalette | null;
  /** Цвет пипетки или палитры — главнее рефа. */
  pickColor?: string;
  /** Фон из рефа, уже готовый (размытый реф). Не сохраняется. */
  bg?: string;
  /** Переводы для языка без готовых текстов (campaignI18n). Не сохраняется. */
  i18n?: CampaignI18n;
  /** Графика «Мне повезёт». Хранится отдельно (IndexedDB) — в localStorage не влезает. */
  art?: CampaignArt | null;
};

/** Графика кампании от ИИ — общая для лендинга на сцене и плейбла. */
export type CampaignArt = {
  /** Сцена, под которую нарисованы детали: у другой сцены они не подойдут (фон и блоки — подойдут). */
  scene: SceneId;
  /** Тема, по которой рисовали, — подпись в интерфейсе и тема для редакторов. */
  theme: string;
  /** Название темы для людей. */
  themeName: string;
  bg?: string;
  reward?: string;
  symbols?: string[];
  art?: Record<string, string | FrameArt>;
  /** Картинки карточек бонусов — по порядку карточек с заголовками. */
  bonusImgs?: string[];
  /** Обложки игр (или иконки матчей) — по порядку. */
  gameImgs?: string[];
  /** Палитра сгенерированного фона — гамма, если нет рефа и пипетки. */
  palette?: ImagePalette | null;
  /** Баннер 16:9 в той же теме (генератор баннеров). */
  banner?: string;
};

/** Сцены для «Мне повезёт»: те, где главное на экране целиком рисует ИИ, а не вектор. */
export const LUCKY_SCENES: Record<LandingKind, SceneId[]> = {
  casino: ["safe", "chests", "cases", "mines", "match3"],
  sport: ["penalty", "basket"],
};
/** Темы для «Мне повезёт» без рефа: насыщенные сеттинги, в которых ИИ рисует красиво. */
export const LUCKY_THEMES: Record<LandingKind, { name: string; prompt: string }[]> = {
  casino: [
    { name: "Египет фараонов", prompt: "ancient Egypt: golden pharaoh tomb, scarabs, turquoise and lapis lazuli, warm torchlight" },
    { name: "Викинги", prompt: "Norse vikings: carved oak and forged iron, runes, frost and firelight, northern lights" },
    { name: "Лунный Новый год", prompt: "lunar new year: red lanterns, jade dragons, gold coins, night festival glow" },
    { name: "Пиратская бухта", prompt: "pirate cove: treasure cave, weathered wood and brass, emerald sea glow, candlelight" },
    { name: "Олимп", prompt: "Greek Olympus: white marble temples, gold laurels, lightning, bright sky blue" },
    { name: "Храм ацтеков", prompt: "Aztec jungle temple: carved stone glyphs, jade, quetzal feathers, golden sun" },
    { name: "Киберпанк", prompt: "neon cyberpunk city: holograms, chrome, magenta and cyan neon in the rain" },
    { name: "Конфетное королевство", prompt: "candy kingdom: glossy sweets, pastel pink and mint, sugar glitter, soft daylight" },
    { name: "Дикий Запад", prompt: "wild west saloon: desert sunset, tooled leather, copper and brass, dusty gold light" },
    { name: "Ведьмин лес", prompt: "witch's Halloween forest: carved pumpkins, purple mist, glowing potions, moonlight" },
    { name: "Атлантида", prompt: "sunken Atlantis: pearls and coral, bioluminescent teal, sunken gold, deep ocean light" },
    { name: "Ирландская удача", prompt: "Irish luck: emerald hills, four-leaf clovers, rainbow, pots of gold, soft sunlight" },
  ],
  sport: [
    { name: "Ночной стадион", prompt: "night football stadium under floodlights, light rain, wet grass reflections, electric atmosphere" },
    { name: "Финал чемпионата", prompt: "championship final: golden confetti, trophy glow, packed stands, dramatic spotlights" },
    { name: "Уличный неон", prompt: "street football court in a neon city at night, graffiti walls without text, magenta and cyan glow" },
    { name: "Пляж на закате", prompt: "beach sports at sunset: golden sand, palm silhouettes, warm orange and pink sky" },
    { name: "Ледовая арена", prompt: "winter ice arena: frosted blue lights, crisp white ice, cold steel and glass" },
  ],
};

export type LuckyRoll = { scene: SceneId; theme: string; themeName: string };

/** Случайная сцена и тема (не повторяя прошлую); есть реф — тема с него. */
export function luckyRoll(kind: LandingKind, refScene: string, prev?: LuckyRoll | null, rnd: () => number = Math.random): LuckyRoll {
  const pick = <T,>(list: T[], not?: (x: T) => boolean): T => {
    const pool = list.length > 1 && not ? list.filter((x) => !not(x)) : list;
    return pool[Math.floor(rnd() * pool.length) % pool.length];
  };
  const scene = pick(LUCKY_SCENES[kind], (s) => s === prev?.scene);
  if (refScene.trim()) return { scene, theme: refScene.trim(), themeName: "по рефу" };
  const t = pick(LUCKY_THEMES[kind], (x) => x.prompt === prev?.theme);
  return { scene, theme: t.prompt, themeName: t.name };
}

const OFFER: Record<LandingKind, Record<LandingLang, string>> = {
  casino: { ru: "+200% к депозиту и 500 фриспинов", uk: "+200% до депозиту і 500 фриспінів", en: "+200% deposit bonus and 500 free spins", es: "+200% de depósito y 500 giros gratis" },
  sport: { ru: "Фрибет 100 € за первую ставку", uk: "Фрібет 100 € за першу ставку", en: "€100 free bet on your first bet", es: "Apuesta gratis de 100 € en tu primera apuesta" },
};
const CTA: Record<LandingLang, string> = { ru: "Забрать бонус", uk: "Забрати бонус", en: "Claim bonus", es: "Reclamar bono" };
const HEADLINE: Record<LandingKind, Record<LandingLang, string>> = {
  casino: { ru: "ЗАБЕРИ СВОЙ БОНУС", uk: "ЗАБЕРИ СВІЙ БОНУС", en: "CLAIM YOUR BONUS", es: "RECLAMA TU BONO" },
  sport: { ru: "ФРИБЕТ НА ПЕРВУЮ СТАВКУ", uk: "ФРІБЕТ НА ПЕРШУ СТАВКУ", en: "FREE BET ON YOUR FIRST BET", es: "APUESTA GRATIS EN TU PRIMERA APUESTA" },
};
/** Акцент без рефа и пипетки. */
const DEFAULT_ACCENT: Record<LandingKind, string> = { casino: "#f5b324", sport: "#22c55e" };

/** Умолчания текстов брифа на этом языке: готовые — или перевод, когда он уже пришёл. */
export function briefDefaults(kind: LandingKind, lang: string, tr: CampaignI18n = {}) {
  const base = baseLang(lang);
  return {
    offer: tr["brief.offer"] ?? OFFER[kind][base],
    cta: tr["brief.cta"] ?? CTA[base],
    headline: tr["brief.headline"] ?? HEADLINE[kind][base],
  };
}

export function defaultBrief(kind: LandingKind = "casino", lang = "ru"): CampaignBrief {
  const d = briefDefaults(kind, lang);
  return {
    topic: "",
    autoHeadline: "",
    brand: "",
    logo: "",
    kind,
    lang,
    headline: "",
    offer: d.offer,
    amount: kind === "sport" ? 100 : 500,
    unit: kind === "sport" ? "€" : "FS",
    cta: d.cta,
    link: "",
    landing: kind === "sport" ? "match" : "wheel",
    scene: kind === "sport" ? "penalty" : "cases",
    ref: "",
    refScene: "",
  };
}

const tr = (b: CampaignBrief): CampaignI18n => b.i18n ?? {};
/** Перевод есть — собираем на английском наборе и накладываем его; иначе — готовый набор языка. */
const translated = (b: CampaignBrief) => !isBuiltInLang(b.lang) && Object.keys(tr(b)).length > 0;

export const briefHeadline = (b: CampaignBrief) => b.headline.trim() || b.autoHeadline?.trim() || briefDefaults(b.kind, b.lang, tr(b)).headline;
/** Название бренда; есть только лого — без названия (не печатаем заглушку «BRAND» рядом с лого). */
const brandName = (b: CampaignBrief) => b.brand.trim() || (b.logo ? "" : "BRAND");

/** Гамма кампании: пипетка главнее рефа; нет ни того, ни другого — null (цвета по умолчанию). */
export function briefPalette(b: CampaignBrief): ImagePalette | null {
  if (b.pickColor) return paletteFromHex(b.pickColor);
  return b.refPalette ?? b.art?.palette ?? null;
}
export function briefAccent(b: CampaignBrief): string {
  const p = briefPalette(b);
  return p ? accentFromPalette(p) : DEFAULT_ACCENT[b.kind];
}

/** Фон без рефа: тёмный, с мягким свечением в цвет акцента — квадрат для обеих ориентаций. */
export function plainBackground(accent: string): string {
  const a = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#f5b324";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">` +
    `<defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${a}" stop-opacity=".42"/>` +
    `<stop offset=".45" stop-color="${a}" stop-opacity=".12"/><stop offset="1" stop-color="#05060a" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1600" height="1600" fill="#07080d"/><rect width="1600" height="1600" fill="url(#g)"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
const briefBg = (b: CampaignBrief) => b.art?.bg || b.bg || plainBackground(briefAccent(b));
/** Детали сцены от ИИ — только для той сцены, под которую рисовали. */
const sceneArt = (b: CampaignBrief) => (b.art && b.art.scene === b.scene ? b.art : null);

/** Блоки лендинга: язык (с переводом), оффер — первой карточкой бонусов. */
export function briefExtras(b: CampaignBrief): LandingExtras {
  let x = defaultExtras(baseLang(b.lang), b.kind);
  if (translated(b)) {
    const t = tr(b);
    x = { ...applyFlat(x, "extras", t), strings: kitStringsFrom(t), htmlLang: b.lang };
  } else if (!isBuiltInLang(b.lang)) {
    x.htmlLang = b.lang;
  }
  if (b.offer.trim()) {
    x.bonuses = { ...x.bonuses, items: x.bonuses.items.map((it, i) => (i === 0 ? { ...it, title: b.offer.trim().slice(0, 40) } : it)) };
  }
  // Картинки «Мне повезёт»: бонусы — по карточкам с заголовками, игры — по порядку.
  const bon = b.art?.bonusImgs ?? [];
  if (bon.length) {
    let k = 0;
    x.bonuses = { ...x.bonuses, items: x.bonuses.items.map((it) => (it.title.trim() && bon[k] ? { ...it, image: bon[k++] } : it)) };
  }
  const games = b.art?.gameImgs ?? [];
  if (games.length) x.games = { ...x.games, items: x.games.items.map((g, i) => (games[i] ? { ...g, image: games[i] } : g)) };
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
  return {
    brand: brandName(b),
    brandLogo: b.logo,
    headline: briefHeadline(b),
    accent: briefAccent(b),
    dark: true,
    ctaText: b.cta,
    ctaUrl: b.link,
    bgImage: briefBg(b),
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

/** Конфиг сцены плейбла: тексты пресета (с переводом), сумма и кнопка — из брифа, фон и гамма — рефа. */
export function briefScene(b: CampaignBrief): SceneConfig {
  const base = baseLang(b.lang);
  let p = scenePreset(b.scene, base);
  if (translated(b)) {
    const t = applyFlat({ text: p.text, legal: p.legal, unit: p.unit, prizes: p.prizes ?? [] }, "scene", tr(b));
    p = { ...p, text: t.text, legal: t.legal, unit: t.unit, ...(p.prizes ? { prizes: t.prizes } : {}) };
  }
  const pal = briefPalette(b);
  return {
    scene: b.scene,
    text: { ...p.text, cta: b.cta || p.text.cta },
    amount: b.amount,
    unit: b.unit || p.unit,
    locale: euLang(b.lang).locale,
    clickUrl: b.link,
    legal: p.legal,
    brandName: brandName(b),
    logo: b.logo,
    bgImage: briefBg(b),
    prizes: p.prizes,
    winIndex: DEFAULT_WIN_INDEX,
    lang: b.lang,
    ...(pal ? { ui: uiFromPalette(pal), palette: wheelFromPalette(pal) } : {}),
    ...(sceneArt(b) ? { art: sceneArt(b)!.art ?? {}, symbols: sceneArt(b)!.symbols ?? [], reward: sceneArt(b)!.reward ?? "" } : {}),
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
  return wrapSceneLanding(scene, { extras: c.extras, accent: c.accent, ctaUrl: b.link, kind: b.kind, title: c.brand || briefHeadline(b) });
}

export async function briefPlayableHtml(b: CampaignBrief, load: SceneLoader, network: "web" | "mraid" = "web"): Promise<string> {
  return buildScenePlayable(briefScene(b), { network, preview: network === "web", load });
}

/** Письмо по шаблону под тип трафика — до брифа и перевода: с него берутся тексты для переводчика. */
function baseEmail(b: CampaignBrief): EmailDraft {
  const tpl = EMAIL_TEMPLATES.find((x) => x.id === (b.kind === "sport" ? "express" : "welcome")) ?? EMAIL_TEMPLATES[0];
  return applyTemplate({ ...newDraft(), brand: brandName(b), ctaUrl: b.link }, tpl);
}

/** Письмо: шаблон по типу трафика (на нужном языке), тексты и цвет — из брифа. */
export function briefEmail(b: CampaignBrief): EmailDraft {
  const base = baseEmail(b);
  // В переводчик письмо уходит с брендом «BRAND» (чтобы кэш не зависел от бренда) — возвращаем настоящий.
  const t: CampaignI18n = {};
  for (const [k, v] of Object.entries(tr(b))) if (k.startsWith("email.")) t[k] = v.split("BRAND").join(brandName(b));
  const d = b.lang !== "ru" && Object.keys(t).length ? applyFlat(base, "email", t) : base;
  const offer = b.offer.trim();
  return {
    ...d,
    name: `Кампания · ${brandName(b) || "лого"}`,
    subject: offer ? (brandName(b) ? `${brandName(b)}: ${offer}` : offer) : d.subject,
    heroTitle: offer ? `${briefHeadline(b)}: **${offer.toUpperCase()}**` : d.heroTitle,
    ctaText: b.cta ? b.cta.toUpperCase() : d.ctaText,
    accent: briefAccent(b),
    ...(b.logo ? { logo: b.logo, brandMode: "logo" as const } : {}),
  };
}

/** Что отдать переводчику для этого брифа (пусто — переводить нечего). */
export function briefSource(b: CampaignBrief): CampaignI18n {
  return campaignSource({
    lang: b.lang,
    kind: b.kind,
    scene: b.scene,
    defaults: briefDefaults(b.kind, "en"),
    email: baseEmail({ ...b, brand: "BRAND", link: "" }),
  });
}

/**
 * Баннер для «Мне повезёт»: универсальный пресет, тема кампании, оффер
 * заголовком и кнопка — на языке кампании. 16:9; ресайзы — в генераторе баннеров.
 */
export function luckyBannerPayload(b: CampaignBrief, theme: string) {
  const what = b.kind === "sport" ? "sports-betting promo" : "online casino promo";
  return {
    preset_id: "preset1",
    prompt: `${what} key visual in the theme: ${theme}`,
    banner_text: (b.offer.trim() || briefHeadline(b)).slice(0, 80),
    button_text: (b.cta.trim() || briefDefaults(b.kind, b.lang, tr(b)).cta).slice(0, 24),
    banner_text_enabled: true,
    button_text_enabled: true,
    ad_texts_enabled: true,
    person_enabled: false,
    person_gender: null,
    brand_name: b.brand.trim(),
    brand_logo: b.logo,
    language: b.lang,
    aspect_ratio: "16:9",
    model: "openai/gpt-5.4-image-2",
    quality: "medium" as const,
    template_options: "",
  };
}

/** Баннер: пресет по типу трафика и промпт из бренда, оффера и сцены рефа. */
export function briefBanner(b: CampaignBrief): { preset: string; prompt: string } {
  const scene = b.art?.theme || b.refScene.trim() || (b.kind === "sport" ? "night stadium under floodlights" : "luxury casino with glowing lights");
  return {
    preset: b.kind === "sport" ? "preset4" : "preset1",
    prompt: `${brandName(b) ? brandName(b) + " — " : ""}${b.offer || briefHeadline(b)}. ${scene}.`,
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
    lang: baseLang(b.lang),
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
    // Тема «Мне повезёт» или сцена рефа — тема для «Вся графика под тему»; гамма — та же, что в кампании.
    theme: b.art?.theme || b.refScene,
    ...(sceneArt(b) ? { art: c.art, symbols: c.symbols, reward: c.reward } : {}),
    ...(b.pickColor ? { pickColor: b.pickColor } : {}),
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
  const data: Record<string, unknown> = { ...c, topic: b.offer, theme: b.art?.theme || b.refScene };
  if (b.landing === "wheel") data.prizes = WHEEL_PRIZES(b);
  if (b.landing === "slot") data.attempts = [b.offer || `${b.amount} ${b.unit}`];
  if (b.landing === "crash") data.maxAttempts = 2;
  if (b.landing === "match") Object.assign(data, matchFields(b));
  return { writes: [[m.key, data]], route: m.route };
}
