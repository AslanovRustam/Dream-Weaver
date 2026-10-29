// GIF-баннер из готового баннера (мастер или ресайз): эффекты кодом, без генераций.
//
// GIF оживляет то, что уже нарисовала модель, — типографику и сцену не трогаем:
//   • блик — диагональная полоса света, проходит только по ярким насыщенным местам
//     (золотые буквы, кнопка, монеты), тёмный фон не трогает;
//   • искры — четырёхлучевые звёздочки мерцают в самых ярких точках картинки;
//   • наезд — лёгкий зум туда-обратно (меняет каждый пиксель → GIF заметно тяжелее).
// Кадры зациклены по фазе: последний кадр плавно переходит в первый.
//
// Кодирование — gifenc: одна палитра на весь ролик (фон не мерцает), в кадрах
// после первого меняются только пиксели, которые отличаются от предыдущего, остальное
// прозрачно — так статичная картинка с бликом весит десятки КБ, а не мегабайты.
// Вес подгоняем под лимит площадки (GDN — 150 КБ): меньше цветов, потом ниже fps.
//
// Всё, кроме загрузки картинки, — чистые функции над RGBA: проверяется в node.
import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";

export type GifEffects = { shine: boolean; sparkles: boolean; zoom: boolean };
export type GifOptions = GifEffects & {
  /** Длина одного цикла, с. */
  seconds?: number;
  /** Сколько раз проиграть: 0 — бесконечно (GDN требует остановку за 30 с). */
  plays?: number;
  /** Лимит веса, байт. */
  maxBytes?: number;
  /** Свои ступени частоты и цветов (сеть с ограничением fps). */
  ladder?: GifLadder;
};
/** Ступени подгонки веса: частота кадров и число цветов, по порядку. */
export type GifLadder = { fps: number; colors: number }[];

export type GifResult = {
  bytes: Uint8Array;
  fps: number;
  colors: number;
  frames: number;
  overLimit: boolean;
  /** Длина одного цикла, с. */
  seconds: number;
  /** Самый короткий кадр, мс (Google: кадр дольше 200 мс). */
  minFrameMs: number;
};

export const GDN_GIF_LIMIT = 150 * 1024;

/** Яркие насыщенные места — туда идут блик и искры. 0…1 на пиксель. */
export function shineMask(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const m = new Float32Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const t = Math.min(1, Math.max(0, (lum - 0.42) / 0.4));
    m[p] = t * t * (3 - 2 * t) * (0.45 + 0.55 * Math.min(1, sat * 1.6));
  }
  return m;
}

/** Точки для искр: самые яркие места маски, не ближе minDist друг к другу. */
export function sparkPoints(
  mask: Float32Array,
  w: number,
  h: number,
  n: number,
): { x: number; y: number }[] {
  const cell = Math.max(4, Math.round(Math.min(w, h) / 10));
  const cand: { x: number; y: number; v: number }[] = [];
  for (let cy = 0; cy < h; cy += cell)
    for (let cx = 0; cx < w; cx += cell) {
      let best = 0;
      let bx = 0;
      let by = 0;
      for (let y = cy; y < Math.min(h, cy + cell); y++)
        for (let x = cx; x < Math.min(w, cx + cell); x++) {
          const v = mask[y * w + x];
          if (v > best) [best, bx, by] = [v, x, y];
        }
      if (best > 0.35) cand.push({ x: bx, y: by, v: best });
    }
  cand.sort((a, b) => b.v - a.v);
  const minDist = Math.min(w, h) * 0.18 + Math.max(w, h) * 0.04;
  const out: { x: number; y: number }[] = [];
  for (const c of cand) {
    if (out.length >= n) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= minDist)) out.push({ x: c.x, y: c.y });
  }
  return out;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Кадр в фазе t ∈ [0,1): база (+зум) + блик + искры. */
