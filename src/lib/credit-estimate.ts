// Credit price shown on the "Сгенерировать" buttons.
//
// Pricing model (agreed with product): price = round(self-cost USD × 100).
// Every image generation runs on the same model (gemini-3.1-flash-image via
// OpenRouter) at a flat measured self-cost of ~$0.0685 per image, so one image
// ≈ 6.85 credits. An action's price is round(images × 6.85) whole credits.
//
// The actual charge is still reconciled server-side from the real usage.cost;
// this is the pre-click estimate the button shows.

export type BannerModelKey = "gpt" | "nano";
export type BannerQuality = "low" | "medium" | "high";

/** Measured flat self-cost of one image generation, in USD. */
export const USD_PER_IMAGE = 0.0685;
/** Credits per US dollar of self-cost (1 $ = 100 credits). */
export const CREDITS_PER_USD = 100;

/**
 * Whole-number credit price for an action that generates `images` images.
 * round(images × USD_PER_IMAGE × CREDITS_PER_USD), never below 1.
 */
export function imageCredits(images = 1): number {
  const n = Math.max(0, images);
  return Math.max(1, Math.round(n * USD_PER_IMAGE * CREDITS_PER_USD));
}

// All banner generation is a single image on one model now, so quality/model no
// longer change the price. Args kept for call-site compatibility.
export function estimateBannerCredits(_args?: {
  model?: BannerModelKey;
  quality?: BannerQuality;
}): number {
  void _args;
  return imageCredits(1);
}

// Resize-package pricing. Flat price PER SELECTED FORMAT — each resize costs the
// same. Fractions are allowed (1.5 → e.g. 3 formats = 4.5 кр.).
export const RESIZE_CREDITS_PER_FORMAT = 1.5;

export function resizeCredits(selectedFormats: number): number {
  if (selectedFormats <= 0) return 0;
  return selectedFormats * RESIZE_CREDITS_PER_FORMAT;
}

/** "1.5 кр." / "3 кр." — one decimal, trailing ".0" trimmed. */
export function formatCredits(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s} кр.`;
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
