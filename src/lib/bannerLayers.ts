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

import { artWords, type ArtPiece } from "./textArt";

/**
 * strip / tower — тонкие форматы (статика и GIF); square / landscape / portrait —
 * остальные пропорции: статика у них от модели, а GIF собирается слоями.
 */
export type LayerKind = "strip" | "tower" | "square" | "landscape" | "portrait";

/** Какие размеры собираем слоями: очень вытянутые. Остальные — как раньше (i2i + кроп). */
export function layerKind(w: number, h: number): LayerKind | null {
  if (w / h >= 3.2) return "strip";
  if (h / w >= 2.2) return "tower";
  return null;
}

/** sub — доп-текст (подзаголовок): в статике не помещается, в GIF — отдельным кадром. */
/** Форма для GIF: тонкие — как в статике, остальные — квадрат / горизонталь / портрет. */
export function gifKind(w: number, h: number): LayerKind {
  const k = layerKind(w, h);
  if (k) return k;
  const r = w / h;
  return r >= 1.3 ? "landscape" : r <= 0.77 ? "portrait" : "square";
}

/** Подложка каждой формы — как её рисует generate-image (plate). */
export const PLATES: Record<LayerKind, { w: number; h: number; ratio: string }> = {
  strip: { w: 1536, h: 512, ratio: "3:1" },
  tower: { w: 512, h: 1536, ratio: "1:3" },
  square: { w: 1024, h: 1024, ratio: "1:1" },
  landscape: { w: 1536, h: 1024, ratio: "3:2" },
  portrait: { w: 1024, h: 1536, ratio: "2:3" },
};

export type BannerTexts = {
  headline: string;
  offer: string;
  cta: string;
  sub?: string;
  /** Списки преимуществ мастера по бокам (пересборка мастера в «Слоях»). */
  sideL?: string[];
  sideR?: string[];
  /** У мастера была плашка 18+. */
  age?: boolean;
  /** Название бренда — в свободную верхнюю плашку мастера (если она была). */
  brand?: string;
  /** Преимущества рядом (у мастера были строкой внизу, а не колонками по бокам). */
  row?: string[];
  /** Разметка мастера — сохраняется в карточку вместе с текстами. */
  layout?: TextSlots | null;
};

/** Рамка в долях кадра (0..1). */
export type Box01 = { x: number; y: number; w: number; h: number };
/** Места надписей мастера (разница мастера и его чистой копии). */
export type TextSlots = {
  /** Пятна разницы мастер ↔ чистая копия (запасной путь), от крупного к мелкому. */
  blocks: Box01[];
  btn?: Box01;
  /** Из разметки мастера (read-layout): места по ролям надписей. */
  head?: Box01;
  offer?: Box01;
  brand?: Box01;
  /** Ряд преимуществ (у мастера — внизу). */
  row?: Box01;
  /** Лица персонажей — на них не кладётся ничего. */
  faces?: Box01[];
};

/** Декор листа (generate-text-art, kind "decor"): лавр (левая ветвь), корона, искра. */
export type DecorName = "laurel" | "crown" | "sparkle";

export type LayerOpts = {
  texts: BannerTexts;
  /** Цвет кнопки и оффера. */
  accent: string;
  /** Есть ли лого (сама картинка — у renderBanner). */
  logo?: { w: number; h: number } | null;
  /** Кнопка-ассет (нарисована моделью вместе с надписью) — её пропорции; нет — кнопка кодом. */
  ctaArt?: { w: number; h: number } | null;
  /** Кадр GIF «лого»: лого крупно в зоне текста, без надписей. */
  logoHero?: boolean;
  /** Строка одиночным кадром — акцентным цветом (кадр оффера). */
  lineAccent?: boolean;
  /** Персонаж отдельным слоем (фон без него) — пропорции вырезки; код ставит его с учётом текста. */
  hero?: { w: number; h: number } | null;
  /** Пересборка самого мастера: подложка — его чистая копия, заголовок сверху, оффер и кнопка снизу. */
  split?: boolean;
  /** Декор, нарисованный моделью в стиле мастера, — пропорции каждого элемента. */
  decor?: Partial<Record<DecorName, { w: number; h: number }>> | null;
  /** Где у мастера стояли заголовок, оффер и кнопка — туда и кладём новые. */
  slots?: TextSlots | null;
};

/** Ширина строки текста данным шрифтом (canvas.measureText или оценка в проверке). */
export type Measure = (text: string, font: string) => number;

export type Box = { x: number; y: number; w: number; h: number };
export type TextOp = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  color: string;
  align: CanvasTextAlign;
  maxW: number;
  /** Текст кнопки — всегда шрифтом, не надписями-ассетами. */
  noArt?: boolean;
};
export type Op =
  | { kind: "plate"; mode: "strip-left" | "cover"; box: Box }
  | { kind: "shade"; dir: "right" | "top" | "left" | "bottom"; box: Box }
  | { kind: "logo"; box: Box }
  | { kind: "hero"; box: Box }
  | { kind: "decor"; name: DecorName; box: Box; flip?: boolean }
  | { kind: "badge"; text: string; box: Box }
  | { kind: "button"; box: Box; color: string; art?: boolean }
  | TextOp;

export const HEAD_FONT = `"Unbounded","Arial Black",Arial,sans-serif`;
export const BODY_FONT = `"Manrope","Segoe UI",Roboto,Arial,sans-serif`;
const font = (weight: number, size: number, family: string) =>
  `${weight} ${Math.round(size * 10) / 10}px ${family}`;

/** Самый крупный кегль от max вниз до min, при котором строка влезает в ширину; null — не влезает. */
function fitSize(
  m: Measure,
  text: string,
  weight: number,
  family: string,
  maxW: number,
  max: number,
  min: number,
): number | null {
  for (let s = max; s >= min; s -= 0.5) if (m(text, font(weight, s, family)) <= maxW) return s;
  return null;
}

/** Перенос по словам в не более чем lines строк заданной ширины. */
/**
 * Смысловые куски строки — переносим только между ними, чтобы не рвать логику оффера:
 * «+» / «и» идут вместе со следующим («+ 500 фриспинов» целиком на новую строку),
 * предлог — со своим числом («до 50 000 ₽»), число — со своим словом («500 фриспинов»).
 */
export function wrapUnits(text: string): string[][] {
  // «50 000», «1 000 000» — одно слово: разряды не разносим по строкам.
  const words = text
    .replace(/(\d)\s(?=\d{3}\b)/g, "$1\u00a0")
    .split(/[ \t\n]+/)
    .filter(Boolean);
  const isSep = (w: string) => /^(\+|&|и|і|та|and|y|e|und|et|ve)$/i.test(w);
  const isPrep = (w: string) => /^(до|от|на|за|по|из|up|to|of|bis|до\.)$/i.test(w);
  const isNum = (w: string) => /\d/.test(w);
  const units: string[][] = [];
  let cur: string[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const glue =
      next !== undefined &&
      (isSep(w) || isPrep(w) || (isNum(w) && !isNum(next) && !isSep(next) && !isPrep(next)));
    if (!glue) {
      units.push(cur);
      cur = [];
    }
  });
  if (cur.length) units.push(cur);
  return units;
}

