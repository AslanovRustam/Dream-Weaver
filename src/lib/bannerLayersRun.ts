// Пакетный ресайз: тонкие форматы (bannerLayers) — подложка без текста от мастера
// (одна генерация на «полосы» и одна на «башни») + текст и кнопка кодом.

import { accentFromPalette, paletteFromImage } from "./imagePalette";
import {
  compactOffer,
  gifKind,
  layerKind,
  offerRows,
  PLATES,
  renderBanner,
  type BannerTexts,
  type DecorName,
  type TextSlots,
  type LayerKind,
  type LayerSource,
} from "./bannerLayers";
import { slotsFromPixels } from "./textSlots";
import { sheetTokens, type ArtPiece, type ArtRole } from "./textArt";
import { apiFetch } from "./api-client";
import { extractMasterDetails, generateImage, type GeneratePayload } from "./imageGen";

/** Как generate-image называет подложку каждой формы (plate). */
const PLATE_PARAM: Record<LayerKind, NonNullable<GeneratePayload["plate"]>> = {
  strip: "wide",
  tower: "tall",
  square: "square",
  landscape: "landscape",
  portrait: "portrait",
};

/** Тексты баннера — из брифа мастера; если там пусто — прочитанные с самой картинки. */
/** Разметка мастера (/api/read-layout): надписи с ролями и рамками, лица. */
type MasterRead = {
  texts: { text: string; role: string; box: [number, number, number, number] }[];
  faces: [number, number, number, number][];
};
const readCache = new Map<string, Promise<MasterRead | null>>();
function masterRead(ctx: LayeredCtx): Promise<MasterRead | null> {
  const key = ctxKey(ctx);
  let p = readCache.get(key);
  if (!p) {
    p = apiFetch("/api/read-layout", { method: "POST", json: { image: ctx.master } })
      .then((r) => (r.ok ? (r.json() as Promise<MasterRead>) : null))
      .catch(() => null);
    readCache.set(key, p);
  }
  return p;
}
const b01 = ([x, y, w, h]: [number, number, number, number]) => ({ x, y, w, h });
/** Общая рамка нескольких надписей одной роли. */
function union(boxes: [number, number, number, number][]) {
  if (!boxes.length) return undefined;
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Места надписей по разметке: заголовок, оффер, кнопка, бренд, ряд преимуществ, лица. */
function slotsFromRead(r: MasterRead): TextSlots {
  const of = (role: string) => r.texts.filter((t) => t.role === role).map((t) => t.box);
  const feats = of("feature");
  const rowLike = feats.length >= 2 && feats.every((b) => b[1] > 0.6);
  return {
    blocks: [],
    head: union(of("headline")),
    offer: union(of("offer")),
    btn: union(of("button")),
    brand: union(of("brand")),
    row: rowLike ? union(feats) : undefined,
    faces: r.faces.map(b01),
  };
}
/** Тексты из разметки: роли уже расставлены моделью. Бриф (точное написание) — в приоритете. */
function textsFromRead(base: GeneratePayload, r: MasterRead): BannerTexts {
  const join = (role: string) => r.texts.filter((t) => t.role === role).map((t) => t.text.replace(/\s+/g, " ").trim()).join(" ");
  const feats = r.texts.filter((t) => t.role === "feature");
  const rowLike = feats.length >= 2 && feats.every((t) => t.box[1] > 0.6);
  const t: BannerTexts = {
    headline: (base.banner_text || base.slot_name || base.event_text || join("headline")).trim(),
    offer: (base.bonus_text || base.subheadline_text || join("offer")).trim(),
    cta: (base.button_text || join("button") || "Play").trim(),
    brand: (base.brand_name || join("brand")).trim(),
    age: r.texts.some((x) => x.role === "legal" && /18\s*\+/.test(x.text)),
    row: rowLike ? feats.sort((a, b) => a.box[0] - b.box[0]).map((x) => x.text) : undefined,
    sideL: rowLike ? undefined : feats.filter((x) => x.box[0] + x.box[2] / 2 < 0.5).map((x) => x.text),
    sideR: rowLike ? undefined : feats.filter((x) => x.box[0] + x.box[2] / 2 >= 0.5).map((x) => x.text),
  };
  const norm = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (t.offer && norm(t.offer) === norm(t.headline)) t.offer = "";
  return { ...t, layout: slotsFromRead(r) };
}

async function bannerTexts(base: GeneratePayload, master: string, read?: MasterRead | null): Promise<BannerTexts> {
  if (read?.texts.length) return textsFromRead(base, read);
  const t: BannerTexts = {
    // Заголовок: текст баннера, иначе название слота (на мастере оно и есть главная надпись).
    headline: (base.banner_text || base.slot_name || base.event_text || "").trim(),
    offer: (base.bonus_text || base.subheadline_text || "").trim(),
    cta: (base.button_text || "").trim(),
    // Доп-текст — подзаголовок, если оффер уже взят из bonus_text.
    sub: base.bonus_text ? (base.subheadline_text || "").trim() : "",
  };
  // Всё нужное есть в брифе — картинку не читаем. Не хватает заголовка или оффера
  // (поле пустое, текст придумала модель) — недостающее берём с самого мастера:
  // раньше хватало одного оффера, и заголовок «Gate of Olympus» пропадал.
  // Мастер читаем всегда: кроме недостающих заголовка/оффера с него берутся списки
  // преимуществ по бокам и 18+ (пересборка мастера в «Слоях»).
  const md = await extractMasterDetails(master).catch(() => null);
  const items = (md?.banner_texts ?? []).map((b) =>
    typeof b === "string" ? { text: b, position: "" } : b,
  );
  const btn = items.find((b) => b.position.startsWith("button"));
  const age = items.some((b) => /18\s*\+/.test(b.text));
  const legal = (s: string) => /18\s*\+|play\s*responsibl|ответственн/i.test(s);
  const side = (p: string) =>
    items
      .filter((b) => b !== btn && b.position.endsWith(p) && !b.position.startsWith("button") && !legal(b.text))
      .map((b) => b.text.trim().replace(/\s+/g, " "))
      .filter((x) => x && x.length <= 40 && !/\d/.test(x));
  const rest = items
    .filter((b) => b !== btn)
    .map((b) => b.text.trim())
    .filter(Boolean);
  // Оффер — только строка с числом. Раньше без числа брали «вторую надпись» — и ею
  // оказывался тот же заголовок: на баннере он выходил дважды.
  const offer = rest.find((x) => /\d/.test(x)) ?? "";
  const headline = rest.find((x) => x !== offer) ?? "";
  // Доп-текст — следующая надпись мастера (условия, «только для новых» и т.п.).
  const sub = rest.find((x) => x !== offer && x !== headline) ?? "";
  const out = dedupeTexts({
    headline: t.headline || headline,
    offer: t.offer || offer,
    sub: t.sub || sub,
    cta: t.cta || btn?.text.trim() || "Play",
  }, rest.filter((x) => !legal(x)));
  // В боковые списки не попадают уже занятые надписи.
  const used = new Set([out.headline, out.offer, out.sub, out.cta].map((x) => (x || "").toUpperCase()));
  const free = (xs: string[]) => xs.filter((x) => !used.has(x.toUpperCase())).slice(0, 4);
  const brand = (base.brand_name || "").trim();
  const norm = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  // Тот же текст в заголовке и оффере — один раз.
  if (out.offer && norm(out.offer) === norm(out.headline)) out.offer = "";
  return { ...out, sideL: free(side("-left")), sideR: free(side("-right")), age, brand };
}

/** Число/процент строки — «+150%», «500», «50 000» — чтобы узнавать один оффер в разных записях. */
const figure = (s: string) => (s.match(/\d[\d\s.,]*%?/g) ?? []).map((x) => x.replace(/[\s.,]/g, "")).join("|");

/**
 * Заголовок не должен повторять оффер: «+150% на первый депозит» в поле «Текст на баннере»
 * и «+150%» с картинки давали на баннере две «+150%». Заголовок с тем же числом — это и
 * есть оффер (берём более полную запись), а заголовком становится надпись без чисел.
 */
function dedupeTexts(t: BannerTexts, masterRest: string[]): BannerTexts {
  const fh = figure(t.headline);
  if (!fh || fh !== figure(t.offer)) return t;
  const offer = t.headline.length > t.offer.length ? t.headline : t.offer;
  const headline = masterRest.find((x) => !/\d/.test(x) && x !== t.sub) ?? "";
  return { ...t, headline, offer, sub: t.sub === headline ? "" : t.sub };
}

/**
 * Надписи-ассеты: модель рисует слова баннера одним листом в стиле мастера.
 * Порядок важен (лист — до 14 слов): заголовок, строки афиши оффера, сам оффер
 * и его сжатый вид — их берут узкие полосы. Пусто/ошибка — рисуем шрифтом.
 */
async function textArt(texts: BannerTexts, master: string): Promise<ArtPiece[]> {
  const lines: { text: string; role?: ArtRole }[] = [{ text: texts.headline, role: "light" }];
  for (const r of offerRows(texts.offer))
    lines.push({ text: r.text, role: r.accent ? "accent" : "light" });
  lines.push({ text: texts.offer }, { text: compactOffer(texts.offer) });
  // Доп-текст — последним: лист ограничен, недостающие слова кадр нарисует шрифтом.
  if (texts.sub) lines.push({ text: texts.sub, role: "light" });
  // 10 слов + кнопка: на 1536 px строки со свечением ещё не слипаются (14 — уже да).
  const tokens = sheetTokens(
    lines.filter((l) => l.text.trim()),
    10,
  );
  // Кнопка — последней строкой листа, целиком (плашка с надписью).
  if (texts.cta.trim()) tokens.push({ text: texts.cta.trim().toUpperCase(), role: "button" });
  if (!tokens.length) return [];
  try {
    const res = await apiFetch("/api/generate-text-art", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens, style_image: master }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { pieces?: (ArtPiece & { ok: boolean })[] };
    return (data.pieces ?? []).filter((p) => p.ok);
  } catch {
    return [];
  }
}

const artCache = new Map<string, ArtPiece[]>();

export type LayeredCtx = {
  master: string;
  base: GeneratePayload;
  /** Кэш подложек на эпоху мастера: повтор тайла не тратит генерацию. */
  plates: Map<string, string>;
  epoch: number;
  /** Карточка в Истории: туда сохраняются слои, оттуда берутся готовые. */
  cardId?: string;
  /** Сохранённые в карточке слои (картинки — data:), один запрос на карточку. */
  saved?: () => Promise<SavedLayers | null>;
  /** Перегенерация тайла: подложку рисуем заново, сохранённую не берём (тексты и надписи — берём). */
  freshPlates?: boolean;
};

/** Слои, сохранённые в карточке Истории (GET /api/history/[cardId]/layers). */
export type SavedLayers = {
  texts?: BannerTexts;
  accent?: string;
  art?: (ArtPiece & { src: string })[];
  hero?: { src: string; w: number; h: number };
  bg?: Record<string, string>;
  plates?: Record<string, string>;
};

// Сохранение слоёв в карточку — по очереди: сервер дописывает манифест (чтение → запись),
// параллельные запросы затёрли бы друг друга.
let persistChain: Promise<unknown> = Promise.resolve();
function persist(ctx: LayeredCtx, part: Record<string, unknown>) {
  if (!ctx.cardId) return;
  const id = ctx.cardId;
  persistChain = persistChain
    .then(() => apiFetch(`/api/history/${id}/layers`, { method: "POST", json: part }))
    .catch(() => undefined);
}
const savedOf = (ctx: LayeredCtx) =>
  ctx.saved ? ctx.saved().catch(() => null) : Promise.resolve(null);
const ctxKey = (ctx: LayeredCtx) => `${ctx.epoch}|${ctx.master.length}|${ctx.master.slice(-48)}`;

/** Есть ли среди размеров собираемые слоями. */
export const isLayered = (s: { w: number; h: number }) => layerKind(s.w, s.h) !== null;

const textsCache = new Map<
  string,
  Promise<{ texts: BannerTexts; accent: string; art: ArtPiece[] }>
>();

/** Тексты, акцент и надписи-ассеты мастера — один раз на мастер (лист — генерация). */
function masterArt(ctx: LayeredCtx) {
  const key = ctxKey(ctx);
  let p = textsCache.get(key);
  if (!p) {
    p = (async () => {
      const saved = await savedOf(ctx);
      if (saved?.texts && saved.art?.length)
        return {
          texts: saved.texts,
          accent: saved.accent ?? "#f5b324",
          art: saved.art.map(({ src, ...p }) => ({ ...p, src })),
        };
      const [texts, accent] = await Promise.all([
        masterRead(ctx).then((r) => bannerTexts(ctx.base, ctx.master, r)),
        paletteFromImage(ctx.master)
          .then(accentFromPalette)
          .catch(() => "#f5b324"),
      ]);
      let art = artCache.get(key);
      if (!art) {
        art = await textArt(texts, ctx.master);
        // Пустой лист (не разрезался, сбой) не запоминаем — следующая сборка попробует снова.
        if (art.length) {
          artCache.set(key, art);
          persist(ctx, {
            texts,
            accent,
            art: art.map((a) => ({ text: a.text, role: a.role, w: a.w, h: a.h, image: a.src })),
          });
        } else textsCache.delete(key);
      }
      return { texts, accent, art };
    })();
    p.catch(() => textsCache.delete(key));
    textsCache.set(key, p);
  }
  return p;
}

/** Подложка формы — одна генерация на форму и мастер (кэш в ctx.plates). */
async function plateFor(kind: LayerKind, ctx: LayeredCtx): Promise<string> {
  const key = `${ctx.epoch}|plate|${kind}`;
  const cached = ctx.plates.get(key);
  if (cached) return cached;
  const fromCard = ctx.freshPlates ? undefined : (await savedOf(ctx))?.plates?.[kind];
  if (fromCard) {
    ctx.plates.set(key, fromCard);
    return fromCard;
  }
  const p = PLATES[kind];
  const res = await generateImage({
    ...ctx.base,
    aspect_ratio: p.ratio,
    source_image: ctx.master,
    target_w: p.w,
    target_h: p.h,
    plate: PLATE_PARAM[kind],
    // Подложка — без текста и чужих картинок: только мастер.
    ad_texts_enabled: false,
    banner_text_enabled: false,
    button_text_enabled: false,
    bonus_enabled: false,
    brand_logo: "",
    slot_logo: "",
    slot_screenshot: "",
    side_a_logo: "",
    side_b_logo: "",
    reference_image: "",
    master_details: undefined,
    group_id: undefined,
    skip_history_attach: true,
  });
  ctx.plates.set(key, res.image);
  if (res.image.startsWith("data:")) persist(ctx, { plates: { [kind]: res.image } });
  return res.image;
}

/** Фон без персонажа — горизонтальный или вертикальный, один на ориентацию и мастер. */
async function bgFor(orient: "wide" | "tall", ctx: LayeredCtx): Promise<string> {
  const key = `${ctx.epoch}|bg|${orient}`;
  const cached = ctx.plates.get(key);
  if (cached) return cached;
  const fromCard = (await savedOf(ctx))?.bg?.[orient];
  if (fromCard) {
    ctx.plates.set(key, fromCard);
    return fromCard;
  }
  const p =
    orient === "wide" ? { w: 1536, h: 1024, ratio: "3:2" } : { w: 1024, h: 1536, ratio: "2:3" };
  const res = await generateImage({
    ...ctx.base,
    aspect_ratio: p.ratio,
    source_image: ctx.master,
    target_w: p.w,
    target_h: p.h,
    plate: orient === "wide" ? "bgwide" : "bgtall",
    ad_texts_enabled: false,
    banner_text_enabled: false,
    button_text_enabled: false,
    bonus_enabled: false,
    brand_logo: "",
    slot_logo: "",
    slot_screenshot: "",
    side_a_logo: "",
    side_b_logo: "",
    reference_image: "",
    master_details: undefined,
    group_id: undefined,
    skip_history_attach: true,
  });
  ctx.plates.set(key, res.image);
  if (res.image.startsWith("data:")) persist(ctx, { bg: { [orient]: res.image } });
  return res.image;
}

/** Обрезка прозрачных полей вырезки — раскладке нужна рамка самого персонажа. */
async function trimAlpha(src: string): Promise<{ src: string; w: number; h: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const { data, width: W, height: H } = g.getImageData(0, 0, c.width, c.height);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("Пустая вырезка");
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL("image/png"), w: out.width, h: out.height };
}