export function renderFrame(
  base: Uint8ClampedArray | Uint8Array,
  mask: Float32Array,
  sparks: { x: number; y: number }[],
  w: number,
  h: number,
  t: number,
  fx: GifEffects,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  let m = mask;
  if (fx.zoom) {
    // Зум 1 → 1.045 → 1 по косинусу, от центра; билинейная выборка.
    const z = 1 + 0.045 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
    const cx = w / 2;
    const cy = h / 2;
    const zm = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1.001, Math.max(0, cx + (x + 0.5 - cx) / z - 0.5));
        const sy = Math.min(h - 1.001, Math.max(0, cy + (y + 0.5 - cy) / z - 0.5));
        const x0 = sx | 0;
        const y0 = sy | 0;
        const fx1 = sx - x0;
        const fy1 = sy - y0;
        const o = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) {
          const a = base[(y0 * w + x0) * 4 + c];
          const b = base[(y0 * w + x0 + 1) * 4 + c];
          const d = base[((y0 + 1) * w + x0) * 4 + c];
          const e = base[((y0 + 1) * w + x0 + 1) * 4 + c];
          out[o + c] = (a * (1 - fx1) + b * fx1) * (1 - fy1) + (d * (1 - fx1) + e * fx1) * fy1;
        }
        zm[y * w + x] = mask[Math.round(sy) * w + Math.round(sx)];
      }
    m = zm;
  } else out.set(base);

  if (fx.shine) {
    // Блик идёт первые 45% цикла, дальше пауза — так он читается как «блеск», а не мигание.
    const k = smooth(t / 0.45);
    if (t < 0.45) {
      const p = -0.25 + 1.5 * k;
      const bw = 0.075;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = (x / w) * 0.75 + (y / h) * 0.25;
          const d = (u - p) / bw;
          if (d < -3 || d > 3) continue;
          // Мягкий ореол + яркая сердцевина полосы.
          const v = Math.min(
            1,
            Math.sqrt(m[y * w + x]) *
              (Math.exp(-d * d) * 0.55 + Math.exp(-((d * 3.2) ** 2)) * 0.75),
          );
          if (v < 0.01) continue;
          const o = (y * w + x) * 4;
          out[o] += (255 - out[o]) * v;
          out[o + 1] += (255 - out[o + 1]) * v;
          out[o + 2] += (240 - out[o + 2]) * v * 0.9;
        }
    }
  }

  if (fx.sparkles) {
    const R = Math.max(7, Math.min(w, h) * 0.11);
    sparks.forEach((s, i) => {
      // Каждая искра вспыхивает раз за цикл в своей фазе.
      const ph = (t + i * 0.37) % 1;
      const a =
        Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, ph / 0.35))), 2) * (ph < 0.35 ? 1 : 0);
      if (a < 0.02) return;
      const r = R * (0.6 + 0.4 * a);
      const x0 = Math.max(0, Math.floor(s.x - r));
      const x1 = Math.min(w - 1, Math.ceil(s.x + r));
      const y0 = Math.max(0, Math.floor(s.y - r));
      const y1 = Math.min(h - 1, Math.ceil(s.y + r));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = Math.abs(x - s.x) / r;
          const dy = Math.abs(y - s.y) / r;
          const core = Math.exp(-(dx * dx + dy * dy) / 0.03);
          const rays =
            Math.exp(-((dy * 6) ** 2)) * Math.max(0, 1 - dx) ** 1.5 +
            Math.exp(-((dx * 6) ** 2)) * Math.max(0, 1 - dy) ** 1.5;
          const v = Math.min(1, a * (core + 0.9 * rays));
          if (v < 0.01) continue;
          const o = (y * w + x) * 4;
          out[o] += (255 - out[o]) * v;
          out[o + 1] += (250 - out[o + 1]) * v;
          out[o + 2] += (225 - out[o + 2]) * v;
        }
    });
  }
  return out;
}

