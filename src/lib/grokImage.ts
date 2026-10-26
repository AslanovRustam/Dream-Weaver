// Запасная генерация картинок через xAI Grok Imagine — когда OpenAI не пропускает
// запрос по фильтру (персонаж, бренд, «цензура»). Только сервер.
//
// Как устроено:
//   - тот же промпт, что ушёл в OpenAI; эмблемы и знаки персонажа темы Grok
//     рисует — это решение владельца продукта, юридическая ответственность
//     за чужих персонажей и знаки — на пользователе (/legal, «Условия
//     использования», п. 4);
//   - прозрачного фона Grok не умеет: для предметов просим ровный однотонный
//     фон и вырезаем его на сервере (keyOutBackground) — заливкой от краёв,
//     поэтому внутренние области предмета того же цвета не пропадают;
//   - ответ приводится к форме OpenAI ({ data: [{ b64_json }] }), чтобы роуты
//     дальше работали без изменений.
//
// Включается переменной XAI_API_KEY (console.x.ai → API Keys → Grok API).
// Модель grok-imagine-image-2.0, качество medium; ответ — JPEG, ~1–1.5 мин
// (с референсами — /v1/images/edits, до 5 картинок, ~20–30 с).
//
// ТЕСТ: IMAGE_PROVIDER=grok — вся генерация картинок сразу в Grok, OpenAI не
// вызывается (grokPrimaryText). Вернуть как было — убрать переменную.

import sharp from "sharp";

const ENDPOINT = "https://api.x.ai/v1/images/generations";
const EDIT_ENDPOINT = "https://api.x.ai/v1/images/edits";
export const GROK_IMAGE_MODEL = "grok-imagine-image-2.0";

export const grokConfigured = () => !!process.env.XAI_API_KEY?.trim();
/** Тестовый режим: картинки сразу в Grok (IMAGE_PROVIDER=grok и есть ключ). */
export const grokPrimary = () =>
  process.env.IMAGE_PROVIDER?.trim().toLowerCase() === "grok" && grokConfigured();

/** Ответ OpenAI — отказ по фильтру? (те же признаки, что у роутов) */
export function isFilterRejection(text: string): boolean {
  let msg = text.slice(0, 600);
  try {
    msg =
      (JSON.parse(text) as { error?: { message?: string; code?: string } }).error?.message || msg;
  } catch {
    /* not JSON */
  }
  return /safety|moderation|content|rejected/i.test(msg);
}

/** Пропорции, которые принимает Grok (проверено запросами; другое — 422). */
const GROK_RATIOS: [string, number][] = [
  ["1:2", 1 / 2],
  ["9:16", 9 / 16],
  ["2:3", 2 / 3],
  ["3:4", 3 / 4],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:2", 3 / 2],
  ["16:9", 16 / 9],
  ["2:1", 2],
  ["20:9", 20 / 9],
];
/** Размер OpenAI («1536x1024», «1792x1008») → ближайшая пропорция Grok и разрешение. */
export function grokFrame(size: string): { aspect_ratio: string; resolution: string } {
  const m = /^(\d+)x(\d+)$/.exec(size);
  const w = m ? +m[1] : 1024,
    h = m ? +m[2] : 1024;
  const r = Math.log(w / h);
  const [aspect_ratio] = GROK_RATIOS.reduce((best, cur) =>
    Math.abs(Math.log(cur[1]) - r) < Math.abs(Math.log(best[1]) - r) ? cur : best,
  );
  return { aspect_ratio, resolution: Math.max(w, h) >= 2000 ? "2k" : "1k" };
}

const BACKDROP =
  "IMPORTANT for this render: place the subject on a PLAIN FLAT SOLID single-colour studio backdrop — pure magenta (#FF00FF), " +
  "or pure green (#00FF00) if the subject itself is pink or magenta. No checkerboard or transparency pattern, no gradient, no floor, " +
  "no shadow on the backdrop, and a clear margin of backdrop around the subject (and around every item if there are several).";
/** Без водяных знаков и случайного текста; эмблема и знаки персонажа темы — можно. */
const NO_MARKS =
  "No watermarks, captions or random text. The emblem, insignia and signature costume of the theme's character or franchise are welcome.";

export type GrokResult = {
  b64: string;
  mime: "image/png" | "image/jpeg";
  costUsd: number;
  model: string;
};

export type GrokOpts = {
  prompt: string;
  size: string;
  transparent: boolean;
  format?: "png" | "jpeg";
  /** Референсы (data URL или https) — тогда /edits: Grok опирается на них. До 5. */
  refs?: string[];
};

/**
 * Сгенерировать в Grok. transparent — вырезать однотонный фон (PNG с альфой);
 * иначе — как есть, в нужном формате. null — Grok не настроен или не ответил.
 */
