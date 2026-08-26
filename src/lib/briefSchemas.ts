// Per-product field schemas used by the brief (ТЗ) parser. The LLM is given the
// brief text + one of these schemas and returns values for the keys it can fill.
// Keys match what each generator's `applyBrief` maps into its own state.
import type { SectionId } from "@/lib/sections";

export interface BriefField {
  key: string;
  label: string;
  hint?: string; // guidance for the model
  enum?: string[]; // if set, the value must be one of these
}

export interface BriefSchema {
  fields: BriefField[];
  /** What "generate the product" should produce a prompt for. */
  genHint: string;
}

export const BRIEF_SCHEMAS: Record<SectionId, BriefSchema> = {
  banner: {
    genHint: "статичный рекламный баннер",
    fields: [
      { key: "prompt", label: "Описание", hint: "суть креатива: что рекламируем, оффер, тематика" },
      { key: "brand", label: "Бренд", hint: "название бренда/проекта" },
      { key: "bannerText", label: "Текст на баннере", hint: "короткий заголовок ≤50 симв." },
      { key: "buttonText", label: "Текст кнопки", hint: "CTA ≤24 симв." },
    ],
  },
  email: {
    genHint: "email-письмо для рассылки",
    fields: [
      { key: "name", label: "Название письма", hint: "внутреннее рабочее имя" },
      { key: "subject", label: "Тема письма" },
      { key: "preheader", label: "Прехедер", hint: "короткая строка после темы" },
      { key: "brand", label: "Бренд" },
      { key: "style", label: "Стиль", enum: ["promo", "newsletter", "announcement", "minimal"] },
      { key: "heroTitle", label: "Заголовок" },
      { key: "heroSubtitle", label: "Подзаголовок" },
      { key: "body", label: "Текст письма" },
      { key: "ctaText", label: "Текст кнопки" },
      { key: "ctaUrl", label: "Ссылка кнопки" },
      { key: "footer", label: "Футер" },
    ],
  },
  landing: {
    genHint: "лендинг",
    fields: [
      { key: "subject", label: "Тематика" },
      { key: "occasion", label: "Повод / оффер" },
      { key: "brandName", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
      { key: "offerDetails", label: "Детали оффера" },
    ],
  },
  playable: {
    genHint: "интерактивный playable-баннер",
    fields: [
      { key: "subject", label: "Тематика / игра" },
      { key: "brand", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
    ],
  },
  video: {
    genHint: "рекламное видео",
    fields: [
      { key: "subject", label: "Тематика / сценарий" },
      { key: "brand", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
    ],
  },
  // Management sections have no brief-fillable form yet.
  ads: { genHint: "", fields: [] },
  stats: { genHint: "", fields: [] },
  mailing: { genHint: "", fields: [] },
};

export interface BriefResult {
  fields: Record<string, string>;
  generationPrompt: string;
}
