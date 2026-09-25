// Чем отличаются варианты одной пачки.
//
// Просить у модели четыре картинки по одному и тому же брифу — значит получить
// четыре почти одинаковых: температура даёт разброс в мелочах, а не в идее.
// Поэтому каждому варианту добавляем свою директиву — но только про кадр:
// ракурс, свет, план, фон.
//
// Чего директивы не трогают: тексты, логотип и фирменные цвета. Их человек
// задал в форме, и «вариант» не должен означать «другой оффер» — иначе из
// четырёх картинок выбирать придётся не кадр, а правильность надписей.

/** Первый вариант всегда без директивы: это баннер ровно по брифу. */
export const BASE_VARIATION = "";

const POOL: string[] = [
  "Camera: move in closer on the hero subject, tighter crop, shallower depth of field. Subject slightly off-centre.",
  "Camera: pull back for a wider frame with more air around the subject; add depth with layered foreground and background elements.",
  "Lighting: dramatic side and rim light, deeper shadows, higher contrast; simplify the background to a darker gradient.",
  "Lighting: bright, even, high-key light with soft reflections and a cleaner, lighter background.",
  "Angle: shoot from a lower angle so the subject reads as monumental; converging perspective lines.",
  "Angle: slight three-quarter turn of the subject and the camera; diagonal composition.",
  "Background: replace the setting with a different but equally fitting environment for the same offer; keep the mood.",
  "Effects: add motion — particles, sparks or light streaks sweeping through the frame; keep the centre readable.",
];

/**
 * Директивы для пачки из n вариантов: первая пустая, остальные разные и
 * выбраны случайно, чтобы повторный запуск той же пачки не дал ту же четвёрку.
 */
export function variationsFor(count: number): string[] {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5);
  return Array.from({ length: Math.max(1, count) }, (_, i) =>
    i === 0 ? BASE_VARIATION : (shuffled[(i - 1) % shuffled.length] ?? BASE_VARIATION),
  );
}