export async function grokGenerate(opts: GrokOpts): Promise<GrokResult | null> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  // «transparent background» из промпта OpenAI Grok понимает буквально (шахматка) — заменяем.
  const base = opts.transparent
    ? opts.prompt.replace(/transparent (background|backdrop)/gi, "plain flat solid-colour backdrop")
    : opts.prompt;
  const prompt = `${base}\n\n${opts.transparent ? BACKDROP + " " : ""}${NO_MARKS}`.slice(0, 15000);
  const refs = (opts.refs ?? []).filter((r) => /^(data:image\/|https:\/\/)/.test(r)).slice(0, 5);
  const imageField =
    refs.length === 0
      ? {}
      : refs.length === 1
        ? { image: { url: refs[0], type: "image_url" } }
        : { images: refs.map((url) => ({ url, type: "image_url" })) };
  let res: Response;
  try {
    res = await fetch(refs.length ? EDIT_ENDPOINT : ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROK_IMAGE_MODEL,
        prompt,
        n: 1,
        response_format: "b64_json",
        quality: "medium",
        ...grokFrame(opts.size),
        ...imageField,
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    data?: { b64_json?: string }[];
    usage?: { cost_in_usd_ticks?: number };
  } | null;
  const raw = data?.data?.[0]?.b64_json;
  if (!raw) return null;
  // usage в «тиках»: 1e10 тиков = $1 (medium 1k — 6e8 = $0.06).
  const costUsd = (data?.usage?.cost_in_usd_ticks ?? 0) / 1e10;
  const buf = Buffer.from(raw, "base64");
  if (opts.transparent) {
    const png = await keyOutBackground(buf);
    return { b64: png.toString("base64"), mime: "image/png", costUsd, model: GROK_IMAGE_MODEL };
  }
  const out =
    opts.format === "png"
      ? await sharp(buf).png().toBuffer()
      : await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  return {
    b64: out.toString("base64"),
    mime: opts.format === "png" ? "image/png" : "image/jpeg",
    costUsd,
    model: GROK_IMAGE_MODEL,
  };
}

/**
 * Если OpenAI отказал по фильтру — тот же запрос в Grok. Возвращает текст ответа
 * в форме OpenAI (подставить вместо ответа OpenAI) или null — оставить отказ как есть.
 */
export async function grokOnFilter(
  okFromOpenAi: boolean,
  openAiText: string,
  opts: GrokOpts,
): Promise<GrokText | null> {
  if (okFromOpenAi || !grokConfigured() || !isFilterRejection(openAiText)) return null;
  return asOpenAiText(await grokGenerate(opts));
}

export type GrokText = { text: string; costUsd: number; model: string; mime: GrokResult["mime"] };
const asOpenAiText = (g: GrokResult | null): GrokText | null =>
  g
    ? {
        text: JSON.stringify({ data: [{ b64_json: g.b64 }] }),
        costUsd: g.costUsd,
        model: g.model,
        mime: g.mime,
      }
    : null;

/**
 * Тестовый режим (IMAGE_PROVIDER=grok): картинку сразу рисует Grok, ответ —
 * в форме OpenAI. null — режим выключен или Grok не ответил (тогда как обычно, OpenAI).
 */
export async function grokPrimaryText(opts: GrokOpts): Promise<GrokText | null> {
  if (!grokPrimary()) return null;
  return asOpenAiText(await grokGenerate(opts));
}

/**
 * Вырезать ровный фон: цвет фона — медиана по краям кадра, заливка от краёв
 * по близким к нему пикселям; на границе — мягкая альфа. Внутренние области
 * того же цвета, не связанные с краем, остаются. Фон не нашёлся (меньше 5%
 * кадра) — отдаём картинку как есть, в PNG.
 */
export async function keyOutBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    n = w * h;
  const px = (i: number) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  // цвет фона — медиана по рамке
  const border: number[][] = [];
  for (let x = 0; x < w; x += 2) border.push(px(x), px((h - 1) * w + x));
  for (let y = 0; y < h; y += 2) border.push(px(y * w), px(y * w + w - 1));
  const med = [0, 1, 2].map((c) => {
    const v = border.map((p) => p[c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  const dist = (i: number) => {
    const dr = data[i * 3] - med[0],
      dg = data[i * 3 + 1] - med[1],
      db = data[i * 3 + 2] - med[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  const HARD = 70; // точно фон
  const SOFT = 140; // переход — мягкая альфа
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0,
    qt = 0;
  const seed = (i: number) => {
    if (!bg[i] && dist(i) < HARD) {
      bg[i] = 1;
      queue[qt++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (qh < qt) {
    const i = queue[qh++],
      x = i % w,
      y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  if (qt < n * 0.05) return sharp(input).png().toBuffer();
  // Замкнутые «окна» фона внутри предмета (между черенками вишни, в ручке колокола):
  // с краем не связаны, но почти точно цвета фона и не крошечные — тоже фон.
  const EXACT = 40;
  const MIN_HOLE = Math.max(40, Math.round(n * 0.00005));
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (bg[s] || seen[s] || dist(s) >= EXACT) continue;
    let ch = 0,
      ct = 0;
    queue[ct++] = s;
    seen[s] = 1;
    while (ch < ct) {
      const i = queue[ch++],
        x = i % w,
        y = (i / w) | 0;
      const nb = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of nb)
        if (j >= 0 && !seen[j] && !bg[j] && dist(j) < HARD) {
          seen[j] = 1;
          queue[ct++] = j;
        }
    }
    if (ct >= MIN_HOLE) for (let k = 0; k < ct; k++) bg[queue[k]] = 1;
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let a = 255;
    if (bg[i]) a = 0;
    else {
      // пиксель у границы с фоном — альфа по близости к цвету фона, цвет без «ореола» фона
      const x = i % w,
        y = (i / w) | 0;
      const nearBg =
        (x > 0 && bg[i - 1]) ||
        (x < w - 1 && bg[i + 1]) ||
        (y > 0 && bg[i - w]) ||
        (y < h - 1 && bg[i + w]);
      if (nearBg) {
        const d = dist(i);
        if (d < SOFT) a = Math.round(((d - HARD) / (SOFT - HARD)) * 255);
      }
    }
    out[i * 4] = data[i * 3];
    out[i * 4 + 1] = data[i * 3 + 1];
    out[i * 4 + 2] = data[i * 3 + 2];
    out[i * 4 + 3] = Math.max(0, Math.min(255, a));
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}