const heroCache = new Map<string, Promise<{ src: string; w: number; h: number }>>();
/** Персонаж мастера на прозрачном фоне — та же поза и кадрирование; один на мастер. */
function heroFor(ctx: LayeredCtx) {
  const key = ctxKey(ctx);
  let p = heroCache.get(key);
  if (!p) {
    p = (async () => {
      const fromCard = (await savedOf(ctx))?.hero;
      if (fromCard) return fromCard;
      const res = await apiFetch("/api/generate-character", {
        method: "POST",
        json: {
          prompt: "The main character / key object of this advertising banner.",
          reference_image: ctx.master,
          keep_pose: true,
        },
      });
      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "Не удалось отделить персонажа");
      const hero = await trimAlpha(data.imageUrl);
      persist(ctx, { hero: { image: hero.src, w: hero.w, h: hero.h } });
      return hero;
    })();
    p.catch(() => heroCache.delete(key));
    heroCache.set(key, p);
  }
  return p;
}

/**
 * Слои GIF: фон без персонажа + персонаж отдельно (код ставит его с учётом текста) +
 * надписи. Персонажа отделить не вышло — подложка формы с персонажем внутри.
 */
export async function gifLayersFor(
  size: { w: number; h: number },
  ctx: LayeredCtx,
): Promise<LayerSource> {
  const kind = gifKind(size.w, size.h);
  // Сначала дешёвое (фон ≈ 1.6 кр.), потом дорогое (персонаж и надписи — по 23):
  // упадёт фон — дорогие генерации не запускаются и не списываются.
  const bg = await bgFor(size.w >= size.h ? "wide" : "tall", ctx);
  const hero = await heroFor(ctx).catch(() => null);
  if (!hero) return layersFor(size, ctx);
  const { texts, accent, art } = await masterArt(ctx);
  return {
    kind,
    plate: bg,
    opts: {
      texts,
      accent,
      logoSrc: ctx.base.brand_logo || undefined,
      heroSrc: hero.src,
      art: art.filter((p) => p.role !== "button"),
      cta: art.find((p) => p.role === "button") ?? null,
    },
  };
}