/** Палитра на весь ролик: выборка пикселей из нескольких кадров. */
function rollPalette(frames: Uint8ClampedArray[], colors: number): Palette {
  const pick = [0, Math.floor(frames.length * 0.2), Math.floor(frames.length * 0.45)];
  const step = Math.max(1, Math.floor(((frames[0].length / 4) * pick.length) / 120_000));
  const sample: number[] = [];
  for (const fi of pick)
    for (let p = 0; p < frames[fi].length / 4; p += step) {
      const i = p * 4;
      sample.push(frames[fi][i], frames[fi][i + 1], frames[fi][i + 2], 255);
    }
  return quantize(new Uint8Array(sample), colors);
}

/** Кодирует кадры в GIF: общая палитра, в кадрах после первого — только изменения. */
export function encodeGif(
  frames: Uint8ClampedArray[],
  w: number,
  h: number,
  opts: { fps?: number; delays?: number[]; colors: number; plays: number },
): Uint8Array {
  // Один индекс резервируем под «прозрачно» (пиксель не изменился).
  const pal = rollPalette(frames, opts.colors - 1);
  const T = pal.length;
  let size = 2;
  while (size < T + 1) size *= 2;
  const palette: Palette = [...pal];
  while (palette.length < size) palette.push([0, 0, 0]);
  const gif = GIFEncoder();
  const uniform = Math.round(1000 / (opts.fps ?? 10) / 10) * 10;
  const delayOf = (i: number) => Math.max(20, Math.round((opts.delays?.[i] ?? uniform) / 10) * 10);
  // repeat: 0 — бесконечно, n — ещё n повторов после первого показа.
  const repeat = opts.plays <= 0 ? 0 : opts.plays === 1 ? -1 : opts.plays - 1;
  let prev: Uint8Array | null = null;
  for (const [i, f] of frames.entries()) {
    const delay = delayOf(i);
    const idx = applyPalette(f, pal);
    if (!prev) {
      gif.writeFrame(idx, w, h, {
        palette,
        delay,
        repeat,
        transparent: true,
        transparentIndex: T,
        dispose: 1,
      });
    } else {
      const d = new Uint8Array(idx.length);
      for (let p = 0; p < idx.length; p++) d[p] = idx[p] === prev[p] ? T : idx[p];
      gif.writeFrame(d, w, h, { delay, transparent: true, transparentIndex: T, dispose: 1 });
    }
    prev = idx;
  }
  gif.finish();
  return gif.bytes();
}

/**
 * Одинаковые кадры подряд — один кадр подольше. Вес почти тот же, но реальная частота
 * кадров честная: Google требует «медленнее 5 кадр/с», стоп-кадр между движениями
 * должен быть одним длинным кадром, а не десятком одинаковых.
 */
export function mergeStill(
  frames: Uint8ClampedArray[],
  delayMs: number,
): { frames: Uint8ClampedArray[]; delays: number[] } {
  const out: Uint8ClampedArray[] = [];
  const delays: number[] = [];
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false;
    return true;
  };
  for (const f of frames) {
    if (out.length && same(out[out.length - 1], f)) delays[delays.length - 1] += delayMs;
    else {
      out.push(f);
      delays.push(delayMs);
    }
  }
  // Последний кадр совпал с первым — склеиваем через шов цикла.
  if (out.length > 1 && same(out[out.length - 1], out[0])) {
    delays[0] += delays.pop()!;
    out.pop();
  }
  return { frames: out, delays };
}

/** Кодирует цикл кадров одной частоты (со склейкой стоп-кадров) и меряет его. */
function encodeLoop(
  frames: Uint8ClampedArray[],
  w: number,
  h: number,
  fps: number,
  colors: number,
  plays: number,
  maxBytes: number,
): GifResult {
  const step = Math.round(1000 / fps / 10) * 10;
  const m = mergeStill(frames, step);
  const bytes = encodeGif(m.frames, w, h, { delays: m.delays, colors, plays });
  return {
    bytes,
    fps,
    colors,
    frames: m.frames.length,
    overLimit: bytes.length > maxBytes,
    seconds: (frames.length * step) / 1000,
    minFrameMs: Math.min(...m.delays.map((d) => Math.round(d / 10) * 10)),
  };
}

