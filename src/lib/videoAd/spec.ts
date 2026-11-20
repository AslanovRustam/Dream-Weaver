// Видеореклама из креатива — общие решения для клиента и сервера.
//
// Как устроено видео:
//   1. ИИ (xAI Grok Imagine Video) оживляет готовый баннер: картинка → клип
//      в её же пропорциях, со звуком. Один клип на баннер, сколько бы форматов
//      ни заказали.
//   2. Браузер собирает из клипа каждый формат (9:16, 4:5, 1:1, 16:9): клип по
//      центру, края — его же размытая копия, в конце — концовка с исходным
//      баннером (тексты и кнопка ровно как на креативе: видеомодели буквы портят).
//   «Моушн» — без ИИ и бесплатно: баннер с наездом камеры, бликом и искрами.
import { CREDITS_PER_USD } from "@/lib/credit-estimate";

export type VideoAdFormatId = "9:16" | "4:5" | "1:1" | "16:9";

export const VIDEO_AD_FORMATS: { id: VideoAdFormatId; w: number; h: number; label: string; where: string }[] = [
  { id: "9:16", w: 1080, h: 1920, label: "Вертикаль 9:16", where: "Reels, Stories, TikTok, Shorts" },
  { id: "4:5", w: 1080, h: 1350, label: "Лента 4:5", where: "Лента Instagram и Facebook" },
  { id: "1:1", w: 1080, h: 1080, label: "Квадрат 1:1", where: "Лента, Telegram" },
  { id: "16:9", w: 1920, h: 1080, label: "Горизонталь 16:9", where: "YouTube, сайты" },
];
export const VIDEO_AD_FORMAT_BY_ID = new Map(VIDEO_AD_FORMATS.map((f) => [f.id, f]));

export type VideoAdEngine = "ai" | "motion";
export type VideoAdQuality = "fast" | "max";

/** Модели xAI: цена — за секунду готового видео. */
export const VIDEO_AD_MODELS: Record<
  VideoAdQuality,
  { model: string; usdPerSec: number; resolution: "720p" | "1080p"; label: string; hint: string }
> = {
  fast: {
    model: "grok-imagine-video-1.5-lite",
    usdPerSec: 0.02,
    resolution: "720p",
    label: "Быстро",
    hint: "720p, дешевле в 4 раза",
  },
  max: {
    model: "grok-imagine-video-1.5",
    usdPerSec: 0.08,
    resolution: "1080p",
    label: "Максимум",
    hint: "1080p, живее движение",
  },
};

/** Длина готового ролика, с. */
export const VIDEO_AD_DURATIONS = [6, 10, 15] as const;
export const VIDEO_AD_DEFAULT_DURATION = 10;
/** Концовка с исходным баннером, с. */
export const END_CARD_S = 2;
/** Сколько секунд просить у модели: всё, кроме концовки (модель умеет 1–15 с). */
export function aiSeconds(total: number, endCard: boolean): number {
  return Math.max(3, Math.min(15, Math.round(total - (endCard ? END_CARD_S : 0))));
}

/** Цена ИИ-клипа в кредитах: round(себестоимость × 100), как у всех инструментов. */
export function videoAdCredits(quality: VideoAdQuality, seconds: number): number {
  return Math.max(1, Math.ceil(seconds * VIDEO_AD_MODELS[quality].usdPerSec * CREDITS_PER_USD));
}

/** План ролика от арт-директора (POST /api/video-ad/plan). */
export type VideoAdPlan = {
  /** Короткое название идеи по-русски. */
  title: string;
  /** Что увидит зритель — 1–2 фразы по-русски, для человека. */
  idea: string;
  /** Промпт движения для видеомодели (по-английски). */
  prompt: string;
  /** Звук: true — фон и эффекты от модели. */
  audio: boolean;
  /** Рекомендованная длина, с. */
  duration: number;
  /** Нужна ли концовка с баннером. */
  endCard: boolean;
};

export type VideoAdJobStatus = "pending" | "saving" | "done" | "failed";

/** Задание на ИИ-клип, как его отдаёт сервер. */
export type VideoAdJob = {
  id: string;
  status: VideoAdJobStatus;
  title: string;
  /** Исходный баннер (публичная ссылка). */
  image_url: string;
  card_id: string | null;
  quality: VideoAdQuality;
  seconds: number;
  credits: number;
  /** Решения для сборки: форматы, концовка, длина. */
  recipe: { formats: VideoAdFormatId[]; endCard: boolean; total: number; idea?: string };
  error: string | null;
  created_at: string;
  /** Клип готов — его можно забрать через /api/video-ad/{id}/clip. */
  ready: boolean;
};