function wrap(m: Measure, text: string, f: string, maxW: number, lines: number): string[] | null {
  // Кусок шире строки — смысл не рвём: не влезает (вызывающий возьмёт сжатый оффер или
  // кегль мельче). Делим на слова только одно слово-кусок не делится — тогда тоже нет.
  const units = wrapUnits(text).map((u) => u.join(" "));
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    const t = cur ? `${cur} ${u}` : u;
    if (m(t, f) <= maxW) cur = t;
    else {
      if (!cur) return null; // одно слово шире строки
      out.push(cur);
      cur = u;
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

export function layoutBanner(
  w: number,
  h: number,
  kind: LayerKind,
  o: LayerOpts,
  m: Measure,
): Op[] {
  if (o.split && kind !== "strip" && kind !== "tower") return layoutSplit(w, h, o, m);
  return kind === "strip" ? layoutStrip(w, h, o, m) : layoutColumn(w, h, kind, o, m);
}

// Как у мастера: подложка — его же чистая копия во весь кадр. Места надписей — из разметки
// мастера (o.slots: роли и рамки надписей, лица) или по разнице с чистой копией; нет мест —
// заголовок сверху, оффер и кнопка снизу.
// ЖЁСТКОЕ ПРАВИЛО: на лица персонажей не ложится ничего — ни текст, ни кнопка, ни декор.
// Зоны текста обрезаются вокруг лиц, а что всё равно задело лицо — не ставится.
function layoutSplit(w: number, h: number, o: LayerOpts, m: Measure): Op[] {
  const S = o.slots ?? null;
  const ops: Op[] = [{ kind: "plate", mode: "cover", box: { x: 0, y: 0, w, h } }];
  const hasSlots = !!S && (!!S.head || !!S.offer || S.blocks.length > 0);
  if (!hasSlots)
    ops.push(
      { kind: "shade", dir: "top", box: { x: 0, y: 0, w, h: Math.round(h * 0.3) } },
      { kind: "shade", dir: "bottom", box: { x: 0, y: Math.round(h * 0.58), w, h: h - Math.round(h * 0.58) } },
    );
  const decorAt = ops.length;
  const pad = Math.round(Math.min(w, h) * 0.05);
  const colW = w - pad * 2;
  const dec = o.decor ?? {};
  const px = (b: Box01): Box => ({ x: b.x * w, y: b.y * h, w: b.w * w, h: b.h * h });
  const faces = (S?.faces ?? []).map(px).map((f) => ({
    x: f.x - f.w * 0.08, y: f.y - f.h * 0.08, w: f.w * 1.16, h: f.h * 1.16,
  }));
  const hits = (b: Box) => faces.some((f) => b.x < f.x + f.w && b.x + b.w > f.x && b.y < f.y + f.h && b.y + b.h > f.y);
  /** Часть зоны без лиц: самая большая из областей над / под / слева / справа от лица. */
  const clear = (z: Box): Box => {
    let r = z;
    for (const f of faces) {
      if (!(r.x < f.x + f.w && r.x + r.w > f.x && r.y < f.y + f.h && r.y + r.h > f.y)) continue;
      const parts: Box[] = [
        { x: r.x, y: r.y, w: r.w, h: f.y - r.y },
        { x: r.x, y: f.y + f.h, w: r.w, h: r.y + r.h - (f.y + f.h) },
        { x: r.x, y: r.y, w: f.x - r.x, h: r.h },
        { x: f.x + f.w, y: r.y, w: r.x + r.w - (f.x + f.w), h: r.h },
      ].filter((p) => p.w > 0 && p.h > 0);
      r = parts.sort((p, q) => q.w * q.h - p.w * p.h)[0] ?? { ...r, h: 0 };
    }
    return r;
  };
  const textBox = (op: TextOp): Box => {
    const tw = Math.min(op.maxW, m(op.text, op.font));
    const x = op.align === "center" ? op.x - tw / 2 : op.align === "right" ? op.x - tw : op.x;
    return { x, y: op.y - op.size * 0.55, w: tw, h: op.size * 1.1 };
  };
  const push = (op: Op) => {
    // Последний рубеж правила лиц: элемент, задевший лицо, не ставится.
    const b = op.kind === "text" ? textBox(op) : "box" in op ? op.box : null;
    if (b && op.kind !== "plate" && op.kind !== "shade" && hits(b)) return false;
    if (op.kind === "decor") ops.splice(decorAt, 0, op);
    else ops.push(op);
    return true;
  };

  // Роли мест: из разметки по ролям; иначе по пятнам разницы (оффер с числом — в самое
  // крупное, заголовок — над ним; без оффера заголовок — в самое крупное).
  const blocks = S?.blocks ?? [];
  const hasOffer = !!o.texts.offer.trim();
  const offerS = S?.offer ?? (hasOffer ? blocks[0] : undefined);
  const headS =
    S?.head ??
    (hasOffer ? blocks.slice(1).filter((b) => b.y + b.h <= (offerS?.y ?? 1) + 0.03)[0] : blocks[0]);
  const brandS =
    S?.brand ?? (S?.head ? undefined : blocks.find((b) => b !== offerS && b !== headS && b.y < 0.3 && b.h < 0.14));

  // ---- заголовок
  let hz: Box = { x: pad, y: pad, w: colW, h: h * 0.22 };
  if (headS) {
    const b = px(headS);
    const ww = Math.min(colW, b.w * 1.08);
    hz = { x: b.x + b.w / 2 - ww / 2, y: b.y, w: ww, h: b.h };
  }
  if (o.logo) {
    const lh = Math.round(h * 0.07);
    const lw = Math.min(colW * 0.3, Math.round((lh * o.logo.w) / Math.max(1, o.logo.h)));
    const ly = headS ? Math.max(pad * 0.4, hz.y - lh - pad * 0.3) : hz.y;
    push({ kind: "logo", box: { x: Math.round(hz.x + hz.w / 2 - lw / 2), y: Math.round(ly), w: lw, h: lh } });
    if (!headS) hz = { ...hz, y: hz.y + lh + pad * 0.4 };
  } else if (dec.crown && !headS) {
    // Корона — только в стандартной раскладке: в местах мастера над заголовком обычно
    // уже стоит что-то из сцены (у короля — своя корона, вышло две).
    const ch = Math.round(h * 0.06);
    const cw = Math.round((ch * dec.crown.w) / Math.max(1, dec.crown.h));
    const cy = Math.max(pad * 0.3, hz.y - ch * 0.75);
    if (push({ kind: "decor", name: "crown", box: { x: Math.round(hz.x + hz.w / 2 - cw / 2), y: Math.round(cy), w: cw, h: ch } }))
      hz = { ...hz, y: Math.round(cy + ch * 0.85) };
  }
  hz = clear(hz);
  const headline = o.texts.headline.trim().toUpperCase();
  let headBottom = hz.y;
  if (headline && hz.h > 10) {
    const hcx = hz.x + hz.w / 2;
    for (let s = Math.min(hz.h * 0.62, hz.w * 0.16); s >= 9; s -= 1) {
      const ls = wrap(m, headline, font(900, s, HEAD_FONT), hz.w, 2);
      if (!ls || ls.length * s * 1.05 > hz.h) continue;
      const y0 = hz.y + (hz.h - ls.length * s * 1.05) / 2;
      // Блок целиком: задела лицо хоть одна строка — мельче, а не без строки.
      const lineOps: TextOp[] = ls.map((l, i) => ({ kind: "text", text: l, x: hcx, y: y0 + s * 0.52 + i * s * 1.05, size: s, font: font(900, s, HEAD_FONT), color: "#ffffff", align: "center", maxW: hz.w }));
      if (lineOps.some((op) => hits(textBox(op)))) continue;
      const headW = Math.max(...ls.map((l) => m(l, font(900, s, HEAD_FONT))));
      lineOps.forEach(push);
      headBottom = y0 + ls.length * s * 1.05;
      if (dec.sparkle) {
        const sz = Math.round(Math.min(w, h) * 0.07);
        for (const [x, y] of [
          [hcx - headW / 2 - sz * 0.35, y0 - sz * 0.25],
          [hcx + headW / 2 - sz * 0.65, headBottom - sz * 0.75],
        ])
          push({ kind: "decor", name: "sparkle", box: { x: Math.round(x), y: Math.round(y), w: sz, h: sz } });
      }
      break;
    }
  }

  // ---- кнопка
  let btnTop = h - pad;
  let btnBottom = h - pad;
  const cta = o.texts.cta.trim().toUpperCase();
  const bc = S?.btn ? px(S.btn) : null;
  const bcx = bc ? bc.x + bc.w / 2 : w / 2;
  const placeBtn = (box: Box) => {
    // На лицо — нельзя: сдвигаем под лицо, если там есть место, иначе над ним.
    for (const f of faces)
      if (box.x < f.x + f.w && box.x + box.w > f.x && box.y < f.y + f.h && box.y + box.h > f.y)
        box = { ...box, y: f.y + f.h + box.h <= h - pad * 0.3 ? f.y + f.h + pad * 0.2 : Math.max(pad * 0.3, f.y - box.h - pad * 0.2) };
    return box;
  };
  if (cta && o.ctaArt) {
    const a = o.ctaArt.w / o.ctaArt.h;
    let bw = bc ? Math.min(colW * 0.7, Math.max(colW * 0.45, bc.w * 1.1)) : colW * 0.62;
    let bh = bw / a;
    const maxH = h * (bc ? 0.12 : 0.11);
    if (bh > maxH) [bh, bw] = [maxH, maxH * a];
    const cy = bc ? (bc.h > h * 0.13 ? bc.y + bc.h - bh / 2 - h * 0.01 : bc.y + bc.h / 2) : h - pad - bh / 2;
    const box = placeBtn({ x: Math.round(bcx - bw / 2), y: Math.round(Math.min(h - pad * 0.3 - bh, cy - bh / 2)), w: Math.round(bw), h: Math.round(bh) });
    if (push({ kind: "button", box, color: o.accent, art: true })) [btnTop, btnBottom] = [box.y, box.y + box.h];
  } else if (cta) {
    const bh = Math.round(h * 0.085);
    const bw = Math.round(bc ? Math.min(colW * 0.7, Math.max(colW * 0.45, bc.w * 1.1)) : colW * 0.6);
    const size = fitSize(m, cta, 800, BODY_FONT, bw - bh * 0.6, bh * 0.42, 7) ?? 7;
    const cy = bc ? (bc.h > h * 0.13 ? bc.y + bc.h - bh / 2 - h * 0.01 : bc.y + bc.h / 2) : h - pad - bh / 2;
    const box = placeBtn({ x: Math.round(bcx - bw / 2), y: Math.round(cy - bh / 2), w: bw, h: bh });
    if (push({ kind: "button", box, color: o.accent })) {
      ops.push({ kind: "text", text: cta, x: box.x + bw / 2, y: box.y + bh / 2, size, font: font(800, size, BODY_FONT), color: inkOn(o.accent), noArt: true, align: "center", maxW: bw - 6 });
      [btnTop, btnBottom] = [box.y, box.y + box.h];
    }
  }
  if (o.texts.age) {
    const bs = Math.round(Math.min(w, h) * 0.075);
    push({ kind: "badge", text: "18+", box: { x: w - pad - bs, y: h - pad - bs, w: bs, h: bs } });
  }

  // ---- оффер: в своём месте мастера или над кнопкой. Не теряется никогда: не влезает
  // афишей — сжатый вид, затем одной строкой любого размера от 8 px.
  let oz: Box = { x: pad, y: h * 0.64, w: colW, h: btnTop - pad * 0.5 - h * 0.64 };
  if (offerS) {
    const b = px(offerS);
    const ww = Math.min(colW, b.w * 1.05);
    const bottom = b.y + b.h > btnTop && b.y < btnTop ? btnTop - pad * 0.3 : b.y + b.h;
    oz = { x: b.x + b.w / 2 - ww / 2, y: b.y, w: ww, h: Math.max(h * 0.06, bottom - b.y) };
  }
  oz = clear(oz);
  const ocx = oz.x + oz.w / 2;
  const offer = o.texts.offer.trim();
  let offerPlaced = !offer;
  for (const vo of offer ? [offer, compactOffer(offer), mainPart(offer)] : []) {
    if (offerPlaced) break;
    const spec = offerRows(vo);
    for (let k = Math.min(oz.w * 0.28, oz.h * 0.75); k * Math.min(...spec.map((r) => r.rel)) >= 8; k -= 0.5) {
      const rows: { text: string; size: number; color: string; width: number }[] = [];
      let fit = true;
      for (const r of spec) {
        const size = k * r.rel;
        const ls = wrap(m, r.text, font(900, size, HEAD_FONT), oz.w, 1);
        if (!ls) {
          fit = false;
          break;
        }
        rows.push({ text: ls[0], size, color: r.accent ? o.accent : "#ffffff", width: m(ls[0], font(900, size, HEAD_FONT)) });
      }
      if (!fit) continue;
      const hgt = rows.reduce((s, r) => s + r.size * 1.06, 0);
      if (hgt > oz.h) continue;
      let yy = offerS ? oz.y + (oz.h - hgt) / 2 : oz.y + oz.h - hgt;
      const blockTop = yy;
      const rowOps: TextOp[] = rows.map((r) => {
        const op: TextOp = { kind: "text", text: r.text, x: ocx, y: yy + r.size * 0.52, size: r.size, font: font(900, r.size, HEAD_FONT), color: r.color, align: "center", maxW: oz.w };
        yy += r.size * 1.06;
        return op;
      });
      if (rowOps.some((op) => hits(textBox(op)))) continue;
      rowOps.forEach(push);
      if (dec.laurel) {
        const lh = Math.round(hgt * 1.15);
        const lw = Math.round((lh * dec.laurel.w) / Math.max(1, dec.laurel.h));
        const half = Math.max(...rows.map((r) => r.width)) / 2;
        const lx = Math.round(ocx - half - lw * 0.85);
        const ly = Math.round(blockTop - (lh - hgt) / 2);
        if (lx >= pad * 0.3 && ocx + half + lw * 0.85 <= w - pad * 0.3) {
          push({ kind: "decor", name: "laurel", box: { x: lx, y: ly, w: lw, h: lh } });
          push({ kind: "decor", name: "laurel", flip: true, box: { x: Math.round(ocx + half - lw * 0.15), y: ly, w: lw, h: lh } });
        }
      }
      offerPlaced = true;
      break;
    }
  }
  if (!offerPlaced) {
    // Последний шанс: одна строка во всю свободную ширину над кнопкой, сколь угодно мелко.
    const line = compactOffer(offer).toUpperCase();
    const zone = clear({ x: pad, y: Math.max(headBottom, btnTop - h * 0.16), w: colW, h: Math.min(h * 0.14, btnTop - Math.max(headBottom, btnTop - h * 0.16)) });
    const s = Math.max(8, Math.min(zone.h * 0.8, fitSize(m, line, 900, HEAD_FONT, zone.w, zone.h * 0.8, 8) ?? 8));
    push({ kind: "text", text: line, x: zone.x + zone.w / 2, y: zone.y + zone.h / 2, size: s, font: font(900, s, HEAD_FONT), color: o.accent, align: "center", maxW: zone.w });
  }

  // ---- бренд — в свою плашку
  const brand = (o.texts.brand ?? "").trim();
  if (brandS && brand && !o.logo) {
    const b = clear(px(brandS));
    const f = (s: number) => font(800, s, HEAD_FONT);
    for (let s = b.h * 0.55; s >= 9; s -= 0.5)
      if (m(brand, f(s)) <= b.w * 0.8) {
        push({ kind: "text", text: brand, x: b.x + b.w / 2, y: b.y + b.h / 2, size: s, font: f(s), color: "#ffffff", align: "center", maxW: b.w * 0.85, noArt: true });
        break;
      }
  }

  // ---- преимущества: рядом внизу (как у мастера) или колонками по бокам
  const rowItems = (o.texts.row ?? []).slice(0, 5).map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (rowItems.length) {
    const rz0 = S?.row ? px(S.row) : null;
    const top = Math.max(btnBottom + pad * 0.3, rz0 ? rz0.y : 0);
    const zone = clear({ x: rz0 ? Math.max(pad * 0.5, rz0.x - rz0.w * 0.05) : pad, y: top, w: rz0 ? Math.min(w - pad, rz0.w * 1.1) : colW, h: h - pad * 0.4 - top });
    const cell = zone.w / rowItems.length;
    if (zone.h >= h * 0.04)
      for (let s = Math.min(zone.h * 0.32, cell * 0.14); s >= 7; s -= 0.5) {
        const f = font(700, s, BODY_FONT);
        const wr = rowItems.map((t) => wrap(m, t, f, cell * 0.92, 2));
        if (wr.some((x) => !x) || Math.max(...wr.map((x) => x!.length)) * s * 1.2 > zone.h) continue;
        wr.forEach((ls, i) => {
          const lines = ls!;
          const y0 = zone.y + (zone.h - lines.length * s * 1.2) / 2;
          lines.forEach((l, j) =>
            push({ kind: "text", text: l, x: zone.x + cell * (i + 0.5), y: y0 + s * 0.6 + j * s * 1.2, size: s, font: f, color: "#ffffff", align: "center", maxW: cell * 0.92, noArt: true }),
          );
        });
        break;
      }
  }
  const sides: [string[] | undefined, "left" | "right"][] = [
    [o.texts.sideL, "left"],
    [o.texts.sideR, "right"],
  ];
  if (w / h >= 0.9)
    for (const [items, side] of sides) {
      const list = (items ?? []).slice(0, 4).map((t) => t.trim().toUpperCase()).filter(Boolean);
      if (!list.length) continue;
      const sw = Math.round(w * 0.2);
      const y0 = Math.max(headBottom + pad * 0.6, h * 0.26);
      const y1 = h * 0.6;
      for (let s = Math.min(h * 0.026, sw * 0.12); s >= 8; s -= 0.5) {
        const f = font(700, s, BODY_FONT);
        const wrapped = list.map((t) => wrap(m, t, f, sw, 2));
        if (wrapped.some((x) => !x)) continue;
        const lines = wrapped.reduce((n, x) => n + x!.length, 0);
        const gapItem = s * 1.1;
        const total = lines * s * 1.2 + gapItem * (list.length - 1);
        if (total > y1 - y0) continue;
        let yy = y0 + (y1 - y0 - total) / 2;
        const x = side === "left" ? pad : w - pad;
        wrapped.forEach((ls) => {
          ls!.forEach((l) => {
            push({ kind: "text", text: l, x, y: yy + s * 0.6, size: s, font: f, color: "#ffffff", align: side, maxW: sw, noArt: true });
            yy += s * 1.2;
          });
          yy += gapItem;
        });
        break;
      }
    }
  return ops;
}

// [герой из подложки | лого | заголовок + оффер | кнопка] в одну линию.
function layoutStrip(w: number, h: number, o: LayerOpts, m: Measure): Op[] {
  const ops: Op[] = [];
  const pad = Math.max(4, Math.round(h * 0.12));
  // Подложка 3:1 по высоте баннера — герой слева целиком; правее — она же, размытая.
  // Персонаж отдельным слоем: фон — подложка целиком, персонаж слева по высоте полосы.
  let heroW = Math.min(Math.round(h * 3), Math.round(w * 0.42));
  let heroRight = Math.round(heroW * 0.4);
  if (o.hero) {
    const a = o.hero.w / Math.max(1, o.hero.h);
    let hh = h;
    let hw = hh * a;
    if (hw > w * 0.3) [hw, hh] = [w * 0.3, (w * 0.3) / a];
    const box = {
      x: Math.round(pad * 0.4),
      y: h - Math.round(hh),
      w: Math.round(hw),
      h: Math.round(hh),
    };
    heroW = Math.round(box.x + box.w);
    heroRight = heroW;
    ops.push({ kind: "plate", mode: "cover", box: { x: 0, y: 0, w, h } });
    ops.push({
      kind: "shade",
      dir: "right",
      box: { x: Math.round(heroW * 0.5), y: 0, w: w - Math.round(heroW * 0.5), h },
    });
    ops.push({ kind: "hero", box });
  } else {
    ops.push({ kind: "plate", mode: "strip-left", box: { x: 0, y: 0, w: heroW, h } });
    ops.push({
      kind: "shade",
      dir: "right",
      box: { x: Math.round(heroW * 0.3), y: 0, w: w - Math.round(heroW * 0.3), h },
    });
  }

  // Кнопка справа.
  const cta = o.texts.cta.trim().toUpperCase();
  let right = w - pad;
  if (cta && o.ctaArt) {
    // Кнопка-картинка: держим её пропорции; в ней свечение и тень, поэтому чуть выше кнопки кодом.
    const a = o.ctaArt.w / o.ctaArt.h;
    const maxBw = Math.round(w * (h < 70 ? 0.4 : 0.32));
    let bh = Math.min(h * 0.86, 64);
    let bw = bh * a;
    if (bw > maxBw) [bw, bh] = [maxBw, maxBw / a];
    const box = {
      x: Math.round(right - bw),
      y: Math.round((h - bh) / 2),
      w: Math.round(bw),
      h: Math.round(bh),
    };
    ops.push({ kind: "button", box, color: o.accent, art: true });
    right = box.x - pad;
  } else if (cta) {
    const bh = Math.round(Math.min(h * 0.62, 48));
    const maxBw = Math.round(w * (h < 70 ? 0.36 : 0.28));
    const size = fitSize(m, cta, 800, BODY_FONT, maxBw - bh * 0.7, Math.min(bh * 0.42, 18), 7) ?? 7;
    const bw = Math.min(maxBw, Math.round(m(cta, font(800, size, BODY_FONT)) + bh * 0.8));
    const box = { x: right - bw, y: Math.round((h - bh) / 2), w: bw, h: bh };
    ops.push({ kind: "button", box, color: o.accent });
    ops.push({
      kind: "text",
      text: cta,
      x: box.x + bw / 2,
      y: box.y + bh / 2,
      size,
      font: font(800, size, BODY_FONT),
      color: inkOn(o.accent),
      noArt: true,
      align: "center",
      maxW: bw - 6,
    });
    right = box.x - pad;
  }

  // Лого — после героя, если место есть.
  // Герой в подложке — в левой трети (до ~36% её ширины); текст сразу за ним.
  let left = o.hero ? heroRight + Math.round(pad * 0.5) : heroRight;
  if (o.logoHero && o.logo) {
    const colW0 = right - left;
    let lh = Math.round(h * 0.7);
    let lw = Math.round((lh * o.logo.w) / Math.max(1, o.logo.h));
    if (lw > colW0 * 0.9)
      [lw, lh] = [
        Math.round(colW0 * 0.9),
        Math.round((colW0 * 0.9 * o.logo.h) / Math.max(1, o.logo.w)),
      ];
    ops.push({
      kind: "logo",
      box: { x: Math.round(left + (colW0 - lw) / 2), y: Math.round((h - lh) / 2), w: lw, h: lh },
    });
    return ops;
  }
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
      ops.push({
        kind: "text",
        text: headline,
        x: left,
        y: y0 + (hs * 1.15) / 2,
        size: hs,
        font: font(800, hs, BODY_FONT),
        color: "#ffffff",
        align: "left",
        maxW: colW,
      });
      ops.push({
        kind: "text",
        text: offer,
        x: left,
        y: y0 + hs * 1.15 + (os * 1.1) / 2,
        size: os,
        font: font(900, os, HEAD_FONT),
        color: o.accent,
        align: "left",
        maxW: colW,
      });
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
  for (const [t, k] of [
    [line, 1],
    [compactOffer(line), 0.85],
    [mainPart(line), 0.55],
  ] as const) {
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
    best.lines.forEach((l, i) =>
      ops.push({
        kind: "text",
        text: l,
        x: left,
        y: y0 + s * 1.08 * (i + 0.5),
        size: s,
        font: font(900, s, HEAD_FONT),
        color: o.lineAccent ? o.accent : "#ffffff",
        align: "left",
        maxW: colW,
      }),
    );
  }
  return ops;
}

/** «+200% до 50 000 ₽ и 500 фриспинов» → «+200% до 50K ₽ + 500 FS». */
export function compactOffer(t: string): string {
  return (
    t
      .replace(/(\d)[\s  .,]?000[\s  .,]?000\b/g, "$1M")
      .replace(/(\d+)[\s  .,]000\b/g, "$1K")
      .replace(/\s(и|і|та|and)\s/gi, " + ")
      // \w в JS — только латиница: окончания кириллицей ловим явно («фриспинов» целиком).
      .replace(/фри\s?спин[а-яёії]*|free\s?spins?|фриспін[а-яёії]*/gi, "FS")
      .replace(/фрибет[а-яёії]*/gi, "FB")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Оффер → строки афиши: число крупно (акцентом), слова к нему — строкой мельче. */
export function offerRows(offer: string): { text: string; rel: number; accent: boolean }[] {
  const parts = offer
    .split(/\s(?:\+|и|і|та|and|y|e|und|et|ve)\s(?=[+\d])/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const rows: { text: string; rel: number; accent: boolean }[] = [];
  parts.forEach((p, i) => {
    if (i) rows.push({ text: "+", rel: 0.45, accent: true });
    const mm = /^(\D*?)\s*([+\-]?\d[\d\s.,]*%?|x\d+)\s*(.*)$/i.exec(p);
    if (!mm) {
      rows.push({ text: p.toUpperCase(), rel: 0.5, accent: false });
      return;
    }
    const [, pre, num, post] = mm;
    if (pre.trim()) rows.push({ text: pre.trim().toUpperCase(), rel: 0.36, accent: false });
    rows.push({ text: num.trim(), rel: 1, accent: true });
    if (post.trim()) rows.push({ text: post.trim().toUpperCase(), rel: 0.38, accent: false });
  });
  return rows;
}

/** Главная часть оффера — до первого «+ / и»: «+200% до 50K ₽». */
function mainPart(t: string): string {
  const c = compactOffer(t);
  return c.split(/\s\+\s/)[0].trim();
}

// Колонка: сверху лого, заголовок, оффер афишей, внизу кнопка; герой — под текстом
// (башня, квадрат, портрет) или справа от колонки (горизонталь).
function layoutColumn(w: number, h: number, kind: LayerKind, o: LayerOpts, m: Measure): Op[] {
  // Горизонталь: колонка текста слева, герой справа. Остальные: колонка во всю ширину
  // над героем (в подложке он в нижней половине, от ~45% высоты).
  // Квадрат с персонажем слоем — тоже колонка слева и персонаж справа во всю высоту:
  // под текстом в квадрате ему остаётся полоска, и ту закрывает кнопка.
  const land = kind === "landscape" || (kind === "square" && !!o.hero);
  const ops: Op[] = [
    { kind: "plate", mode: "cover", box: { x: 0, y: 0, w, h } },
    land
      ? { kind: "shade", dir: "left", box: { x: 0, y: 0, w: Math.round(w * 0.72), h } }
      : { kind: "shade", dir: "top", box: { x: 0, y: 0, w, h: Math.round(h * 0.55) } },
  ];
  const pad = kind === "tower" ? Math.round(w * 0.09) : Math.round(Math.min(w, h) * 0.07);
  const colW = land ? Math.round(w * 0.54) - pad : w - pad * 2;
  const cx = pad + colW / 2;
  let y = pad;
  if (o.logo && !o.logoHero) {
    const lh = Math.round(Math.min(colW * 0.22, h * (kind === "tower" ? 0.06 : 0.11)));
    const lw = Math.min(colW, Math.round((lh * o.logo.w) / Math.max(1, o.logo.h)));
    ops.push({ kind: "logo", box: { x: Math.round(cx - lw / 2), y, w: lw, h: lh } });
    y += lh + pad * 0.8;
  }
  let btnTop = h;
  const cta = o.texts.cta.trim().toUpperCase();
  if (cta && o.ctaArt) {
    const a = o.ctaArt.w / o.ctaArt.h;
    let bw = Math.min(w - pad, colW * (land ? 0.9 : 1.08));
    let bh = bw / a;
    const maxBh = Math.min(colW * 0.4, 80, kind === "tower" ? Infinity : h * 0.2);
    if (bh > maxBh) [bh, bw] = [maxBh, maxBh * a];
    const box = {
      x: Math.round(cx - bw / 2),
      y: Math.round(h - pad * 0.7 - bh),
      w: Math.round(bw),
      h: Math.round(bh),
    };
    ops.push({ kind: "button", box, color: o.accent, art: true });
    btnTop = box.y;
  } else if (cta) {
    const bh = Math.round(Math.min(colW * 0.24, 54, kind === "tower" ? Infinity : h * 0.16));
    const bw = Math.round(land ? colW * 0.85 : colW);
    const size = fitSize(m, cta, 800, BODY_FONT, bw - bh * 0.6, Math.min(bh * 0.4, 18), 7) ?? 7;
    const box = { x: Math.round(cx - bw / 2), y: h - pad - bh, w: bw, h: bh };
    btnTop = box.y;
    ops.push({ kind: "button", box, color: o.accent });
    ops.push({
      kind: "text",
      text: cta,
      x: cx,
      y: box.y + bh / 2,
      size,
      font: font(800, size, BODY_FONT),
      color: inkOn(o.accent),
      noArt: true,
      align: "center",
      maxW: bw - 6,
    });
  }
  // Текст — крупно и по центру свободной зоны: над героем (в подложке он в нижней
  // половине, от ~45% высоты) или, у горизонтали, над кнопкой — без «дыры» посередине.
  const plate = PLATES[kind];
  const plateScale = Math.max(w / plate.w, h / plate.h);
  const heroTop = (h - plate.h * plateScale) / 2 + plate.h * plateScale * 0.45;
  const top = y;
  // Персонаж слоем: текст — в верхней части (у горизонтали — слева), персонаж — под ней
  // (справа), без привязки к подложке.
  const bottom = land
    ? btnTop - pad * 0.6
    : o.hero
      ? Math.min(
          btnTop - pad * 0.5,
          top + Math.max(h * 0.3, (h - top) * (kind === "tower" ? 0.42 : 0.48)),
        )
      : Math.max(top + h * (kind === "tower" ? 0.2 : 0.3), Math.min(heroTop, btnTop) - pad * 0.5);
  if (o.hero) {
    const a = o.hero.w / Math.max(1, o.hero.h);
    // Зона персонажа: под текстом (перекрывая край зоны — текст рисуется поверх) до низа;
    // у горизонтали — правая половина во всю высоту. Кнопка ложится поверх персонажа.
    const zone = land
      ? {
          x: pad + colW + pad * 0.3,
          y: pad * 0.3,
          w: w - (pad + colW + pad * 0.3) - pad * 0.3,
          h: h - pad * 0.3,
        }
      : {
          x: (w - Math.min(w, colW * 1.3)) / 2,
          y: bottom - pad * 0.3,
          w: Math.min(w, colW * 1.3),
          h: h - bottom + pad * 0.3,
        };
    const sc = Math.min(zone.w / a, zone.h);
    const hh = sc;
    const hw = sc * a;
    const box = {
      x: Math.round(zone.x + (zone.w - hw) / 2),
      y: h - Math.round(hh),
      w: Math.round(hw),
      h: Math.round(hh),
    };
    // Под текст и кнопку: сразу после подложки и затемнения.
    ops.splice(2, 0, { kind: "hero", box });
  }
  if (o.logoHero && o.logo) {
    const zone = bottom - top;
    let lw = colW;
    let lh = (lw * o.logo.h) / Math.max(1, o.logo.w);
    if (lh > zone * 0.5) [lh, lw] = [zone * 0.5, (zone * 0.5 * o.logo.w) / Math.max(1, o.logo.h)];
    ops.push({
      kind: "logo",
      box: {
        x: Math.round(cx - lw / 2),
        y: Math.round(top + (zone - lh) / 2),
        w: Math.round(lw),
        h: Math.round(lh),
      },
    });
  }
  const headline = o.texts.headline.trim().toUpperCase();
  const offer = o.texts.offer.trim();
  // Оффер афишей, как в промо-лендинге: числа огромные, слова к ним — строкой мельче
  // («+200%» / «ДО 50 000 ₽» / «+» / «500» / «ФРИСПИНОВ»). Заголовок — над ним.
  // Не влезает — сжимаем оффер, потом убираем заголовок, потом оставляем главное.
  const variants: [string, string][] = [
    [headline, offer],
    [headline, compactOffer(offer)],
    ["", compactOffer(offer)],
    ["", mainPart(offer)],
  ];
  type Row = { text: string; size: number; color: string; gapBefore: number };
  let rows: Row[] | null = null;
  let blockH = 0;
  for (const [vh, vo] of variants) {
    if (rows) break;
    const spec = offerRows(vo);
    // Самая мелкая строка афиши — не мельче 8 px; иначе — следующий, более сжатый вариант.
    const minRel = Math.min(vh ? 0.42 : 1, ...spec.map((r) => r.rel));
    for (let k = Math.min(colW * 0.36, 140, (bottom - top) * 0.7); k * minRel >= 8; k -= 0.5) {
      const out: Row[] = [];
      let okFit = true;
      const hs = k * 0.42;
      const hl = vh ? wrap(m, vh, font(900, hs, HEAD_FONT), colW, 3) : [];
      if (!hl) continue;
      hl.forEach((l, i) =>
        out.push({ text: l, size: hs, color: "#ffffff", gapBefore: i ? hs * 0.08 : 0 }),
      );
      spec.forEach((r, i) => {
        if (!okFit) return;
        const size = k * r.rel;
        const ls = wrap(m, r.text, font(900, size, HEAD_FONT), colW, r.rel < 0.6 ? 2 : 1);
        if (!ls) {
          okFit = false;
          return;
        }
        ls.forEach((l, j) =>
          out.push({
            text: l,
            size,
            color: r.accent ? o.accent : "#ffffff",
            gapBefore: j ? size * 0.08 : i === 0 && hl.length ? hs * 0.7 : size * 0.12,
          }),
        );
      });
      if (!okFit) continue;
      const hgt = out.reduce((sum, r) => sum + r.gapBefore + r.size * 1.02, 0);
      if (hgt > (bottom - top) * 0.94) continue;
      rows = out;
      blockH = hgt;
      break;
    }
  }
  if (rows) {
    let yy = top + (bottom - top - blockH) / 2;
    for (const r of rows) {
      yy += r.gapBefore;
      ops.push({
        kind: "text",
        text: r.text,
        x: cx,
        y: yy + r.size * 0.52,
        size: r.size,
        font: font(900, r.size, HEAD_FONT),
        color: r.color,
        align: "center",
        maxW: colW,
      });
      yy += r.size * 1.02;
    }
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
      l.href =
        "https://fonts.googleapis.com/css2?family=Manrope:wght@600;800&family=Unbounded:wght@800;900&display=swap";
      l.dataset.bannerFonts = "1";
      document.head.appendChild(l);
      await new Promise((r) => {
        l.onload = r;
        l.onerror = r;
      });
    }
    await Promise.all(
      ["900 20px Unbounded", "800 20px Manrope"].map((f) =>
        document.fonts.load(f, "АБВ abc 123").catch(() => []),
      ),
    );
  })();
  return fontsReady;
}

export type LayerSource = {
  kind: LayerKind;
  plate: string;
  opts: LayerOpts & {
    logoSrc?: string;
    heroSrc?: string;
    art?: ArtPiece[];
    cta?: ArtPiece | null;
    decorSrc?: Partial<Record<DecorName, string>>;
  };
};

/**
 * Кадры GIF «по очереди» для мелких размеров: всё сразу не помещается (лого, заголовок,
 * оффер, доп-текст), поэтому показываем по одному — заголовок → оффер → доп-текст →
 * лого крупно. Фон, герой и кнопка общие для всех кадров.
 */
export type SlideName = "headline" | "offer" | "sub" | "brand";
export function bannerSlides(o: LayerOpts): { name: SlideName; opts: LayerOpts }[] {
  const t = o.texts;
  const base: LayerOpts = { ...o, logo: null, logoHero: false, lineAccent: false };
  const headline = t.headline.trim();
  const offer = t.offer.trim();
  const sub = (t.sub ?? "").trim();
  const one = (text: string) => ({ ...t, headline: "", offer: text, sub: "" });
  const out: { name: SlideName; opts: LayerOpts }[] = [];
  if (headline) out.push({ name: "headline", opts: { ...base, texts: one(headline) } });
  if (offer) out.push({ name: "offer", opts: { ...base, lineAccent: true, texts: one(offer) } });
  if (sub) out.push({ name: "sub", opts: { ...base, texts: one(sub) } });
  if (o.logo)
    out.push({ name: "brand", opts: { ...base, logo: o.logo, logoHero: true, texts: one("") } });
  return out;
}

/** Длина одного кадра «по очереди», с. */
export const SLIDE_S = 1.8;

/** Собранный баннер: раскладка готова, картинки загружены; draw рисует кадр. */
export type PreparedBanner = {
  w: number;
  h: number;
  /** t — секунда цикла анимации (BANNER_LOOP_S); без t — статичный баннер. */
  draw: (g: CanvasRenderingContext2D, t?: number, style?: BannerMotion) => void;
  /** Кадры «по очереди» (пусто, если показывать нечего — одна надпись без лого). */
  slides: SlideName[];
  /** Цикл GIF и с какой секунды его начинать (всё уже на месте). */
  timing: (style: BannerMotion) => { loop: number; start: number };
  /** Баннер по слоям для анимированного hero: фон (JPEG) и каждый элемент — прозрачный PNG со своей рамкой. */
  sprites: () => BannerSprites;
};

export type BannerSprite = {
  kind: "text" | "logo" | "button" | "decor" | "badge" | "hero";
  /** Строка оффера (цвет акцента) — ей «удар» и искры. */
  accent?: boolean;
  src: string;
  /** Доли кадра 0..1. */
  box: Box01;
};
export type BannerSprites = { w: number; h: number; bg: string; items: BannerSprite[] };

/** full — надписи влетают по словам; light — надписи стоят, двигаются кнопка, оффер, блик, искры (лёгкий GIF). */
/** slides — кадры по очереди (мелкие размеры: лого, заголовок, оффер, доп-текст). */
export type BannerMotion = "full" | "light" | "slides";

/** Длина цикла анимации баннера, с. */
export const BANNER_LOOP_S = 4;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
/** С перелётом: 0 → ~1.1 → 1 — «пружинка» при появлении. */
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
/** Короткий «удар» вокруг момента c (0…1). */
const beat = (t: number, c: number, wdt = 0.13) =>
  Math.abs(t - c) > wdt * 2.2 ? 0 : Math.exp(-(((t - c) / wdt) ** 2));

/**
 * Тайминг анимации (как у дизайнеров в баннерах казино): надписи падают сверху по
 * одному слову с пружинкой, потом выскакивает кнопка; оффер дважды «бьётся», кнопка
 * дышит, по ней дважды пробегает блик, рядом мерцают искры. В конце цикла надписи
 * и кнопка гаснут и прилетают заново — шов цикла не виден.
 */
type Motion = { alpha: number; scale: number; dy: number };
const STILL: Motion = { alpha: 1, scale: 1, dy: 0 };

/** Загружает картинки и раскладывает баннер — один раз; кадры потом рисуются быстро. */
export async function prepareBanner(
  w: number,
  h: number,
  kind: LayerKind,
  plateSrc: string,
  o: LayerSource["opts"],
): Promise<PreparedBanner> {
  await ensureFonts();
  const [plate, logo, artImgs] = await Promise.all([
    loadImg(plateSrc),
    o.logoSrc ? loadImg(o.logoSrc).catch(() => null) : Promise.resolve(null),
    Promise.all(
      (o.art ?? []).map((p) =>
        loadImg(p.src)
          .then((img) => ({ ...p, img }))
          .catch(() => null),
      ),
    ),
  ]);
  const ctaImg = o.cta ? await loadImg(o.cta.src).catch(() => null) : null;
  const heroImg = o.heroSrc ? await loadImg(o.heroSrc).catch(() => null) : null;
  const decorImgs: Partial<Record<DecorName, HTMLImageElement>> = {};
  for (const [k, src] of Object.entries(o.decorSrc ?? {}) as [DecorName, string][])
    if (src) {
      const img = await loadImg(src).catch(() => null);
      if (img) decorImgs[k] = img;
    }
  // Надписи-ассеты: слово → картинка. Все слова листа одной высоты букв, поэтому
  // масштаб общий — по медиане высот (у «+» и коротких слов рамка ниже, но буквы те же).
  const art = new Map(
    artImgs.filter((p): p is NonNullable<typeof p> => !!p).map((p) => [p.text, p]),
  );
  const hs = [...art.values()].map((p) => p.h).sort((a, b) => a - b);
  const artRefH = hs.length ? hs[Math.floor(hs.length / 2)] : 1;
  /** Строка целиком из ассетов → слова с масштабом; иначе null (рисуем шрифтом). */
  const artLine = (op: { text: string; size: number; noArt?: boolean }) => {
    if (op.noArt || !art.size) return null;
    const words = artWords(op.text).map((w) => art.get(w));
    if (!words.length || words.some((p) => !p)) return null;
    const k = (op.size * 1.12) / artRefH;
    const gap = op.size * 0.18;
    const width = words.reduce((sum, p) => sum + p!.w * k, 0) + gap * (words.length - 1);
    return { words: words as NonNullable<(typeof words)[number]>[], k, gap, width };
  };
  const sizeOf = (f: string) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? "16");
  const mc = document.createElement("canvas").getContext("2d")!;
  const measure: Measure = (t, f) => {
    // Шрифт кнопки (Manrope 800, по центру) ассетов не получает — меряем как есть.
    const a = artLine({ text: t, size: sizeOf(f) });
    if (a) return a.width;
    mc.font = f;
    return mc.measureText(t).width;
  };
  const full: LayerOpts = {
    ...o,
    logo: logo ? { w: logo.naturalWidth, h: logo.naturalHeight } : null,
    ctaArt: ctaImg ? { w: ctaImg.naturalWidth, h: ctaImg.naturalHeight } : null,
    hero: heroImg ? { w: heroImg.naturalWidth, h: heroImg.naturalHeight } : null,
    decor: Object.fromEntries(
      Object.entries(decorImgs).map(([k, img]) => [k, { w: img.naturalWidth, h: img.naturalHeight }]),
    ),
  };
  const ops = layoutBanner(w, h, kind, full, measure);
  const slideList = bannerSlides(full);
  const slides = slideList.length > 1 ? slideList : [];
  // Из кадра берём только его надписи и лого; фон, герой и кнопка — общие.
  const slideOps = slides.map((sl) =>
    layoutBanner(w, h, kind, sl.opts, measure).filter(
      (op) => op.kind === "logo" || (op.kind === "text" && !op.noArt),
    ),
  );

  // Статичные слои — один раз: размытый фон полосы и резкий герой с мягким краем.
  let bgBlur: HTMLCanvasElement | null = null;
  let hero: HTMLCanvasElement | null = null;
  const plateOp = ops.find((op) => op.kind === "plate");
  if (plateOp?.kind === "plate" && plateOp.mode === "strip-left") {
    bgBlur = document.createElement("canvas");
    bgBlur.width = w;
    bgBlur.height = h;
    const bg = bgBlur.getContext("2d")!;
    bg.filter = `blur(${Math.max(2, Math.round(h * 0.08))}px) brightness(.55)`;
    drawCover(bg, plate, { x: -10, y: -10, w: w + 20, h: h + 20 }, 0.75);
    hero = document.createElement("canvas");
    hero.width = plateOp.box.w;
    hero.height = plateOp.box.h;
    const og = hero.getContext("2d")!;
    drawCover(og, plate, { x: 0, y: 0, w: plateOp.box.w, h: plateOp.box.h }, 0.16);
    og.globalCompositeOperation = "destination-in";
    const fade = og.createLinearGradient(0, 0, plateOp.box.w, 0);
    fade.addColorStop(0, "#000");
    fade.addColorStop(0.62, "#000");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    og.fillStyle = fade;
    og.fillRect(0, 0, plateOp.box.w, plateOp.box.h);
  }

  // Порядок появления: слова надписей по очереди (сверху вниз), затем кнопка.
  const btn = ops.find((op) => op.kind === "button");
  const textOps = ops.filter((op): op is TextOp => op.kind === "text" && !op.noArt);
  const wordStart = new Map<TextOp, number>();
  let k = 0;
  for (const op of textOps) {
    wordStart.set(op, 0.25 + k * 0.1);
    k += artLine(op)?.words.length ?? Math.max(1, op.text.split(/\s+/).length);
  }
  const btnIn = 0.35 + k * 0.1;
  const L = BANNER_LOOP_S;
  // Удары оффера и блики кнопки — после того, как всё появилось.
  // Между событиями — тишина: в GIF вес — это пиксели, которые меняются.
  const beats = [Math.min(L - 1.2, btnIn + 0.75)];
  // Второй блик кончается до начала цикла GIF (BANNER_GIF_START) — кадры на стыке чистые.
  const shines = [btnIn + 0.4, Math.min(L - 1.1, btnIn + 1.9)];

  // Кадры: слова влетают по одному, в конце кадра уходят вверх; кнопка толкается.
  // Переход кадра — строками целиком и коротко: на мелких размерах вес GIF —
  // это кадры, где что-то движется (по словам с пружинкой — вдвое тяжелее).
  const slideWordAt = slideOps.map((list) => {
    const m = new Map<TextOp, number>();
    let n = 0;
    for (const op of list) if (op.kind === "text") m.set(op, 0.06 + n++ * 0.06);
    return { m, ready: 0.06 + Math.max(0, n - 1) * 0.06 + 0.3 };
  });
  const slideExit = (lt: number) => clamp01((lt - (SLIDE_S - 0.24)) / 0.2);
  const slideWord = (si: number, op: TextOp, _i: number, lt: number): Motion => {
    const p = clamp01((lt - (slideWordAt[si].m.get(op) ?? 0)) / 0.28);
    const q = slideExit(lt);
    return {
      alpha: Math.min(1, p * 2.5) * (1 - q),
      scale: 0.82 + 0.18 * easeOutBack(p),
      dy: (1 - easeOutCubic(p)) * op.size * 0.8 - q * op.size * 0.6,
    };
  };
  const slideLogo = (lt: number): Motion => {
    const p = clamp01((lt - 0.08) / 0.4);
    return {
      alpha: Math.min(1, p * 3) * (1 - slideExit(lt)),
      scale: 0.5 + 0.5 * easeOutBack(p),
      dy: 0,
    };
  };
  /** Персонаж в «Элементах»: выезжает снизу в начале цикла и уходит вместе с надписями. */
  const heroMotion = (t: number | undefined, style: BannerMotion, hh: number): Motion => {
    if (t === undefined || style !== "full") return STILL;
    const p = clamp01((t - 0.05) / 0.45);
    const out = 1 - clamp01((t - (L - 0.3)) / 0.25);
    return {
      alpha: Math.min(1, p * 2) * out,
      scale: 0.92 + 0.08 * easeOutBack(p),
      dy: (1 - easeOutCubic(p)) * hh * 0.25,
    };
  };
  const slideButton = (lt: number): Motion => ({
    alpha: 1,
    scale: 1 + beat(lt, 0.6, 0.11) * 0.08,
    dy: 0,
  });

  /** Появление слова i строки op в момент t. */
  const wordMotion = (op: TextOp, i: number, t: number | undefined): Motion => {
    if (t === undefined) return STILL;
    const out = 1 - clamp01((t - (L - 0.3)) / 0.25);
    const p = clamp01((t - (wordStart.get(op) ?? 0) - i * 0.1) / 0.42);
    return {
      alpha: Math.min(1, p * 3) * out,
      scale: 0.55 + 0.45 * easeOutBack(p),
      dy: -(1 - easeOutCubic(p)) * op.size * 0.9,
    };
  };
  /** Удар оффера — строкой целиком (по словам они налезают друг на друга). */
  const lineMotion = (op: TextOp, t: number | undefined): Motion =>
    t === undefined || op.color !== o.accent
      ? STILL
      : { alpha: 1, scale: 1 + beats.reduce((s2, c) => s2 + beat(t, c) * 0.14, 0), dy: 0 };
  const buttonMotion = (t: number | undefined): Motion => {
    if (t === undefined) return STILL;
    const out = 1 - clamp01((t - (L - 0.3)) / 0.25);
    const p = clamp01((t - btnIn) / 0.38);
    // Два толчка между ударами оффера — непрерывное «дыхание» раздувает GIF в разы.
    const push = beats.reduce((s2, c) => s2 + beat(t, c + 0.45, 0.11) * 0.09, 0);
    return { alpha: Math.min(1, p * 4) * out, scale: easeOutBack(p) + push, dy: 0 };
  };
  /** Лёгкий вариант: кнопка всегда на месте, два толчка за цикл. */
  const buttonLight = (t: number): Motion => ({
    alpha: 1,
    scale:
      1 +
      beat(t, btnIn + 0.2, 0.12) * 0.1 +
      beats.reduce((s2, c) => s2 + beat(t, c + 0.45, 0.11) * 0.09, 0),
    dy: 0,
  });
  /** Вокруг (cx, cy): прозрачность, масштаб, сдвиг — и рисуем. */
  const moved = (
    g: CanvasRenderingContext2D,
    m: Motion,
    cx: number,
    cy: number,
    fn: () => void,
  ) => {
    if (m.alpha <= 0.002 || m.scale <= 0.01) return;
    g.save();
    g.globalAlpha *= m.alpha;
    g.translate(cx, cy + m.dy);
    g.scale(m.scale, m.scale);
    g.translate(-cx, -cy);
    fn();
    g.restore();
  };
  /** Блик по кнопке: светлая косая полоса только по самой кнопке. */
  const btnShine = (
    g: CanvasRenderingContext2D,
    b: Box,
    t: number | undefined,
    at: number[] = shines,
  ) => {
    if (t === undefined) return;
    for (const c of at) {
      const p = (t - c) / 0.5;
      if (p <= 0 || p >= 1) continue;
      const off = document.createElement("canvas");
      off.width = Math.ceil(b.w);
      off.height = Math.ceil(b.h);
      const og = off.getContext("2d")!;
      if (btn?.kind === "button" && btn.art && ctaImg) og.drawImage(ctaImg, 0, 0, b.w, b.h);
      else {
        og.fillStyle = "#000";
        og.beginPath();
        og.roundRect(0, 0, b.w, b.h, Math.round(b.h * 0.32));
        og.fill();
      }
      og.globalCompositeOperation = "source-in";
      const x = -b.w * 0.4 + p * b.w * 1.8;
      const gr = og.createLinearGradient(x - b.h, 0, x + b.h * 0.4, b.h);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, "rgba(255,255,255,.85)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      og.fillStyle = gr;
      og.fillRect(0, 0, b.w, b.h);
      g.drawImage(off, b.x, b.y);
    }
  };
  /** Четырёхлучевая искра. */
  const spark = (g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => {
    if (a <= 0.02) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = a;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,240,1)");
    gr.addColorStop(0.25, "rgba(255,230,160,.55)");
    gr.addColorStop(1, "rgba(255,200,80,0)");
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const an = (i * Math.PI) / 2;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(an - 0.18) * r * 0.22, y + Math.sin(an - 0.18) * r * 0.22);
      g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
      g.lineTo(x + Math.cos(an + 0.18) * r * 0.22, y + Math.sin(an + 0.18) * r * 0.22);
    }
    g.closePath();
    g.fill();
    g.restore();
  };

  const draw = (g: CanvasRenderingContext2D, t?: number, style: BannerMotion = "full", pick?: (op: Op) => boolean) => {
    // Лёгкий вариант: надписи стоят (без вылета, удара и затухания) — двигаются кнопка, блик, искры.
    const wordT = style === "light" ? undefined : t;
    // Кадры по очереди: общие слои из основной раскладки + надписи/лого текущего кадра.
    const sl = style === "slides" && t !== undefined && slides.length > 1;
    const si = sl ? Math.floor(t / SLIDE_S) % slides.length : 0;
    const lt = sl ? t - Math.floor(t / SLIDE_S) * SLIDE_S : 0;
    const layer = sl
      ? [
          ...ops.filter((op) => op.kind !== "logo" && !(op.kind === "text" && !op.noArt)),
          ...slideOps[si],
        ]
      : ops;
    const only = pick ? layer.filter(pick) : layer;
    const wm = (op: TextOp, i: number) =>
      sl ? slideWord(si, op, i, lt) : wordMotion(op, i, wordT);
    const lm = (op: TextOp) => (sl ? STILL : lineMotion(op, wordT));
    if (!pick) {
      g.fillStyle = "#0b0815";
      g.fillRect(0, 0, w, h);
    }
    const sparkAt: { x: number; y: number }[] = [];
    for (const op of only) {
      if (op.kind === "plate") {
        if (op.mode === "strip-left" && bgBlur && hero) {
          // Фон и герой стоят: в GIF вес — это пиксели, которые меняются; движутся надписи и кнопка.
          g.drawImage(bgBlur, 0, 0);
          g.drawImage(hero, op.box.x, op.box.y);
        } else drawCover(g, plate, op.box, 0.5);
      } else if (op.kind === "shade") {
        const b = op.box;
        const gr =
          op.dir === "right"
            ? g.createLinearGradient(b.x, 0, b.x + Math.min(b.w, h * 2.2), 0)
            : op.dir === "left"
              ? g.createLinearGradient(b.x, 0, b.x + b.w, 0)
              : g.createLinearGradient(0, b.y, 0, b.y + b.h);
        if (op.dir === "left") {
          // Тёмно под колонкой текста, к герою справа — прозрачно.
          gr.addColorStop(0, "rgba(11,8,21,.82)");
          gr.addColorStop(0.6, "rgba(11,8,21,.55)");
          gr.addColorStop(1, "rgba(11,8,21,0)");
        } else if (op.dir === "right" || op.dir === "bottom") {
          // Справа / снизу темнеет к краю: под колонкой текста или под оффером и кнопкой.
          gr.addColorStop(0, "rgba(11,8,21,0)");
          gr.addColorStop(1, "rgba(11,8,21,.72)");
        } else {
          gr.addColorStop(0, "rgba(11,8,21,.78)");
          gr.addColorStop(1, "rgba(11,8,21,0)");
        }
        g.fillStyle = gr;
        g.fillRect(b.x, b.y, b.w, b.h);
      } else if (op.kind === "hero") {
        const b = op.box;
        if (heroImg)
          moved(g, heroMotion(t, style, b.h), b.x + b.w / 2, b.y + b.h, () =>
            g.drawImage(heroImg, b.x, b.y, b.w, b.h),
          );
      } else if (op.kind === "decor") {
        const img = decorImgs[op.name];
        const b = op.box;
        if (img) {
          g.save();
          if (op.flip) {
            g.translate(b.x + b.w, b.y);
            g.scale(-1, 1);
            g.drawImage(img, 0, 0, b.w, b.h);
          } else g.drawImage(img, b.x, b.y, b.w, b.h);
          g.restore();
        }
      } else if (op.kind === "badge") {
        const b = op.box;
        g.save();
        roundRect(g, b, b.h * 0.12);
        g.fillStyle = "rgba(0,0,0,.55)";
        g.fill();
        g.lineWidth = Math.max(1.5, b.h * 0.04);
        g.strokeStyle = "rgba(255,255,255,.9)";
        g.stroke();
        g.fillStyle = "#ffffff";
        g.font = font(800, b.h * 0.42, BODY_FONT);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(op.text, b.x + b.w / 2, b.y + b.h / 2);
        g.restore();
      } else if (op.kind === "logo" && logo) {
        const b = op.box;
        const sc = Math.min(b.w / logo.naturalWidth, b.h / logo.naturalHeight);
        const lw = logo.naturalWidth * sc,
          lh = logo.naturalHeight * sc;
        moved(g, sl ? slideLogo(lt) : STILL, b.x + b.w / 2, b.y + b.h / 2, () =>
          g.drawImage(logo, b.x + (b.w - lw) / 2, b.y + (b.h - lh) / 2, lw, lh),
        );
      } else if (op.kind === "button") {
        const b = op.box;
        moved(
          g,
          sl
            ? slideButton(lt)
            : style === "light" && t !== undefined
              ? buttonLight(t)
              : buttonMotion(t),
          b.x + b.w / 2,
          b.y + b.h / 2,
          () => {
            if (op.art && ctaImg) g.drawImage(ctaImg, b.x, b.y, b.w, b.h);
            else {
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
            }
            // Подпись кодовой кнопки — вместе с кнопкой.
            for (const lb of ops) if (lb.kind === "text" && lb.noArt) drawText(g, lb);
            // В кадрах — блик на первом и последнем (лого/CTA), не на каждом: вес.
            if (sl) btnShine(g, b, si === 0 || si === slides.length - 1 ? lt : undefined, [0.85]);
            else btnShine(g, b, t);
          },
        );
        sparkAt.push({ x: b.x + b.w * 0.92, y: b.y + b.h * 0.12 });
      } else if (op.kind === "text" && op.noArt) {
        if (!btn) drawText(g, op);
      } else if (op.kind === "text" && artLine(op)) {
        const a = artLine(op)!;
        // Шире колонки (крайний случай) — ужимаем строку целиком.
        const fit = Math.min(1, op.maxW / a.width);
        let x =
          op.align === "center"
            ? op.x - (a.width * fit) / 2
            : op.align === "right"
              ? op.x - a.width * fit
              : op.x;
        const x0 = x;
        moved(g, lm(op), x0 + (a.width * fit) / 2, op.y, () =>
          a.words.forEach((p, i) => {
            const pw = p.w * a.k * fit;
            const ph = p.h * a.k * fit;
            const px = x;
            moved(g, wm(op, i), px + pw / 2, op.y, () =>
              g.drawImage(p.img, px, op.y - ph / 2, pw, ph),
            );
            x += pw + a.gap * fit;
          }),
        );
        if (op.color === o.accent)
          sparkAt.push(
            { x: x0 - op.size * 0.1, y: op.y - op.size * 0.35 },
            { x: x - op.size * 0.2, y: op.y + op.size * 0.3 },
          );
      } else if (op.kind === "text") {
        g.font = op.font;
        const tw = Math.min(op.maxW, g.measureText(op.text).width);
        const cx =
          op.align === "center" ? op.x : op.align === "right" ? op.x - tw / 2 : op.x + tw / 2;
        moved(g, lm(op), cx, op.y, () => moved(g, wm(op, 0), cx, op.y, () => drawText(g, op)));
      }
    }
    // Искры: у оффера и кнопки, по очереди после появления (в кадрах — нет: вес).
    if (t !== undefined && !sl && !pick) {
      const r = Math.max(6, Math.min(w, h) * 0.2);
      sparkAt.slice(0, 4).forEach((p, i) => {
        const c = btnIn + 0.6 + i * 0.55;
        const ph = (t - c) / 0.45;
        if (ph > 0 && ph < 1)
          spark(g, p.x, p.y, r * (0.6 + 0.4 * Math.sin(Math.PI * ph)), Math.sin(Math.PI * ph));
      });
    }
  };
  const timing = (style: BannerMotion) =>
    style === "slides" && slides.length > 1
      ? { loop: slides.length * SLIDE_S, start: slideWordAt[0].ready }
      : { loop: BANNER_LOOP_S, start: BANNER_GIF_START };
  const sprites = (): BannerSprites => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#0b0815";
    g.fillRect(0, 0, w, h);
    draw(g, undefined, "full", (op) => op.kind === "plate" || op.kind === "shade");
    const bg = c.toDataURL("image/jpeg", 0.88);
    const items: BannerSprite[] = [];
    for (const op of ops) {
      if (op.kind === "plate" || op.kind === "shade") continue;
      if (op.kind === "text" && op.noArt && btn) continue; // подпись — внутри кнопки
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      draw(g, undefined, "full", (x) => x === op);
      const bb = alphaBox(g.getImageData(0, 0, w, h).data, w, h);
      if (!bb) continue;
      const pad = 2;
      const x0 = Math.max(0, bb.x - pad), y0 = Math.max(0, bb.y - pad);
      const cw = Math.min(w, bb.x + bb.w + pad) - x0, ch = Math.min(h, bb.y + bb.h + pad) - y0;
      const piece = document.createElement("canvas");
      piece.width = cw;
      piece.height = ch;
      piece.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
      items.push({
        kind: op.kind === "text" ? "text" : op.kind,
        accent: op.kind === "text" && op.color === o.accent ? true : undefined,
        src: piece.toDataURL("image/png"),
        box: { x: x0 / w, y: y0 / h, w: cw / w, h: ch / h },
      });
    }
    return { w, h, bg, items };
  };
  return { w, h, draw, slides: slides.map((s) => s.name), timing, sprites };
}

