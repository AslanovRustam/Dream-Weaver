// Пресеты сценарных плейблов: какие тексты есть у сцены, тексты по умолчанию
// на четырёх языках и темы для ИИ-оформления.

import type { SceneId } from "./build";

export type SceneLang = "ru" | "uk" | "en" | "es";

export const SCENE_LANGS: { id: SceneLang; label: string; locale: string }[] = [
  { id: "ru", label: "Русский", locale: "ru-RU" },
  { id: "uk", label: "Українська", locale: "uk-UA" },
  { id: "en", label: "English", locale: "en-US" },
  { id: "es", label: "Español", locale: "es-MX" },
];

export type SceneTextField = {
  key: string;
  label: string;
  /** Многострочное поле: перевод строки попадёт в плейбл как <br>. */
  multiline?: boolean;
};

export type SceneMeta = {
  id: SceneId;
  label: string;
  description: string;
  fields: SceneTextField[];
  /** Тема фона для ИИ по умолчанию. */
  bgTheme: string;
  /** Что рисует ИИ для попапа (прозрачный фон). */
  rewardTheme: string;
};

const POPUP_FIELDS: SceneTextField[] = [
  { key: "bonus", label: "Над суммой в попапе" },
  { key: "cta", label: "Кнопка в попапе" },
];

