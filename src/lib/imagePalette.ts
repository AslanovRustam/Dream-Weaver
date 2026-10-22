// Палитра по картинке: после генерации фона интерфейс подстраивается под него —
// градиент заголовков, плашки, кнопки и сектора колеса берут тон картинки,
// а не остаются «золотом по умолчанию».
//
// Берём главный цветовой тон (по насыщенным пикселям, с весом насыщенности),
// второй — заметно отличающийся, и общую яркость. Почти серая картинка
// (ночной город, чёрно-серая тема) даёт «серебро» с акцентом самого
// насыщенного, что в ней нашлось.

import type { UiPalette, WheelPalette } from "./scenes/presets";

export type ImagePalette = {
  /** Главный тон, 0–360; null — картинка почти без цвета. */
  hue: number | null;
  /** Второй тон для чередования (сектора колеса). */
  hue2: number | null;
  /** Насыщенность главного тона, 0–1. */
  sat: number;
};

function hex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Палитра из пикселей RGBA (картинка уже уменьшена). */
export function paletteFromPixels(data: Uint8ClampedArray): ImagePalette {
  const BINS = 36;
  const w = new Array<number>(BINS).fill(0);
  let total = 0, satSum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    n++;
    satSum += s;
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    const weight = s * (1 - Math.abs(l - 0.5));
    w[Math.floor(h / (360 / BINS)) % BINS] += weight;
    total += weight;
  }
  const avgSat = n ? satSum / n : 0;
  if (!total || total / Math.max(1, n) < 0.02) return { hue: null, hue2: null, sat: avgSat };
  // Сглаживаем соседние корзины, чтобы тон не дробился.
  const sm = w.map((v, i) => v + 0.5 * (w[(i + 1) % BINS] + w[(i + BINS - 1) % BINS]));
  const top = sm.indexOf(Math.max(...sm));
  const hue = (top + 0.5) * (360 / BINS);
  let second = -1;
  sm.forEach((v, i) => {
    const dist = Math.min(Math.abs(i - top), BINS - Math.abs(i - top)) * (360 / BINS);
    if (dist >= 50 && (second < 0 || v > sm[second])) second = i;
  });
  const hue2 = second >= 0 && sm[second] > sm[top] * 0.15 ? (second + 0.5) * (360 / BINS) : null;
  return { hue, hue2, sat: avgSat };
}

/** Палитра картинки (data-URL) — в браузере, через канвас 64×64. */
export async function paletteFromImage(src: string): Promise<ImagePalette> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image"));
    i.src = src;
  });
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return { hue: null, hue2: null, sat: 0 };
  ctx.drawImage(img, 0, 0, 64, 64);
  return paletteFromPixels(ctx.getImageData(0, 0, 64, 64).data);
}

/** Цвета интерфейса сцены (заголовки, плашки, обводка) — в тон картинке. */
export function uiFromPalette(p: ImagePalette): UiPalette {
  if (p.hue === null) {
    // Серебро: светлый металл с холодной тенью.
    return { g1: "#ffffff", g2: "#e3e7ef", g3: "#a8b0c0", g4: "#5c6577", ink: "#10131a", accent: "#dfe6f2", rim: "#9aa3b5", plate1: "#2a2f3af0", plate2: "#0c0e13f5" };
  }
  const h = p.hue;
  return {
    g1: hex(h, 95, 93),
    g2: hex(h, 90, 72),
    g3: hex(h, 82, 52),
    g4: hex(h, 78, 34),
    ink: hex(h, 70, 9),
    accent: hex(h, 90, 66),
    rim: hex(h, 70, 48),
    // Плашки — глубокий тёмный тон картинки, чтобы не торчали коричневым на синем или зелёном.
    plate1: hex(h, 45, 17) + "f0",
    plate2: hex(h, 50, 7) + "f5",
  };
}

/** Сектора колеса: главный тон и второй (или тёмный вариант главного). */
export function wheelFromPalette(p: ImagePalette): WheelPalette {
  if (p.hue === null) {
    return {
      a: ["#9aa3b5", "#3a4252"], b: ["#2a2f3a", "#0d1016"], win: ["#ffffff", "#b8c2d4"],
      line: "#dfe6f2", ink: "#ffffff", stroke: "#0d1016", winInk: "#1a1f2a", winStroke: "#ffffff",
    };
  }
  const h = p.hue, h2 = p.hue2 ?? (h + 200) % 360;
  return {
    a: [hex(h, 80, 58), hex(h, 75, 28)],
    b: [hex(h2, 55, 32), hex(h2, 55, 13)],
    win: [hex(h, 95, 88), hex(h, 85, 55)],
    line: hex(h, 85, 75),
    ink: "#ffffff",
    stroke: hex(h, 70, 10),
    winInk: hex(h, 70, 15),
    winStroke: hex(h, 95, 92),
  };
}

/** Акцент лендинга (кнопки, подсветка) — в тон картинке. */
export function accentFromPalette(p: ImagePalette): string {
  return p.hue === null ? "#cfd8e6" : hex(p.hue, 88, 58);
}

/** Палитра из одного цвета (пипетка, выбор цвета): тон и насыщенность этого цвета. */
export function paletteFromHex(hexColor: string): ImagePalette {
  const m = /^#?([0-9a-f]{6})$/i.exec(hexColor.trim());
  if (!m) return { hue: null, hue2: null, sat: 0 };
  const n = parseInt(m[1], 16);
  const [h, s] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  // Почти серый цвет — «серебро», как у бесцветной картинки.
  return s < 0.12 ? { hue: null, hue2: null, sat: s } : { hue: h, hue2: null, sat: s };
}
