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