/** Чистая копия мастера: та же композиция, персонаж и реквизит — без текста и кнопок. */
async function cleanFor(ratio: string, ctx: LayeredCtx): Promise<string> {
  const key = `${ctx.epoch}|plate|clean`;
  const cached = ctx.plates.get(key);
  if (cached) return cached;
  const fromCard = (await savedOf(ctx))?.plates?.clean;
  if (fromCard) {
    ctx.plates.set(key, fromCard);
    return fromCard;
  }
  const [rw, rh] = ratio.split(":").map(Number);
  const r = rw && rh ? rw / rh : 1;
  const long = 1536;
  const res = await generateImage({
    ...ctx.base,
    aspect_ratio: ratio,
    source_image: ctx.master,
    target_w: Math.round(r >= 1 ? long : long * r),
    target_h: Math.round(r >= 1 ? long / r : long),
    plate: "clean",
    ad_texts_enabled: false,
    banner_text_enabled: false,
    button_text_enabled: false,
    bonus_enabled: false,
    brand_logo: "",
    slot_logo: "",
    slot_screenshot: "",
    side_a_logo: "",
    side_b_logo: "",
    reference_image: "",
    master_details: undefined,
    group_id: undefined,
    skip_history_attach: true,
  });
  ctx.plates.set(key, res.image);
  if (res.image.startsWith("data:")) persist(ctx, { plates: { clean: res.image } });
  return res.image;
}

