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
  type LayerKind,
  type LayerSource,
} from "./bannerLayers";
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
async function bannerTexts(base: GeneratePayload, master: string): Promise<BannerTexts> {
  const t: BannerTexts = {
    headline: (base.banner_text || base.event_text || "").trim(),
    offer: (base.bonus_text || base.subheadline_text || "").trim(),
    cta: (base.button_text || "").trim(),
    // Доп-текст — подзаголовок, если оффер уже взят из bonus_text.
    sub: base.bonus_text ? (base.subheadline_text || "").trim() : "",
  };
  if (t.headline || t.offer) return { ...t, cta: t.cta || "Play" };
  const md = await extractMasterDetails(master).catch(() => null);
  const items = (md?.banner_texts ?? []).map((b) =>
    typeof b === "string" ? { text: b, position: "" } : b,
  );
  const btn = items.find((b) => b.position.startsWith("button"));
  const rest = items
    .filter((b) => b !== btn)
    .map((b) => b.text.trim())
    .filter(Boolean);
  // Оффер — строка с числом, заголовок — первая другая.
  const offer = rest.find((x) => /\d/.test(x)) ?? rest[1] ?? "";
  const headline = rest.find((x) => x !== offer) ?? "";
  // Доп-текст — следующая надпись мастера (условия, «только для новых» и т.п.).
  const sub = rest.find((x) => x !== offer && x !== headline) ?? "";
  return { headline, offer, sub, cta: btn?.text.trim() || t.cta || "Play" };
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
        bannerTexts(ctx.base, ctx.master),
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
  const hero = await heroFor(ctx).catch(() => null);
  if (!hero) return layersFor(size, ctx);
  const [{ texts, accent, art }, bg] = await Promise.all([
    masterArt(ctx),
    bgFor(size.w >= size.h ? "wide" : "tall", ctx),
  ]);
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
