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

// Measured flat self-cost per image, in USD, per model tier.
//   - USD_PER_IMAGE: the cheap model (gemini-flash) — landing bg/character, email hero.
//   - USD_PER_BANNER: the rich banner model (openai/gpt-5-image) — banner master.
export const USD_PER_IMAGE = 0.0685;
export const USD_PER_BANNER = 0.226;
/** Credits per US dollar of self-cost (1 $ = 100 credits). */
export const CREDITS_PER_USD = 100;

/**
 * Whole-number credit price for an action that generates `images` images on the
 * cheap model. round(images × USD_PER_IMAGE × CREDITS_PER_USD), never below 1.
 */
export function imageCredits(images = 1): number {
  const n = Math.max(0, images);
  return Math.max(1, Math.round(n * USD_PER_IMAGE * CREDITS_PER_USD));
}

// Banner PRICING (a product decision, not raw self-cost). The banner master now
// runs on gpt-image-2.5-sunburst at a measured self-cost of ~$0.04/banner, so
// 30 credits is a healthy margin. (Resizes are priced separately below.)
export const BANNER_PRICE_CREDITS = 30;

// Landing character runs on OpenAI gpt-image-2 (transparent PNG) — same cost
// class as the banner model (~$0.225). Landing background stays on gemini-flash
// (imageCredits(1) = 7).
export const CHARACTER_PRICE_CREDITS = Math.round(USD_PER_BANNER * CREDITS_PER_USD);

// Banner master price. Args kept for call-site compatibility.
export function estimateBannerCredits(_args?: {
  model?: BannerModelKey;
  quality?: BannerQuality;
}): number {
  void _args;
  return BANNER_PRICE_CREDITS;
}

// Resize-package pricing. Flat WHOLE price PER SELECTED FORMAT — each resize
// costs the same. 2 × 46 formats = 92; with the 58-credit banner the full
// package totals exactly 150 credits.
export const RESIZE_CREDITS_PER_FORMAT = 2;

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