/** Рамка непрозрачных пикселей (alpha > 8); пусто — null. */
function alphaBox(d: Uint8ClampedArray, w: number, h: number): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function drawText(g: CanvasRenderingContext2D, op: TextOp) {
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

/** Собирает баннер w×h из подложки и текстов. Возвращает JPEG data URL. */
export async function renderBanner(
  w: number,
  h: number,
  kind: LayerKind,
  plateSrc: string,
  o: LayerSource["opts"],
): Promise<string> {
  const b = await prepareBanner(w, h, kind, plateSrc, o);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  b.draw(c.getContext("2d")!);
  return c.toDataURL("image/jpeg", 0.9);
}

/**
 * С какой секунды цикла начинается GIF: всё уже на месте, гаснуть ещё не начало.
 * GIF с ограниченными повторами останавливается на последнем кадре — он тоже полный.
 */
export const BANNER_GIF_START = BANNER_LOOP_S - 0.35;

/** Кадры анимации (RGBA) за один цикл, начиная с BANNER_GIF_START. */
export function bannerFrames(
  b: PreparedBanner,
  fps: number,
  style: BannerMotion = "full",
): Uint8ClampedArray[] {
  const c = document.createElement("canvas");
  c.width = b.w;
  c.height = b.h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const { loop, start } = b.timing(style);
  const n = Math.round(loop * fps);
  return Array.from({ length: n }, (_, i) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    b.draw(g, (start + (i / n) * loop) % loop, style);
    return g.getImageData(0, 0, b.w, b.h).data;
  });
}

/** Картинка «cover» в рамку; fx — куда смещён кадр по горизонтали (0 — левый край, 0.5 — центр). */
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, b: Box, fx: number) {
  const s = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight);
  const sw = b.w / s,
    sh = b.h / s;
  const sx = Math.max(0, Math.min(img.naturalWidth - sw, img.naturalWidth * fx - sw / 2));
  const sy = (img.naturalHeight - sh) / 2;
  g.drawImage(img, sx, sy, sw, sh, b.x, b.y, b.w, b.h);
}

function roundRect(g: CanvasRenderingContext2D, b: Box, r: number) {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, r);
}
