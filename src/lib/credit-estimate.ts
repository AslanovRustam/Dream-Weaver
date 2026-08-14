// PRELIMINARY credit estimates shown on the "Сгенерировать" buttons.
//
// ⚠️ These numbers are ROUGH PLACEHOLDERS for UX only — they are NOT the real
// price. The actual charge is computed server-side AFTER generation
// (total_tokens × coefficient from the `pricing_coefficients` table, see
// src/app/api/generate-image/route.ts). This module exists so the UI can show
// a credit cost before the click, the way Sibrik shows a number on its
// generate button.
//
// Credits are always shown as WHOLE numbers (no fractions, no "≈" prefix).
//
// TODO(pricing): replace these constants with a real estimator — either a
// lightweight `/api/estimate` endpoint that reads pricing_coefficients, or a
// shared table synced with the DB. Until then everything below is a guess.

export type BannerModelKey = "gpt" | "nano";
export type BannerQuality = "low" | "medium" | "high";

// Placeholder base cost per image model + quality multiplier. Chosen so the
// result is always a whole number. Tuned only to look plausible, not to match
// real provider pricing.
const BANNER_MODEL_BASE: Record<BannerModelKey, number> = {
  gpt: 3, // premium image model
  nano: 1, // cheaper/faster model
};
const BANNER_QUALITY_MULT: Record<BannerQuality, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function estimateBannerCredits(args: {
  model: BannerModelKey;
  quality: BannerQuality;
}): number {
  const base = BANNER_MODEL_BASE[args.model] ?? BANNER_MODEL_BASE.gpt;
  const mult = BANNER_QUALITY_MULT[args.quality] ?? 1;
  return toCredits(base * mult);
}

// Placeholder video cost — scales with duration. Real video pricing depends on
// the (not-yet-chosen) provider and resolution, so this is deliberately coarse.
const VIDEO_CREDITS_PER_SEC = 1;
const VIDEO_MIN_CREDITS = 5;

export function estimateVideoCredits(args: { durationSec: number }): number {
  const secs = Math.max(0, args.durationSec || 0);
  return toCredits(Math.max(VIDEO_MIN_CREDITS, secs * VIDEO_CREDITS_PER_SEC));
}

/** Credits are whole numbers — round up so an estimate never undersells cost. */
function toCredits(n: number): number {
  return Math.max(1, Math.ceil(n));
}

/** "3 кр." — whole number, no approximate sign. */
export function formatCreditsEstimate(n: number): string {
  return `${toCredits(n)} кр.`;
}
