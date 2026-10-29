// Тонкие форматы баннеров (728×90, 970×90, 468×60, 320×50, 160×600, 300×1050…)
// собираются слоями, а не кропом мастера.
//
// Модель не рисует 8:1 (максимум 3:1), а кроп из 16:9 режет героя и текст. Поэтому:
//   1. «чистая подложка» — та же сцена и персонаж, что в мастере, но без единого
//      текста (generate-image с plate: wide → 3:1, герой слева; tall → 1:3, герой внизу);
//   2. поверх код кладёт лого, заголовок, оффер и кнопку — шрифт и кириллица всегда
//      верные, текст читается на любом размере, автоподгонка как у кнопок плейблов.
//
// layoutBanner — чистая раскладка (без DOM, проверяется в scripts/banner-layers-check.mts),
// renderBanner — отрисовка раскладки на canvas в браузере.

export type LayerKind = "strip" | "tower";

/** Какие размеры собираем слоями: очень вытянутые. Остальные — как раньше (i2i + кроп). */
export function layerKind(w: number, h: number): LayerKind | null {
  if (w / h >= 3.2) return "strip";
  if (h / w >= 2.2) return "tower";
  return null;
}

export type BannerTexts = { headline: string; offer: string; cta: string };

export type LayerOpts = {
  texts: BannerTexts;
  /** Цвет кнопки и оффера. */
  accent: string;
  /** Есть ли лого (сама картинка — у renderBanner). */
  logo?: { w: number; h: number } | null;
};

/** Ширина строки текста данным шрифтом (canvas.measureText или оценка в проверке). */
export type Measure = (text: string, font: string) => number;

export type Box = { x: number; y: number; w: number; h: number };
export type TextOp = { kind: "text"; text: string; x: number; y: number; size: number; font: string; color: string; align: CanvasTextAlign; maxW: number };
export type Op =
  | { kind: "plate"; mode: "strip-left" | "cover"; box: Box }
  | { kind: "shade"; dir: "right" | "top"; box: Box }
  | { kind: "logo"; box: Box }
  | { kind: "button"; box: Box; color: string }
  | TextOp;

export const HEAD_FONT = `"Unbounded","Arial Black",Arial,sans-serif`;
export const BODY_FONT = `"Manrope","Segoe UI",Roboto,Arial,sans-serif`;
const font = (weight: number, size: number, family: string) => `${weight} ${Math.round(size * 10) / 10}px ${family}`;

/** Самый крупный кегль от max вниз до min, при котором строка влезает в ширину; null — не влезает. */
function fitSize(m: Measure, text: string, weight: number, family: string, maxW: number, max: number, min: number): number | null {
  for (let s = max; s >= min; s -= 0.5) if (m(text, font(weight, s, family)) <= maxW) return s;
  return null;
}