/**
 * Где у мастера были надписи и кнопка: сравниваем мастер с его чистой копией на сетке
 * 96×96 — там, где они сильно расходятся, модель стёрла текст. Пятна собираем в рамки;
 * верхняя — заголовок, самая крупная из остальных — оффер, вытянутая низкая под ним —
 * кнопка (её место — по надписи, даже если саму плашку модель не стёрла).
 */
async function textSlots(master: string, plate: string): Promise<TextSlots | null> {
  try {
    const N = 96;
    const px = async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = N;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, N, N);
      return g.getImageData(0, 0, N, N).data;
    };
    const [a, b] = await Promise.all([px(master), px(plate)]);
    return slotsFromPixels(a, b, N);
  } catch {
    return null;
  }
}

const decorCache = new Map<string, Promise<Partial<Record<DecorName, string>>>>();
/**
 * Декор в стиле мастера одним листом (лавровая ветвь, корона, искра) — один на мастер.
 * Хранится в карточке рядом с подложками (plates.laurel / crown / sparkle). Не вышло —
 * пусто, баннер собирается без декора.
 */
function decorFor(ctx: LayeredCtx) {
  const key = ctxKey(ctx);
  let p = decorCache.get(key);
  if (!p) {
    p = (async () => {
      const saved = (await savedOf(ctx))?.plates ?? {};
      if (saved.laurel || saved.crown || saved.sparkle)
        return { laurel: saved.laurel, crown: saved.crown, sparkle: saved.sparkle };
      const res = await apiFetch("/api/generate-text-art", {
        method: "POST",
        json: { kind: "decor", style_image: ctx.master },
      });
      if (!res.ok) return {};
      const data = (await res.json()) as { pieces?: { text: string; src: string; ok: boolean }[] };
      const out: Partial<Record<DecorName, string>> = {};
      for (const pc of data.pieces ?? [])
        if (pc.ok && (pc.text === "laurel" || pc.text === "crown" || pc.text === "sparkle")) out[pc.text] = pc.src;
      if (Object.keys(out).length) persist(ctx, { plates: out });
      return out;
    })();
    p.catch(() => decorCache.delete(key));
    decorCache.set(key, p);
  }
  return p.catch(() => ({}));
}

