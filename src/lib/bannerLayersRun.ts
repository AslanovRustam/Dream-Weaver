// Пакетный ресайз: тонкие форматы (bannerLayers) — подложка без текста от мастера
// (одна генерация на «полосы» и одна на «башни») + текст и кнопка кодом.

import { accentFromPalette, paletteFromImage } from "./imagePalette";
import { layerKind, renderBanner, type BannerTexts, type LayerKind } from "./bannerLayers";
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
  };
  if (t.headline || t.offer) return { ...t, cta: t.cta || "Play" };
  const md = await extractMasterDetails(master).catch(() => null);
  const items = (md?.banner_texts ?? []).map((b) => (typeof b === "string" ? { text: b, position: "" } : b));
  const btn = items.find((b) => b.position.startsWith("button"));
  const rest = items.filter((b) => b !== btn).map((b) => b.text.trim()).filter(Boolean);
  // Оффер — строка с числом, заголовок — первая другая.
  const offer = rest.find((x) => /\d/.test(x)) ?? rest[1] ?? "";
  const headline = rest.find((x) => x !== offer) ?? "";
  return { headline, offer, cta: btn?.text.trim() || t.cta || "Play" };
}

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
  onTile: (s: { w: number; h: number }, r: { dataUrl: string } | { error: string }) => void,
  cancelled: () => boolean,
): Promise<void> {
  if (!sizes.length) return;
  const [texts, accent] = await Promise.all([
    bannerTexts(ctx.base, ctx.master),
    paletteFromImage(ctx.master).then(accentFromPalette).catch(() => "#f5b324"),
  ]);
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
        onTile(s, { dataUrl: await renderBanner(s.w, s.h, kind, plate, { texts, accent, logoSrc: ctx.base.brand_logo || undefined }) });
      } catch (e) {
        onTile(s, { error: e instanceof Error ? e.message : "Не удалось собрать баннер" });
      }
    }
  }
}
