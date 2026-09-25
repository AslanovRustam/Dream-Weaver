"use client";

import { analyzeBannerForLanding } from "./imageGen";

/**
 * Разбор баннера для лендинга.
 *
 * Раньше это делал баннер-генератор перед переходом: человек нажимал «сделать
 * лендинг», несколько секунд смотрел на тост «анализируем баннер…» и только
 * потом попадал на страницу. Теперь разбор — первый шаг сборки на самом
 * лендинге: ждать всё равно придётся, но хотя бы в том же месте, где видно
 * остальные шаги.
 *
 * Возвращает только то, что модель действительно вернула: пустые поля не
 * должны затирать значения, которые баннер-генератор уже положил в seed.
 */
export type SeedAnalysis = {
  headline?: string;
  cta?: string;
  accent?: string;
  bgPrompt?: string;
  charPrompt?: string;
  hasPerson: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function analyzeSeedBanner(
  image: string,
  mechanic: "wheel" | "slot" | "crash",
): Promise<SeedAnalysis | null> {
  if (!image) return null;
  const a = await analyzeBannerForLanding(image, mechanic).catch(() => null);
  if (!a) return null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const accent =
    (a.accent_color_hex && HEX.test(a.accent_color_hex) ? a.accent_color_hex : "") ||
    // Цвет акцента иногда приходит в неожиданном формате, хотя палитра в
    // порядке — берём из неё, прежде чем сдаваться.
    a.palette?.find((c) => HEX.test(c)) ||
    "";

  return {
    headline: str(a.headline),
    cta: str(a.cta_text),
    accent: accent || undefined,
    bgPrompt: str(a.background_prompt),
    charPrompt: a.has_person ? str(a.character_prompt) : undefined,
    hasPerson: !!a.has_person,
  };
}