/**
 * Сам мастер, пересобранный по слоям (раздел «Слои»): подложка — чистая копия мастера
 * (композиция, персонаж, реквизит на месте), надписи модели — туда же, где они были
 * у мастера: заголовок сверху, оффер и кнопка снизу.
 */
export async function masterLayers(
  size: { w: number; h: number },
  ratio: string,
  ctx: LayeredCtx,
): Promise<LayerSource> {
  const [plate, { texts, accent, art }, decorSrc] = await Promise.all([
    cleanFor(ratio, ctx),
    masterArt(ctx),
    decorFor(ctx),
  ]);
  // Места: из разметки мастера (сохранена в тексты карточки); нет — по разнице с чистой копией
  // (лица всё равно берём из разметки, если она есть).
  const read = texts.layout ? null : await masterRead(ctx);
  const diff = texts.layout ? null : await textSlots(ctx.master, plate);
  const slots: TextSlots | null =
    texts.layout ?? (diff || read ? { blocks: [], ...(diff ?? {}), faces: read ? read.faces.map(b01) : diff?.faces } : null);
  return {
    kind: gifKind(size.w, size.h),
    plate,
    opts: {
      texts,
      accent,
      split: true,
      slots,
      decorSrc,
      logoSrc: ctx.base.brand_logo || undefined,
      art: art.filter((p) => p.role !== "button"),
      cta: art.find((p) => p.role === "button") ?? null,
    },
  };
}

