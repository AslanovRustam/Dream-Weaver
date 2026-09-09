/**
 * Resize planner — turns an arbitrary list of exact banner sizes (incl. the
 * extreme IAB display-ad formats like 728×90 or 160×600) into a small set of
 * "source" images we can actually generate on gpt-image-2.5-flare, plus a crop
 * spec that carves each exact size out of its source.
 *
 * Why this exists
 * ---------------
 * OpenAI image models (incl. gpt-image-2.5) only render canvases that are:
 *   • both edges divisible by 16
 *   • aspect ratio within 1:3 … 3:1  (leaderboards/skyscrapers exceed this)
 *   • single edge ≤ 3840
 *   • total pixels within 655_360 … 8_294_400
 *
 * So a 728×90 (8:1) banner can NEVER be generated at its native aspect. The
 * standard ad-industry solution — and what this module implements — is:
 *   1. group targets by a CANONICAL source aspect (the closest generatable
 *      aspect, clamped to the 3:1 / 1:3 boundary),
 *   2. generate ONE source per group, sized so it covers every member on both
 *      edges (client only ever DOWNSCALES, never upscales),
 *   3. center-crop + downscale the source to each exact target size. Extreme
 *      formats become a thin strip cropped from the 3:1 / 1:3 source — the
 *      key content lives in the central safe zone, so it survives.
 */

// ── flare / gpt-image canvas constraints ──────────────────────────────
export const FLARE_MIN_PIXELS = 655_360;
export const FLARE_MAX_PIXELS = 8_294_400;
export const FLARE_MAX_EDGE = 3840;
export const FLARE_EDGE_STEP = 16; // both edges must be divisible by 16
/** Max/min aspect the model will render (long:short). */
export const FLARE_MAX_ASPECT = 3;

// Canonical source aspects we snap to, as [a, b] with a≥b (landscape) plus
// their portrait mirrors. Kept small so a whole selection collapses into a
// handful of source generations. Values span 1:1 → 3:1 and 1:1 → 1:3.
const CANONICAL: Array<[number, number]> = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [16, 9],
  [2, 1],
  [3, 1],
];

export interface Target {
  w: number;
  h: number;
}

/** Crop rectangle (in SOURCE pixels) to carve out before scaling to exact size. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlannedTarget extends Target {
  /** Center crop rect in source-pixel space; scale this to (w, h) afterwards. */
  crop: CropRect;
  /** True when the target aspect exceeded the source aspect (strip crop — lossy). */
  extreme: boolean;
}