/** Перенос по словам в не более чем lines строк заданной ширины. */
function wrap(m: Measure, text: string, f: string, maxW: number, lines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (m(t, f) <= maxW) cur = t;
    else {
      if (!cur) return null; // одно слово шире строки
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out.length <= lines ? out : null;
}

/** Контрастный цвет текста на кнопке. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#0b0815";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#0b0815" : "#ffffff";
}

export function layoutBanner(w: number, h: number, kind: LayerKind, o: LayerOpts, m: Measure): Op[] {
  return kind === "strip" ? layoutStrip(w, h, o, m) : layoutTower(w, h, o, m);
}

// [герой из подложки | лого | заголовок + оффер | кнопка] в одну линию.
function layoutStrip(w: number, h: number, o: LayerOpts, m: Measure): Op[] {
  const ops: Op[] = [];
  const pad = Math.max(4, Math.round(h * 0.12));
  // Подложка 3:1 по высоте баннера — герой слева целиком; правее — она же, размытая.
  const heroW = Math.min(Math.round(h * 3), Math.round(w * 0.42));
  ops.push({ kind: "plate", mode: "strip-left", box: { x: 0, y: 0, w: heroW, h } });
  ops.push({ kind: "shade", dir: "right", box: { x: Math.round(heroW * 0.3), y: 0, w: w - Math.round(heroW * 0.3), h } });

  // Кнопка справа.
  const cta = o.texts.cta.trim().toUpperCase();
  let right = w - pad;
  if (cta) {
    const bh = Math.round(Math.min(h * 0.62, 48));
    const maxBw = Math.round(w * (h < 70 ? 0.36 : 0.28));
    const size = fitSize(m, cta, 800, BODY_FONT, maxBw - bh * 0.7, Math.min(bh * 0.42, 18), 7) ?? 7;
    const bw = Math.min(maxBw, Math.round(m(cta, font(800, size, BODY_FONT)) + bh * 0.8));
    const box = { x: right - bw, y: Math.round((h - bh) / 2), w: bw, h: bh };
    ops.push({ kind: "button", box, color: o.accent });
    ops.push({ kind: "text", text: cta, x: box.x + bw / 2, y: box.y + bh / 2, size, font: font(800, size, BODY_FONT), color: inkOn(o.accent), align: "center", maxW: bw - 6 });
    right = box.x - pad;
  }

  // Лого — после героя, если место есть.
  // Герой в подложке — в левой трети (до ~36% её ширины); текст сразу за ним.
  let left = Math.round(heroW * 0.4);
  if (o.logo && w >= 400) {
    const lh = Math.round(h * 0.42);
    const lw = Math.min(Math.round((lh * o.logo.w) / Math.max(1, o.logo.h)), Math.round(w * 0.14));
    ops.push({ kind: "logo", box: { x: left, y: Math.round((h - lh) / 2), w: lw, h: lh } });
    left += lw + pad;
  }

  // Текст: на низких полосах — только оффер, иначе заголовок + оффер двумя строками.
  const colW = right - left;
  if (colW < 30) return ops;
  const offer = o.texts.offer.trim() || o.texts.headline.trim();
  const headline = o.texts.offer.trim() ? o.texts.headline.trim() : "";
  const two = h >= 70 && headline && offer;
  if (two) {
    const hs = fitSize(m, headline, 800, BODY_FONT, colW, h * 0.24, 9);
    const os = fitSize(m, offer, 900, HEAD_FONT, colW, h * 0.34, 10);
    if (hs && os) {
      const total = hs * 1.15 + os * 1.1;
      const y0 = (h - total) / 2;
      ops.push({ kind: "text", text: headline, x: left, y: y0 + (hs * 1.15) / 2, size: hs, font: font(800, hs, BODY_FONT), color: "#ffffff", align: "left", maxW: colW });
      ops.push({ kind: "text", text: offer, x: left, y: y0 + hs * 1.15 + (os * 1.1) / 2, size: os, font: font(900, os, HEAD_FONT), color: o.accent, align: "left", maxW: colW });
      return ops;
    }
  }
  // Одна строка → две строки → сжатый оффер («фриспинов» → FS, «и» → +) → только главное число.
  // Варианты: полный оффер, сжатый, главная часть — в одну или две строки. Берём самый
  // крупный кегль; сжатие и обрезка — со штрафом, чтобы без нужды не терять слова.
  const line = offer || headline;
  if (!line) return ops;
  let best: { lines: string[]; size: number; score: number } | null = null;
  const seen = new Set<string>();
  for (const [t, k] of [[line, 1], [compactOffer(line), 0.85], [mainPart(line), 0.55]] as const) {
    if (seen.has(t)) continue;
    seen.add(t);
    const s1 = fitSize(m, t, 900, HEAD_FONT, colW, h * 0.42, 8);
    if (s1 && (!best || s1 * k > best.score)) best = { lines: [t], size: s1, score: s1 * k };
    for (let s2 = Math.min(h * 0.34, (h - 4) / 2.2); s2 >= 8; s2 -= 0.5) {
      const lines = wrap(m, t, font(900, s2, HEAD_FONT), colW, 2);
      if (!lines) continue;
      // Две строки чуть хуже одной того же кегля.
      if (!best || s2 * k * 0.95 > best.score) best = { lines, size: s2, score: s2 * k * 0.95 };
      break;
    }
  }
  if (best) {
    const s = best.size;
    const y0 = (h - best.lines.length * s * 1.08) / 2;
    best.lines.forEach((l, i) => ops.push({ kind: "text", text: l, x: left, y: y0 + s * 1.08 * (i + 0.5), size: s, font: font(900, s, HEAD_FONT), color: "#ffffff", align: "left", maxW: colW }));
  }
  return ops;
}

/** «+200% до 50 000 ₽ и 500 фриспинов» → «+200% до 50K ₽ + 500 FS». */
export function compactOffer(t: string): string {
  return t
    .replace(/(\d)[\s  .,]?000[\s  .,]?000\b/g, "$1M")
    .replace(/(\d+)[\s  .,]000\b/g, "$1K")
    .replace(/\s(и|і|та|and)\s/gi, " + ")
    .replace(/фри\s?спин\w*|free\s?spins?|фриспін\w*/gi, "FS")
    .replace(/фрибет\w*/gi, "FB")
    .replace(/\s+/g, " ")
    .trim();
}

/** Главная часть оффера — до первого «+ / и»: «+200% до 50K ₽». */
function mainPart(t: string): string {
  const c = compactOffer(t);
  return c.split(/\s\+\s/)[0].trim();
}

// Подложка 1:3 на всю высоту: сверху лого, заголовок, оффер; внизу кнопка; герой — между.
function layoutTower(w: number, h: number, o: LayerOpts, m: Measure): Op[] {
  const ops: Op[] = [{ kind: "plate", mode: "cover", box: { x: 0, y: 0, w, h } }, { kind: "shade", dir: "top", box: { x: 0, y: 0, w, h: Math.round(h * 0.55) } }];
  const pad = Math.round(w * 0.09);
  const colW = w - pad * 2;
  let y = pad;
  if (o.logo) {
    const lh = Math.round(Math.min(w * 0.22, h * 0.06));
    const lw = Math.min(colW, Math.round((lh * o.logo.w) / Math.max(1, o.logo.h)));
    ops.push({ kind: "logo", box: { x: Math.round((w - lw) / 2), y, w: lw, h: lh } });
    y += lh + pad * 0.8;
  }
  const headline = o.texts.headline.trim();
  if (headline) {
    for (let s = Math.min(w * 0.13, 30); s >= 9; s -= 0.5) {
      const f = font(900, s, HEAD_FONT);
      const lines = wrap(m, headline.toUpperCase(), f, colW, 4);
      if (!lines) continue;
      for (const l of lines) {
        ops.push({ kind: "text", text: l, x: w / 2, y: y + s * 0.55, size: s, font: f, color: "#ffffff", align: "center", maxW: colW });
        y += s * 1.08;
      }
      y += s * 0.4;
      break;
    }
  }
  const offer = o.texts.offer.trim();
  if (offer) {
    for (let s = Math.min(w * 0.16, 40); s >= 10; s -= 0.5) {
      const f = font(900, s, HEAD_FONT);
      const lines = wrap(m, offer, f, colW, 3);
      if (!lines) continue;
      for (const l of lines) {
        ops.push({ kind: "text", text: l, x: w / 2, y: y + s * 0.55, size: s, font: f, color: o.accent, align: "center", maxW: colW });
        y += s * 1.08;
      }
      break;
    }
  }
  const cta = o.texts.cta.trim().toUpperCase();
  if (cta) {
    const bh = Math.round(Math.min(w * 0.24, 54));
    const bw = colW;
    const size = fitSize(m, cta, 800, BODY_FONT, bw - bh * 0.6, Math.min(bh * 0.4, 18), 7) ?? 7;
    const box = { x: pad, y: h - pad - bh, w: bw, h: bh };
    ops.push({ kind: "button", box, color: o.accent });
    ops.push({ kind: "text", text: cta, x: w / 2, y: box.y + bh / 2, size, font: font(800, size, BODY_FONT), color: inkOn(o.accent), align: "center", maxW: bw - 6 });
  }
  return ops;
}

// ---------------------------------------------------------------- браузер

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Не удалось загрузить картинку"));
    i.src = src;
  });

