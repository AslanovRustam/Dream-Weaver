// Каталог шаблонов плейблов.
//
// Шаблон — готовая связка «механика + оффер + настройки игры + цвет + темы
// для ИИ-оформления» под типовой iGaming-повод. Бренд, лого, ссылка по кнопке
// и выбранная сеть не меняются: это данные кампании, а не повода.
//
// Значения держатся в рамках того, что умеет форма: барабаны 3/4/5, ходы
// Match-3 — 5/8/12, у колеса и квиза — от двух вариантов.

import type { PlayableMechanic } from "./playableGen";

export type PlayableTemplate = {
  id: string;
  name: string;
  /** Одна строка: когда этот шаблон уместен. */
  when: string;
  mechanic: PlayableMechanic;
  offer: string;
  ctaText: string;
  accent: string;
  duration: "short" | "medium";
  /** Сцена для ИИ-фона. */
  bgTheme: string;
  /** Тема символов — для слота и Match-3. */
  symbolTheme?: string;
  reels?: number;
  wheelPrizes?: string[];
  scratchPrize?: string;
  quizQuestion?: string;
  quizAnswers?: string[];
  quizCorrect?: number;
  match3Moves?: number;
};

export const PLAYABLE_TEMPLATES: PlayableTemplate[] = [
  {
    id: "slot-jackpot",
    name: "Слот: джекпот",
    when: "Классический спин с выигрышем и бонусом на депозит",
    mechanic: "slot",
    offer: "Бонус 100% + 100 фриспинов",
    ctaText: "Забрать бонус",
    accent: "#FFC53D",
    duration: "short",
    reels: 3,
    bgTheme: "роскошный вечерний зал казино, золото, мягкий неон, огни и блики",
    symbolTheme: "классические символы слота: семёрка, вишня, колокольчик, бриллиант, слиток золота, подкова",
  },
  {
    id: "slot-mega",
    name: "Слот: мегавин",
    when: "Пять барабанов и долгий спин — для фриспинов в новом слоте",
    mechanic: "slot",
    offer: "200 фриспинов в новом слоте",
    ctaText: "Играть",
    accent: "#B7F14A",
    duration: "medium",
    reels: 5,
    bgTheme: "сказочный тропический остров на закате, сундуки с сокровищами, сияние",
    symbolTheme: "пиратские сокровища: сундук, компас, монета, кинжал, карта, попугай",
  },
  {
    id: "wheel-welcome",
    name: "Колесо: приветственный",
    when: "Новичок крутит колесо и выигрывает стартовый пакет",
    mechanic: "wheel",
    offer: "До 500 EUR и 300 фриспинов",
    ctaText: "Забрать приз",
    accent: "#f97316",
    duration: "short",
    wheelPrizes: ["+100 FS", "200% бонус", "+50 FS", "500 EUR", "x2 депозит", "+300 FS"],
    bgTheme: "праздничная сцена с конфетти, лучи прожекторов, оранжево-фиолетовая гамма",
  },
  {
    id: "crash-rocket",
    name: "Crash: успей забрать",
    when: "Растущий множитель — для крэш-игр и азартной аудитории",
    mechanic: "crash",
    offer: "Бонус 200% на первый депозит",
    ctaText: "Начать игру",
    accent: "#35D0FF",
    duration: "short",
    bgTheme: "открытый космос, туманность, звёзды, неоновый голубой свет",
  },
  {
    id: "scratch-gift",
    name: "Скретч-карта",
    when: "Стереть слой и открыть подарок — короткий и понятный формат",
    mechanic: "scratch",
    offer: "Подарок за регистрацию",
    ctaText: "Забрать подарок",
    accent: "#FF3B5C",
    duration: "short",
    scratchPrize: "150 фриспинов",
    bgTheme: "подарочные коробки и ленты, мягкий красный свет, блёстки",
  },
  {
    id: "quiz-match",
    name: "Квиз: прогноз на матч",
    when: "Беттинг: угадай исход — получи фрибет",
    mechanic: "quiz",
    offer: "Фрибет 10 EUR за прогноз",
    ctaText: "Сделать ставку",
    accent: "#22c55e",
    duration: "short",
    quizQuestion: "Кто победит в матче дня?",
    quizAnswers: ["Хозяева", "Ничья", "Гости"],
    quizCorrect: 0,
    bgTheme: "вечерний футбольный стадион, свет прожекторов, зелёный газон, дымка",
  },
  {
    id: "match3-gems",
    name: "Match-3: самоцветы",
    when: "Казуальная механика для широкой аудитории",
    mechanic: "match3",
    offer: "50 фриспинов за 8 ходов",
    ctaText: "Забрать фриспины",
    accent: "#7B5CFF",
    duration: "medium",
    match3Moves: 8,
    bgTheme: "волшебная пещера с кристаллами, фиолетовое и бирюзовое свечение",
    symbolTheme: "драгоценные камни разных цветов: рубин, сапфир, изумруд, топаз, аметист",
  },
];
