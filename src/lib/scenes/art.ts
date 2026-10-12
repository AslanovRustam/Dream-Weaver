// Подготовка ИИ-картинок к встраиванию в сцену. Модель не кладёт деталь
// пиксель в пиксель, поэтому геометрию снимаем с самой картинки: обрезаем по
// видимой части, у рамы колеса меряем внутренний радиус и вычищаем центр —
// туда ляжет наш диск с секторами. Всё ужимается в WebP (с альфой), а где
// браузер WebP не кодирует (Safari) — в PNG.

export type FrameArt = { src: string; /** Внутренний радиус кольца, доля от радиуса картинки. */ inner: number };

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Не удалось прочитать картинку"));
    im.src = src;
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas недоступен");
  return { c, ctx };
}

/** WebP, если браузер умеет его кодировать, иначе PNG. */
function encode(c: HTMLCanvasElement, quality = 0.86): string {
  const webp = c.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
}

/** Рамка непрозрачной части (альфа > порога). */
function alphaBox(data: Uint8ClampedArray, w: number, h: number, threshold = 16) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Обрезать по видимой части и вписать в maxSide; square — с полями до квадрата. */
async function trim(src: string, maxSide: number, square: boolean) {
  const im = await load(src);
  const a = canvas(im.naturalWidth, im.naturalHeight);
  a.ctx.drawImage(im, 0, 0);
  const box = alphaBox(a.ctx.getImageData(0, 0, a.c.width, a.c.height).data, a.c.width, a.c.height);
  const bw = square ? Math.max(box.w, box.h) : box.w;
  const bh = square ? Math.max(box.w, box.h) : box.h;
  const s = Math.min(1, maxSide / Math.max(bw, bh));
  const out = canvas(Math.round(bw * s), Math.round(bh * s));
  out.ctx.imageSmoothingQuality = "high";
  out.ctx.drawImage(
    a.c,
    box.x - (bw - box.w) / 2,
    box.y - (bh - box.h) / 2,
    bw,
    bh,
    0,
    0,
    out.c.width,
    out.c.height,
  );
  return out;
}

/**
 * Рама колеса. Внутренний радиус ищем лучами из центра: первый непрозрачный
 * пиксель на каждом луче, берём медиану. Если модель всё-таки нарисовала
 * что-то внутри (лучи упёрлись сразу), берём типичную толщину обода.
 */
export async function prepareWheelFrame(src: string, size = 840): Promise<FrameArt> {
  const { c, ctx } = await trim(src, size, true);
  const w = c.width, half = w / 2;
  const data = ctx.getImageData(0, 0, w, w).data;
  const hits: number[] = [];
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    for (let r = half * 0.3; r < half; r += 1) {
      const x = Math.round(half + Math.cos(ang) * r), y = Math.round(half + Math.sin(ang) * r);
      if (data[(y * w + x) * 4 + 3] > 128) {
        hits.push(r / half);
        break;
      }
    }
  }
  hits.sort((p, q) => p - q);
  const median = hits.length ? hits[Math.floor(hits.length / 2)] : 0;
  const inner = median >= 0.6 && median <= 0.94 ? median : 0.82;
  // Вычищаем центр: всё, что внутри обода, закроет наш диск.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(half, half, inner * half - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return { src: encode(c), inner: Math.round(inner * 1000) / 1000 };
}

/** Указатель, центр, награда — обрезка по видимой части и ужатие. */
export async function prepareSprite(src: string, maxSide: number, square = false): Promise<string> {
  const { c } = await trim(src, maxSide, square);
  return encode(c);
}

/**
 * Фон: без альфы, WebP (JPEG, где WebP не кодируется). Квадрат ужимаем до
 * 1920 — длинной стороны сцены: «cover» тогда в обеих ориентациях кладёт
 * его 1:1, без растяжения.
 */
export async function prepareBackground(src: string, side = 1920): Promise<string> {
  const im = await load(src);
  const s = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
  const { c, ctx } = canvas(Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const webp = c.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.84);
}