let fontsReady: Promise<void> | null = null;
/** Шрифты лендингов (Unbounded, Manrope) — те же, что в промо-раскладке. */
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (!document.querySelector("link[data-banner-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@600;800&family=Unbounded:wght@800;900&display=swap";
      l.dataset.bannerFonts = "1";
      document.head.appendChild(l);
      await new Promise((r) => {
        l.onload = r;
        l.onerror = r;
      });
    }
    await Promise.all(["900 20px Unbounded", "800 20px Manrope"].map((f) => document.fonts.load(f, "АБВ abc 123").catch(() => [])));
  })();
  return fontsReady;
}

/** Собирает баннер w×h из подложки и текстов. Возвращает JPEG data URL. */
export async function renderBanner(w: number, h: number, kind: LayerKind, plateSrc: string, o: LayerOpts & { logoSrc?: string }): Promise<string> {
  await ensureFonts();
  const [plate, logo] = await Promise.all([loadImg(plateSrc), o.logoSrc ? loadImg(o.logoSrc).catch(() => null) : Promise.resolve(null)]);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const measure: Measure = (t, f) => {
    g.font = f;
    return g.measureText(t).width;
  };
  const ops = layoutBanner(w, h, kind, { ...o, logo: logo ? { w: logo.naturalWidth, h: logo.naturalHeight } : null }, measure);
  g.fillStyle = "#0b0815";
  g.fillRect(0, 0, w, h);
  for (const op of ops) {
    if (op.kind === "plate") {
      if (op.mode === "strip-left") {
        // Фон всей полосы — подложка по ширине, размытая и притемнённая; герой — резко слева.
        g.save();
        g.filter = `blur(${Math.max(2, Math.round(h * 0.08))}px) brightness(.55)`;
        drawCover(g, plate, { x: -10, y: -10, w: w + 20, h: h + 20 }, 0.75);
        g.restore();
        // Резкий герой с мягким краем справа — без шва с размытым фоном.
        const off = document.createElement("canvas");
        off.width = op.box.w;
        off.height = op.box.h;
        const og = off.getContext("2d")!;
        drawCover(og, plate, { x: 0, y: 0, w: op.box.w, h: op.box.h }, 0.16);
        og.globalCompositeOperation = "destination-in";
        const fade = og.createLinearGradient(0, 0, op.box.w, 0);
        fade.addColorStop(0, "#000");
        fade.addColorStop(0.62, "#000");
        fade.addColorStop(1, "rgba(0,0,0,0)");
        og.fillStyle = fade;
        og.fillRect(0, 0, op.box.w, op.box.h);
        g.drawImage(off, op.box.x, op.box.y);
      } else drawCover(g, plate, op.box, 0.5);
    } else if (op.kind === "shade") {
      const b = op.box;
      const gr = op.dir === "right" ? g.createLinearGradient(b.x, 0, b.x + Math.min(b.w, h * 2.2), 0) : g.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (op.dir === "right") {
        gr.addColorStop(0, "rgba(11,8,21,0)");
        gr.addColorStop(1, "rgba(11,8,21,.72)");
      } else {
        gr.addColorStop(0, "rgba(11,8,21,.78)");
        gr.addColorStop(1, "rgba(11,8,21,0)");
      }
      g.fillStyle = gr;
      g.fillRect(b.x, b.y, b.w, b.h);
    } else if (op.kind === "logo" && logo) {
      const b = op.box;
      const s = Math.min(b.w / logo.naturalWidth, b.h / logo.naturalHeight);
      const lw = logo.naturalWidth * s, lh = logo.naturalHeight * s;
      g.drawImage(logo, b.x + (b.w - lw) / 2, b.y + (b.h - lh) / 2, lw, lh);
    } else if (op.kind === "button") {
      const b = op.box;
      g.save();
      g.shadowColor = "rgba(0,0,0,.45)";
      g.shadowBlur = Math.round(b.h * 0.3);
      g.shadowOffsetY = Math.round(b.h * 0.08);
      g.fillStyle = op.color;
      roundRect(g, b, Math.round(b.h * 0.32));
      g.fill();
      g.restore();
      const hi = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      hi.addColorStop(0, "rgba(255,255,255,.28)");
      hi.addColorStop(0.5, "rgba(255,255,255,0)");
      g.fillStyle = hi;
      roundRect(g, b, Math.round(b.h * 0.32));
      g.fill();
    } else if (op.kind === "text") {
      g.font = op.font;
      g.textAlign = op.align;
      g.textBaseline = "middle";
      g.save();
      g.shadowColor = "rgba(0,0,0,.6)";
      g.shadowBlur = op.color === "#ffffff" || op.color === "#0b0815" ? Math.round(op.size * 0.35) : 0;
      g.fillStyle = op.color;
      g.fillText(op.text, op.x, op.y, op.maxW);
      g.restore();
    }
  }
  return c.toDataURL("image/jpeg", 0.9);
}

/** Картинка «cover» в рамку; fx — куда смещён кадр по горизонтали (0 — левый край, 0.5 — центр). */
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, b: Box, fx: number) {
  const s = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight);
  const sw = b.w / s, sh = b.h / s;
  const sx = Math.max(0, Math.min(img.naturalWidth - sw, img.naturalWidth * fx - sw / 2));
  const sy = (img.naturalHeight - sh) / 2;
  g.drawImage(img, sx, sy, sw, sh, b.x, b.y, b.w, b.h);
}

function roundRect(g: CanvasRenderingContext2D, b: Box, r: number) {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, r);
}
