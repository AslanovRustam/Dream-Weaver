// Пакетный ресайз: тонкие форматы (bannerLayers) — подложка без текста от мастера
// (одна генерация на «полосы» и одна на «башни») + текст и кнопка кодом.

import { accentFromPalette, paletteFromImage } from "./imagePalette";
import {
  compactOffer,
  layerKind,
  offerRows,
  renderBanner,
  type BannerTexts,
  type LayerKind,
  type LayerSource,
} from "./bannerLayers";
import { sheetTokens, type ArtPiece, type ArtRole } from "./textArt";
import { apiFetch } from "./api-client";
import { extractMasterDetails, generateImage, type GeneratePayload } from "./imageGen";

/** Размер подложки: 3:1 / 1:3, рёбра кратны 16 — модель рисует его как есть. */
const PLATE_SIZE: Record<LayerKind, { w: number; h: number; ratio: string }> = {
  strip: { w: 1536, h: 512, ratio: "3:1" },
  tower: { w: 512, h: 1536, ratio: "1:3" },
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
  const tokens = sheetTokens(
    lines.filter((l) => l.text.trim()),
    13,
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
};

/** Есть ли среди размеров собираемые слоями. */
export const isLayered = (s: { w: number; h: number }) => layerKind(s.w, s.h) !== null;

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
  if (!sizes.length) return;
  const [texts, accent] = await Promise.all([
    bannerTexts(ctx.base, ctx.master),
    paletteFromImage(ctx.master)
      .then(accentFromPalette)
      .catch(() => "#f5b324"),
  ]);
  // Надписи — одна генерация на мастер (повтор тайла и вторая пачка их не тратят).
  const artKey = `${ctx.epoch}|${ctx.master.length}|${ctx.master.slice(-48)}`;
  let art = artCache.get(artKey);
  if (!art) {
    art = await textArt(texts, ctx.master);
    artCache.set(artKey, art);
  }
  for (const kind of ["strip", "tower"] as const) {
    const group = sizes.filter((s) => layerKind(s.w, s.h) === kind);
    if (!group.length || cancelled()) continue;
    const key = `${ctx.epoch}|plate|${kind}`;
    let plate = ctx.plates.get(key);
    if (!plate) {
      const p = PLATE_SIZE[kind];
      try {
        const res = await generateImage({
          ...ctx.base,
          aspect_ratio: p.ratio,
          source_image: ctx.master,
          target_w: p.w,
          target_h: p.h,
          plate: kind === "strip" ? "wide" : "tall",
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
        plate = res.image;
        ctx.plates.set(key, plate);
      } catch (e) {
        const error = e instanceof Error ? e.message : "Не удалось сгенерировать подложку";
        for (const s of group) onTile(s, { error });
        continue;
      }
    }
    for (const s of group) {
      if (cancelled()) return;
      try {
        // Слои остаются у тайла — из них GIF собирает анимацию по элементам.
        const layers: LayerSource = {
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
        onTile(s, { dataUrl: await renderBanner(s.w, s.h, kind, plate, layers.opts), layers });
      } catch (e) {
        onTile(s, { error: e instanceof Error ? e.message : "Не удалось собрать баннер" });
      }
    }
  }
}
