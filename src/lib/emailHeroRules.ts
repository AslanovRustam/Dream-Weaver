// Правила для hero-баннера письма.
//
// Всё здесь — рекомендации, а не запреты: баннер с «неправильными»
// пропорциями письмо не ломает, просто выглядит хуже у части получателей.
// Поэтому проверки возвращают подсказки, а не ошибки, и ничего не блокируют.

/** Ширина письма по своду — фиксированные 600px, медиазапросов нет. */
export const HERO_WIDTH = 600;
/** Экраны давно ретиновые: картинку готовим вдвое шире, показываем в 600. */
export const HERO_RETINA_WIDTH = HERO_WIDTH * 2;
/**
 * Пропорция баннера. 16:9 — самый широкий формат, который умеет генератор
 * картинок, и он же даёт 1792px по ширине: после ужатия в 600 баннер остаётся
 * резким на ретине.
 */
export const HERO_ASPECT_RATIO = "16:9";
/** Выше этого веса письмо заметно тормозит на мобильном интернете. */
export const HERO_MAX_BYTES = 300 * 1024;

/** Что показываем человеку рядом с полем загрузки. */
export const HERO_RULES: string[] = [
  `Ширина ${HERO_RETINA_WIDTH} px — письмо шириной ${HERO_WIDTH}, картинка ужимается вдвое и остаётся резкой на телефоне.`,
  "Пропорции от 2:1 до 3:2 — генератор делает 16:9. Более высокий баннер съедает первый экран, и текст с кнопкой уходят под сгиб.",
  "Без текста и логотипов внутри картинки: он не переводится, не выделяется и не перекрашивается в тёмной теме.",
  `JPG для фотографий, PNG для графики с плоскими заливками. До ${Math.round(HERO_MAX_BYTES / 1024)} КБ.`,
  "Главный объект — по центру: почтовики на телефоне обрезают края превью.",
];

export type HeroHint = { level: "warn" | "info"; text: string };

/**
 * Мягкая проверка загруженного баннера. Возвращает подсказки в порядке
 * важности; пустой массив — к картинке вопросов нет.
 */
export function checkHeroImage(m: { width: number; height: number; bytes: number }): HeroHint[] {
  const hints: HeroHint[] = [];
  const ratio = m.width / Math.max(1, m.height);

  if (m.width < HERO_WIDTH) {
    hints.push({
      level: "warn",
      text: `Ширина ${m.width} px меньше ширины письма — картинку растянет, и она станет мыльной. Нужно от ${HERO_WIDTH}, лучше ${HERO_RETINA_WIDTH}.`,
    });
  } else if (m.width < HERO_RETINA_WIDTH) {
    hints.push({
      level: "info",
      text: `Ширина ${m.width} px. На ретине резче будет ${HERO_RETINA_WIDTH}.`,
    });
  }

  if (ratio < 1.2) {
    hints.push({
      level: "warn",
      text: "Баннер почти квадратный — он займёт весь первый экран, и заголовок с кнопкой уйдут под сгиб.",
    });
  } else if (ratio > 3.2) {
    hints.push({
      level: "info",
      text: "Баннер очень узкий: на телефоне он сожмётся в полоску высотой в палец.",
    });
  }

  if (m.bytes > HERO_MAX_BYTES) {
    hints.push({
      level: "warn",
      text: `Вес ${Math.round(m.bytes / 1024)} КБ — письмо будет долго открываться на мобильном интернете. Ужмите до ${Math.round(HERO_MAX_BYTES / 1024)} КБ.`,
    });
  }

  return hints;
}

/**
 * Те же правила, но для генератора картинки. Уходят в промпт, поэтому на
 * английском и в повелительном наклонении — так модель их слушается лучше.
 * Запрет текста живёт отдельно (NO_TEXT в роуте) и здесь не дублируется.
 */
export const HERO_PROMPT_RULES =
  `Composition rules for an email hero banner: aspect ratio ${HERO_ASPECT_RATIO} (wide, letterbox), ` +
  "main subject centred and fully inside the middle 80% of the frame, " +
  "nothing important within 40px of any edge (mail clients crop the edges in previews), " +
  "one clear focal point, uncluttered background with calm areas on the left and right, " +
  "no frames, no borders, no rounded corners, no drop shadows around the image itself.";

/** Размер и вес картинки из data-URL — меряем в браузере, до отправки. */
export function measureDataUrl(dataUrl: string): Promise<{ width: number; height: number; bytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // base64 кодирует 3 байта четырьмя символами; хвостовые "=" не считаются.
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        bytes: Math.max(0, Math.round((b64.length * 3) / 4) - pad),
      });
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}