/**
 * Слои баннера размера w×h: подложка его формы + тексты и надписи мастера.
 * GIF любого размера собирается из них (статика — только у тонких форматов).
 */
export async function layersFor(
  size: { w: number; h: number },
  ctx: LayeredCtx,
): Promise<LayerSource> {
  const kind = gifKind(size.w, size.h);
  const [{ texts, accent, art }, plate] = await Promise.all([masterArt(ctx), plateFor(kind, ctx)]);
  return {
    kind,
    plate,
    opts: {
      texts,
      accent,
      logoSrc: ctx.base.brand_logo || undefined,
      art: art.filter((p) => p.role !== "button"),
      cta: art.find((p) => p.role === "button") ?? null,
    },
  };
}

/** Собирает все тонкие размеры; onTile — по готовности каждого. */
export async function runLayered(
  sizes: { w: number; h: number }[],
  ctx: LayeredCtx,
  onTile: (
    s: { w: number; h: number },
    r: { dataUrl: string; layers: LayerSource } | { error: string },
  ) => void,
  cancelled: () => boolean,
): Promise<void> {
  // Подложка формы кэшируется: первая плитка формы её генерирует, остальные берут готовую.
  // Ошибка подложки — у всех плиток этой формы (повторно не пробуем в этом прогоне).
  const failed = new Map<LayerKind, string>();
  for (const s of sizes) {
    if (cancelled()) return;
    const kind = gifKind(s.w, s.h);
    const fail = failed.get(kind);
    if (fail) {
      onTile(s, { error: fail });
      continue;
    }
    let layers: LayerSource;
    try {
      layers = await layersFor(s, ctx);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Не удалось сгенерировать подложку";
      failed.set(kind, error);
      onTile(s, { error });
      continue;
    }
    try {
      // Слои остаются у тайла — из них GIF собирает анимацию по элементам.
      onTile(s, {
        dataUrl: await renderBanner(s.w, s.h, layers.kind, layers.plate, layers.opts),
        layers,
      });
    } catch (e) {
      onTile(s, { error: e instanceof Error ? e.message : "Не удалось собрать баннер" });
    }
  }
}
