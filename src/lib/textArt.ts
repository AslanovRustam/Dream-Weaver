// Надписи-ассеты для баннеров, собираемых слоями (bannerLayers).
//
// Шрифт кодом проигрывает типографике, которую рисует модель. Поэтому слова баннера
// (заголовок, числа и слова оффера) модель рисует ОДНИМ листом в стиле мастера —
// объёмные, с фаской и бликами, на прозрачном фоне, по одному слову в строке.
// Сервер режет лист на слова и сверяет написание по картинке; код потом собирает
// из слов строки любой длины и переносит их как обычный текст. Слово, которое не
// прошло сверку, рисуется шрифтом — вся его строка, чтобы не смешивать стили.

export type ArtRole = "light" | "accent";
export type ArtToken = { text: string; role: ArtRole };
export type ArtPiece = { text: string; src: string; w: number; h: number };

/** Ключ слова: верхний регистр, разряды через неразрывный пробел («50 000» — одно слово). */
export const artKey = (t: string) =>
  t
    .toUpperCase()
    .replace(/(\d)[\s ](?=\d{3}\b)/g, "$1 ")
    .trim();

/** Строка → слова-ассеты (тем же правилом, что перенос в bannerLayers). */
export const artWords = (line: string) =>
  artKey(line)
    .split(/[ \t\n]+/)
    .filter(Boolean);

/** Слова листа: заголовок светлым, числа акцентом, остальное — светлым. Без повторов, не больше max. */
export function sheetTokens(lines: { text: string; role?: ArtRole }[], max = 14): ArtToken[] {
  const out: ArtToken[] = [];
  const seen = new Set<string>();
  for (const l of lines)
    for (const w of artWords(l.text)) {
      if (seen.has(w) || out.length >= max) continue;
      seen.add(w);
      out.push({ text: w, role: l.role ?? (/\d|^\+$|%/.test(w) ? "accent" : "light") });
    }
  return out;
}

/**
 * Полосы строк листа по «плотности» альфы по высоте: rows[y] — сколько непрозрачных
 * пикселей в строке y. Возвращает n полос [y0, y1) или null, если не удаётся
 * разделить ровно на n (тогда лист не используем).
 */
export function bandsFromAlpha(rows: number[], n: number, minInk = 2): [number, number][] | null {
  const runs: [number, number][] = [];
  let start = -1;
  rows.forEach((v, y) => {
    if (v >= minInk && start < 0) start = y;
    if (v < minInk && start >= 0) {
      runs.push([start, y]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, rows.length]);
  // Крошки (блик, край тени) — к ближайшей настоящей полосе, а не в мусор: иначе тень обрежется.
  const real = runs.filter(([a, b]) => b - a >= 6).map(([a, b]) => [a, b] as [number, number]);
  for (const [a, b] of runs.filter(([a, b]) => b - a < 6)) {
    let near = -1;
    let dist = Infinity;
    real.forEach(([ra, rb], i) => {
      const d = a >= rb ? a - rb : ra - b;
      if (d < dist) [dist, near] = [d, i];
    });
    if (near >= 0) real[near] = [Math.min(real[near][0], a), Math.max(real[near][1], b)];
  }
  if (real.length < n) return null;
  // Лишние разрывы (тень отделилась от слова) — склеиваем самые узкие промежутки.
  while (real.length > n) {
    let best = 0;
    let gap = Infinity;
    for (let i = 0; i < real.length - 1; i++) {
      const g = real[i + 1][0] - real[i][1];
      if (g < gap) [gap, best] = [g, i];
    }
    real.splice(best, 2, [real[best][0], real[best + 1][1]]);
  }
  return real;
}

/** Сравнение слова с прочитанным: регистр, пробелы и похожие латиница/кириллица не важны. */
export function sameWord(a: string, b: string): boolean {
  const lat: Record<string, string> = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У" };
  const n = (s: string) =>
    s
      .toUpperCase()
      .replace(/[\s '"«»]/g, "")
      .replace(/Ё/g, "Е")
      .replace(/[ABCEHKMOPTXY]/g, (c) => lat[c] ?? c);
  return n(a) === n(b);
}