export interface SourcePlan {
  /** Canonical source aspect, reduced (e.g. "3:1"). */
  ratio: string;
  /** Generatable canvas for this source (÷16, within all flare limits). */
  source: { w: number; h: number };
  /** Every requested size served from this source. */
  targets: PlannedTarget[];
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * Pick the canonical source aspect closest (by ratio) to a target, clamped to
 * the generatable band. Returns [a, b] oriented the same way as the target
 * (landscape target → landscape aspect, portrait → portrait).
 */
export function pickSourceRatio(w: number, h: number): [number, number] {
  const landscape = w >= h;
  const long = landscape ? w : h;
  const short = landscape ? h : w;
  const r = long / short; // ≥ 1
  // Nearest canonical by absolute ratio distance, but never below the target's
  // own ratio when that ratio is itself within band (so a 6:5 target snaps to
  // 5:4, not 1:1 — we prefer the closest, ties handled by first match).
  let best = CANONICAL[0];
  let bestDist = Infinity;
  for (const [a, b] of CANONICAL) {
    const dist = Math.abs(a / b - r);
    if (dist < bestDist) {
      bestDist = dist;
      best = [a, b];
    }
  }
  const [a, b] = best;
  return landscape ? [a, b] : [b, a];
}

/** True if the exact target aspect is more extreme than flare can render. */
export function isExtreme(w: number, h: number): boolean {
  const r = Math.max(w, h) / Math.min(w, h);
  return r > FLARE_MAX_ASPECT + 1e-9;
}

/**
 * Smallest flare-valid canvas at aspect (ra:rb) that covers (needW, needH) on
 * both edges. Guarantees ÷16 edges, aspect within band, pixels ≥ min budget,
 * and edges/pixels ≤ caps. Returns null only if physically impossible.
 */
export function sourceCanvasFor(
  ra: number,
  rb: number,
  needW: number,
  needH: number,
): { w: number; h: number } | null {
  const g = gcd(ra, rb);
  ra /= g;
  rb /= g;
  // m must keep ra*m and rb*m divisible by 16.
  const step = lcm(FLARE_EDGE_STEP / gcd(ra, FLARE_EDGE_STEP), FLARE_EDGE_STEP / gcd(rb, FLARE_EDGE_STEP));

  // Smallest m covering both needed edges.
  const mForW = Math.ceil(needW / ra);
  const mForH = Math.ceil(needH / rb);
  let m = Math.ceil(Math.max(mForW, mForH, 1) / step) * step;

  // Bump up until the canvas meets the MIN pixel budget.
  while (ra * m * (rb * m) < FLARE_MIN_PIXELS) m += step;

  let w = ra * m;
  let h = rb * m;

  // Shrink if we blew past the MAX caps (only possible for huge requests).
  while ((w > FLARE_MAX_EDGE || h > FLARE_MAX_EDGE || w * h > FLARE_MAX_PIXELS) && m > step) {
    m -= step;
    w = ra * m;
    h = rb * m;
  }
  if (w > FLARE_MAX_EDGE || h > FLARE_MAX_EDGE || w * h > FLARE_MAX_PIXELS || w * h < FLARE_MIN_PIXELS) {
    return null;
  }
  return { w, h };
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** Center-crop rect (in source px) whose aspect matches the target. */
export function centerCrop(sourceW: number, sourceH: number, targetW: number, targetH: number): CropRect {
  const targetR = targetW / targetH;
  const sourceR = sourceW / sourceH;
  let cw: number;
  let ch: number;
  if (targetR > sourceR) {
    // Target is wider → keep full width, trim height.
    cw = sourceW;
    ch = Math.round(sourceW / targetR);
  } else {
    // Target is taller (or equal) → keep full height, trim width.
    ch = sourceH;
    cw = Math.round(sourceH * targetR);
  }
  return {
    x: Math.round((sourceW - cw) / 2),
    y: Math.round((sourceH - ch) / 2),
    w: cw,
    h: ch,
  };
}

/**
 * Build the full resize plan for a list of exact sizes: group by canonical
 * source aspect, size each source to cover its members, and attach a crop.
 */
export function planResizes(sizes: Target[]): SourcePlan[] {
  // Bucket targets by canonical source ratio.
  const buckets = new Map<string, { ra: number; rb: number; items: Target[] }>();
  for (const s of sizes) {
    const [ra, rb] = pickSourceRatio(s.w, s.h);
    const key = `${ra}:${rb}`;
    const bucket = buckets.get(key) ?? { ra, rb, items: [] };
    bucket.items.push(s);
    buckets.set(key, bucket);
  }

  const plans: SourcePlan[] = [];
  for (const [key, { ra, rb, items }] of buckets) {
    // Source must cover the largest member on each edge. For a same-aspect
    // crop that's just max(w)/max(h); a strip crop from a flatter/taller
    // source still needs to cover the member's long edge, so max on both is
    // the safe lower bound.
    const needW = Math.max(...items.map((s) => s.w));
    const needH = Math.max(...items.map((s) => s.h));
    const source = sourceCanvasFor(ra, rb, needW, needH);
    if (!source) continue; // physically impossible — skip (shouldn't happen)
    const targets: PlannedTarget[] = items.map((s) => ({
      ...s,
      crop: centerCrop(source.w, source.h, s.w, s.h),
      extreme: isExtreme(s.w, s.h),
    }));
    plans.push({ ratio: key, source, targets });
  }
  // Stable order: landscape sources first by descending width, then portrait.
  plans.sort((a, b) => b.source.w / b.source.h - a.source.w / a.source.h);
  return plans;
}