export const SCENES: SceneMeta[] = [
  {
    id: "safe",
    label: "Сейф",
    description: "Три нажатия: первое срывается, третье вскрывает дверь — внутри золото.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв нажать" },
      { key: "tryAgain", label: "После неудачи" },
      { key: "tapsLeft", label: "Счётчик нажатий (перед числом)" },
      { key: "open", label: "Когда сейф открыт" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Luxurious bank vault interior, warm golden light, polished steel and brass, bokeh sparkles",
    rewardTheme: "A heap of shiny gold bars and gold coins, casino jackpot treasure, 3D render",
  },
  {
    id: "wheel",
    label: "Колесо",
    description: "Первое вращение — в шаге от джекпота, второе останавливается на нём.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв крутить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "spinsLeft", label: "Счётчик вращений (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Glamorous casino hall at night, golden lights, red velvet, soft bokeh, festive confetti",
    rewardTheme: "A golden treasure chest overflowing with gold coins and gems, casino jackpot, 3D render",
  },
  {
    id: "scratch",
    label: "Скретч-карта",
    description: "Палец стирает фольгу — под ней три монеты. Открывается сама, когда стёрта половина.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Подсказка над картой" },
      { key: "won", label: "Когда три совпали" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Lucky casino lottery scene, purple and gold neon glow, flying gold coins, sparkles, bokeh",
    rewardTheme: "A stack of gold coins with a shiny lucky clover, casino win, 3D render",
  },
  {
    id: "slot",
    label: "Слот",
    description: "Рычаг, три барабана: первый спин — две семёрки и третья застревает, второй — 7·7·7.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв крутить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "spinsLeft", label: "Счётчик спинов (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Vegas casino floor at night, rows of glowing slot machines in soft bokeh, neon and gold lights",
    rewardTheme: "A big golden jackpot pile of coins with a glowing lucky seven, casino win, 3D render",
  },
  {
    id: "chests",
    label: "Сундуки",
    description: "Выбери один из трёх: первый пустой, во втором — золото и луч света.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв выбрать" },
      { key: "empty", label: "Надпись над пустым сундуком" },
      { key: "tryAgain", label: "После пустого" },
      { key: "triesLeft", label: "Счётчик попыток (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Pirate treasure cave with glowing gold, warm torchlight, sparkling gems, magical dust, bokeh",
    rewardTheme: "An open pirate treasure chest overflowing with gold coins and jewels, 3D render",
  },
  {
    id: "aviator",
    label: "Авиатор",
    description: "Самолёт взлетает, множитель растёт — жми «Забрать», пока летит.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв взлететь" },
      { key: "cashout", label: "Кнопка в полёте (перед множителем)" },
      { key: "cashoutHint", label: "Подсказка в полёте" },
      { key: "won", label: "Кнопка после выигрыша (перед множителем)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Night sky above clouds with glowing red and pink neon haze, city lights far below, stars, bokeh",
    rewardTheme: "A shiny red propeller airplane flying over a pile of gold coins, casino win, 3D render",
  },
  {
    id: "plinko",
    label: "Плинко",
    description: "Шарик скачет по штырькам: первый садится в ×0.5, второй — в ×100.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв бросить" },
      { key: "tryAgain", label: "После первого шарика" },
      { key: "ballsLeft", label: "Счётчик шариков (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Cosmic purple arcade with neon pink and violet glow, floating sparkles, soft bokeh",
    rewardTheme: "A glowing pink plinko ball on top of a pile of gold coins, casino win, 3D render",
  },
];

export function sceneMeta(id: SceneId): SceneMeta {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

type LangPack = { text: Record<string, string>; unit: string; legal: string; prizes?: string[] };

const LEGAL: Record<SceneLang, string> = {
  ru: "18+. Играйте ответственно. Бонус для новых игроков, условия на сайте.",
  uk: "18+. Грайте відповідально. Бонус для нових гравців, умови на сайті.",
  en: "18+. Play responsibly. New players only. T&Cs apply.",
  es: "18+. Juega con responsabilidad. Solo nuevos jugadores. Aplican T&C.",
};

const UNIT: Record<SceneLang, string> = { ru: "фриспинов", uk: "фриспінів", en: "free spins", es: "giros gratis" };

const TEXT: Record<SceneId, Record<SceneLang, Record<string, string>>> = {
  safe: {
    ru: { title: "Открой сейф\nи забери бонус", tap: "Жми, чтобы открыть", tryAgain: "Попробуй ещё раз!", tapsLeft: "Нажатий осталось: ", open: "Открыт!", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Відкрий сейф\nі забери бонус", tap: "Тисни, щоб відкрити", tryAgain: "Спробуй ще раз!", tapsLeft: "Натискань залишилось: ", open: "Відкрито!", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Crack the safe\nand claim your bonus", tap: "Tap to open", tryAgain: "Try again!", tapsLeft: "Taps left: ", open: "Unlocked!", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Abre la caja fuerte\ny llévate el bono", tap: "Toca para abrir", tryAgain: "¡Inténtalo otra vez!", tapsLeft: "Toques restantes: ", open: "¡Abierta!", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  wheel: {
    ru: { title: "Крути колесо\nи выигрывай", tap: "Жми, чтобы крутить", tryAgain: "Почти! Ещё раз", spinsLeft: "Вращений: ", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Крути колесо\nі вигравай", tap: "Тисни, щоб крутити", tryAgain: "Майже! Ще раз", spinsLeft: "Обертань: ", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Spin the wheel\nand win", tap: "Tap to spin", tryAgain: "So close! Again", spinsLeft: "Spins: ", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Gira la ruleta\ny gana", tap: "Toca para girar", tryAgain: "¡Casi! Otra vez", spinsLeft: "Giros: ", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  plinko: {
    ru: { title: "Брось шарик —\nпоймай ×100", tap: "Жми, чтобы бросить", tryAgain: "Мимо! Ещё шарик", ballsLeft: "Шариков: ", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Кинь кульку —\nспіймай ×100", tap: "Тисни, щоб кинути", tryAgain: "Повз! Ще кулька", ballsLeft: "Кульок: ", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Drop the ball —\ncatch ×100", tap: "Tap to drop", tryAgain: "Missed! One more", ballsLeft: "Balls: ", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Suelta la bola,\natrapa ×100", tap: "Toca para soltar", tryAgain: "¡Casi! Otra bola", ballsLeft: "Bolas: ", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  aviator: {
    ru: { title: "Лети выше —\nзабирай больше", tap: "Жми, чтобы взлететь", cashout: "Забрать", cashoutHint: "Жми — забирай!", won: "Забрал", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Лети вище —\nзабирай більше", tap: "Тисни, щоб злетіти", cashout: "Забрати", cashoutHint: "Тисни — забирай!", won: "Забрав", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Fly higher —\nwin bigger", tap: "Tap to take off", cashout: "Cash out", cashoutHint: "Tap to cash out!", won: "Cashed", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Vuela más alto,\ngana más", tap: "Toca para despegar", cashout: "Cobrar", cashoutHint: "¡Toca y cobra!", won: "Cobrado", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  chests: {
    ru: { title: "Выбери сундук\nи забери золото", tap: "Жми на сундук", empty: "Пусто!", tryAgain: "Выбери другой!", triesLeft: "Попыток: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Обери скриню\nі забери золото", tap: "Тисни на скриню", empty: "Порожньо!", tryAgain: "Обери іншу!", triesLeft: "Спроб: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Pick a chest\nand grab the gold", tap: "Tap a chest", empty: "Empty!", tryAgain: "Pick another!", triesLeft: "Tries: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Elige un cofre\ny llévate el oro", tap: "Toca un cofre", empty: "¡Vacío!", tryAgain: "¡Elige otro!", triesLeft: "Intentos: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  slot: {
    ru: { title: "Крути слот\nи срывай джекпот", tap: "Жми, чтобы крутить", tryAgain: "Почти! Ещё спин", spinsLeft: "Спинов: ", bonus: "Твой джекпот:", cta: "Забрать джекпот" },
    uk: { title: "Крути слот\nі зривай джекпот", tap: "Тисни, щоб крутити", tryAgain: "Майже! Ще спін", spinsLeft: "Спінів: ", bonus: "Твій джекпот:", cta: "Забрати джекпот" },
    en: { title: "Spin the slot\nhit the jackpot", tap: "Tap to spin", tryAgain: "So close! Spin again", spinsLeft: "Spins: ", bonus: "Your jackpot:", cta: "Claim jackpot" },
    es: { title: "Gira el slot\ny gana el jackpot", tap: "Toca para girar", tryAgain: "¡Casi! Otro giro", spinsLeft: "Giros: ", bonus: "Tu jackpot:", cta: "Reclamar jackpot" },
  },
  scratch: {
    ru: { title: "Сотри\nи выиграй", tap: "Найди три одинаковых", won: "Три монеты!", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Зітри\nі виграй", tap: "Знайди три однакових", won: "Три монети!", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Scratch\nand win", tap: "Find three of a kind", won: "Three coins!", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Rasca\ny gana", tap: "Encuentra tres iguales", won: "¡Tres monedas!", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
};

const PRIZES: Record<SceneLang, string[]> = {
  ru: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "ДЖЕКПОТ"],
  uk: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "ДЖЕКПОТ"],
  en: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "JACKPOT"],
  es: ["100 GG", "x2", "50 GG", "500 GG", "200%", "25 GG", "x3", "JACKPOT"],
};
/** Сектор, на котором колесо остановится, — «500 FS» в пресете. */
export const DEFAULT_WIN_INDEX = 3;

export function scenePreset(id: SceneId, lang: SceneLang): LangPack {
  return {
    text: { ...TEXT[id][lang] },
    unit: UNIT[lang],
    legal: LEGAL[lang],
    ...(id === "wheel" ? { prizes: [...PRIZES[lang]] } : {}),
  };
}

// ---- стили колеса: промпт для ИИ-деталей + палитра нашего диска под них

export type WheelPalette = {
  /** Сектора: светлый центр → тёмный край. */
  a: [string, string];
  b: [string, string];
  win: [string, string];
  /** Разделители секторов. */
  line: string;
  /** Подписи и их обводка; на выигрышном секторе — свои. */
  ink: string;
  stroke: string;
  winInk: string;
  winStroke: string;
};

export type WheelStyle = { id: string; label: string; prompt: string; palette: WheelPalette; swatch: string[] };

export const WHEEL_STYLES: WheelStyle[] = [
  {
    id: "ruby",
    label: "Золото и рубин",
    prompt: "polished yellow gold with deep red rubies and warm golden light bulbs, classic luxury casino",
    palette: {
      a: ["#ff5c7a", "#9b1030"], b: ["#4a2f9a", "#1a0d44"], win: ["#fff2a8", "#e08a1c"],
      line: "#f2c26a", ink: "#ffffff", stroke: "#3a0a14", winInk: "#5a2406", winStroke: "#fff3c0",
    },
    swatch: ["#e2a23e", "#c2183c", "#3a2580"],
  },
  {
    id: "neon",
    label: "Неон",
    prompt: "glossy dark chrome with glowing cyan and magenta neon tubes and neon light bulbs, cyberpunk night casino",
    palette: {
      a: ["#ff4fd8", "#6a0a5c"], b: ["#2fd4ff", "#06395a"], win: ["#fff7a8", "#ffb21c"],
      line: "#c9f6ff", ink: "#ffffff", stroke: "#1a0630", winInk: "#4a2200", winStroke: "#fffbd8",
    },
    swatch: ["#2fd4ff", "#ff4fd8", "#1a0630"],
  },
  {
    id: "emerald",
    label: "Изумруд",
    prompt: "polished gold with large emerald gems and warm light bulbs, lucky irish / royal green casino",
    palette: {
      a: ["#3ddc84", "#0a5a2e"], b: ["#1a2a22", "#050c08"], win: ["#fff2a8", "#e0a21c"],
      line: "#f2d36a", ink: "#ffffff", stroke: "#03200f", winInk: "#4a2a06", winStroke: "#fff6c8",
    },
    swatch: ["#e8c04a", "#1fa85a", "#0c1a12"],
  },
  {
    id: "ice",
    label: "Серебро и лёд",
    prompt: "polished silver and platinum with icy blue crystals and cold white light bulbs, frosty premium casino",
    palette: {
      a: ["#8fd8ff", "#1a5a9a"], b: ["#e8eef6", "#7a8aa0"], win: ["#fff2a8", "#e0a21c"],
      line: "#ffffff", ink: "#0a2a4a", stroke: "#ffffff", winInk: "#4a2a06", winStroke: "#fff6c8",
    },
    swatch: ["#d8e2ee", "#5ab8f0", "#1a3a6a"],
  },
];

export function wheelStyle(id: string | undefined): WheelStyle {
  return WHEEL_STYLES.find((s) => s.id === id) ?? WHEEL_STYLES[0];
}