/** Вся цепочка над готовой RGBA-базой; вес подгоняем под лимит. */
export function makeGifFromPixels(
  base: Uint8ClampedArray,
  w: number,
  h: number,
  o: GifOptions,
): GifResult {
  const seconds = o.seconds ?? 2.4;
  const plays = o.plays ?? 3;
  const maxBytes = o.maxBytes ?? GDN_GIF_LIMIT;
  const mask = shineMask(base, w, h);
  const sparks = o.sparkles
    ? sparkPoints(mask, w, h, Math.max(3, Math.min(7, Math.round((w * h) / 26000) + 2)))
    : [];
  const tries: GifLadder = o.ladder ?? [
    { fps: 12.5, colors: 256 },
    { fps: 12.5, colors: 128 },
    { fps: 10, colors: 128 },
    { fps: 10, colors: 64 },
    { fps: 8, colors: 64 },
    { fps: 8, colors: 32 },
  ];
  // Лимит недостижим (крупный размер, наезд) — отдаём 128 цветов: 32 цвета на фото уже грязь.
  let fallback: GifResult | null = null;
  const cache = new Map<number, Uint8ClampedArray[]>();
  for (const tr of tries) {
    let frames = cache.get(tr.fps);
    if (!frames) {
      const n = Math.max(2, Math.round(seconds * tr.fps));
      frames = Array.from({ length: n }, (_, i) => renderFrame(base, mask, sparks, w, h, i / n, o));
      cache.set(tr.fps, frames);
    }
    const r = encodeLoop(frames, w, h, tr.fps, tr.colors, plays, maxBytes);
    if ((tr.colors === 128 && !fallback) || tries.length === 1) fallback ??= r;
    if (!r.overLimit) return r;
  }
  return (fallback ??
    encodeLoop(
      cache.get(tries[0].fps)!,
      w,
      h,
      tries[0].fps,
      tries[0].colors,
      plays,
      maxBytes,
    )) as GifResult;
}

/**
 * GIF из готовых кадров (анимация баннера по слоям): render(fps) даёт кадры цикла.
 * Подгонка веса — сначала цвета, потом fps; ниже 10 кадр/с движение рвётся, не идём.
 */
export function makeGifFromFrames(
  render: (fps: number) => Uint8ClampedArray[],
  w: number,
  h: number,
  o: { plays?: number; maxBytes?: number; ladder?: GifLadder },
): GifResult {
  const plays = o.plays ?? 3;
  const maxBytes = o.maxBytes ?? GDN_GIF_LIMIT;
  const tries: GifLadder = o.ladder ?? [
    { fps: 15, colors: 256 },
    { fps: 15, colors: 128 },
    { fps: 12.5, colors: 128 },
    { fps: 10, colors: 128 },
    { fps: 10, colors: 64 },
  ];
  const cache = new Map<number, Uint8ClampedArray[]>();
  let fallback: GifResult | null = null;
  for (const tr of tries) {
    let frames = cache.get(tr.fps);
    if (!frames) cache.set(tr.fps, (frames = render(tr.fps)));
    const r = encodeLoop(frames, w, h, tr.fps, tr.colors, plays, maxBytes);
    // Лимит недостижим — отдаём 128 цветов на самой частой ступени (или первую, если 128 нет).
    if (tr.colors === 128 && tr.fps === tries[0].fps) fallback ??= r;
    if (!r.overLimit) return r;
  }
  return (
    fallback ??
    encodeLoop(cache.get(tries[0].fps)!, w, h, tries[0].fps, tries[0].colors, plays, maxBytes)
  );
}

/** Браузер: картинка → RGBA ровно w×h (cover, по центру). */
export async function pixelsFromImage(
  src: string,
  w: number,
  h: number,
): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("canvas 2d недоступен");
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return g.getImageData(0, 0, w, h).data;
}

/** Натуральный размер картинки (для GIF из мастера — уменьшаем с теми же пропорциями). */
export async function imageSize(src: string): Promise<{ w: number; h: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}
