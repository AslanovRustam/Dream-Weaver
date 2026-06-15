/**
 * Shared aspect-ratio ↔ pixel-size mapping for gpt-image-2.
 *
 * gpt-image-2 accepts any WxH with:
 *   • both edges divisible by 16
 *   • aspect ratio between 1:3 and 3:1
 *   • max single edge 3840
 *   • total pixels between 655_360 and 8_294_400
 *
 * For every named aspect in our UI we pick a default "2K tier" canvas
 * (~1.5–2.0 MP). When a resize bucket asks for a target tile larger
 * than that default, we scale the model canvas up so the client only
 * ever has to DOWNSCALE — never upscale — when producing tiles.
 *
 * Critically: the same size we send to OpenAI must also be the
 * width/height we record on the generations row. Otherwise zip
 * filenames and history-grid aspect-rendering lie about what the
 * actual image is. Hence this module is used by BOTH:
 *   • generate-image.ts (server prompt + OpenAI size param)
 *   • cardWriter.ts     (DB row width/height)
 */

const OPENAI_MAX_EDGE = 3840;
const OPENAI_MAX_PIXELS = 8_294_400;

interface NativeEntry {
  /** Reduced ratio (a:b, coprime). */
  ra: number;
  rb: number;
  /** Default multiplier — `(ra*m, rb*m)` is the 2K-tier canvas. */
  defaultM: number;
}

/**
 * Per-aspect step + 2K default.
 *
 * Step (the gap between successive valid `m` values) is computed once
 * per aspect: m must keep both `ra*m` and `rb*m` divisible by 16, so
 * m must be a multiple of `lcm(16/gcd(ra,16), 16/gcd(rb,16))`.
 */
const NATIVE: Record<string, NativeEntry> = {
  "1:1": { ra: 1, rb: 1, defaultM: 1024 },
  "3:2": { ra: 3, rb: 2, defaultM: 512 }, // → 1536×1024
  "2:3": { ra: 2, rb: 3, defaultM: 512 },
  "16:9": { ra: 16, rb: 9, defaultM: 112 }, // → 1792×1008
  "9:16": { ra: 9, rb: 16, defaultM: 112 },
  "4:3": { ra: 4, rb: 3, defaultM: 352 }, // → 1408×1056
  "3:4": { ra: 3, rb: 4, defaultM: 352 },
  "5:4": { ra: 5, rb: 4, defaultM: 256 }, // → 1280×1024
  "4:5": { ra: 4, rb: 5, defaultM: 256 },
  "21:9": { ra: 7, rb: 3, defaultM: 304 }, // 21:9 reduces to 7:3 → 2128×912
  "9:21": { ra: 3, rb: 7, defaultM: 304 },
};

function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}
function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

function entryFor(ratio: string | undefined): NativeEntry {
  const hit = ratio ? NATIVE[ratio] : null;
  if (hit) return hit;
  // Fallback: parse a custom ratio. Reduce by gcd. Pick a default
  // multiplier that lands in the ~1.5 MP zone.
  const [aRaw, bRaw] = (ratio ?? "1:1").split(":").map(Number);
  if (!Number.isFinite(aRaw) || !Number.isFinite(bRaw) || aRaw <= 0 || bRaw <= 0) {
    return NATIVE["1:1"];
  }
  const g = gcd(aRaw, bRaw);
  const ra = aRaw / g;
  const rb = bRaw / g;
  // Aim for ~1024 on the long edge.
  const longEdge = 1024;
  const longCount = Math.max(ra, rb);
  const m = Math.max(1, Math.floor(longEdge / longCount));
  return { ra, rb, defaultM: m };
}

/**
 * Returns the multiplier step for this aspect: any valid `m` must be
 * a multiple of `step`. For 16:9 → step=16; for 4:5 → step=16; for
 * 1:1 → step=16 (since 1·m needs to be /16); etc.
 */
function stepFor(entry: NativeEntry): number {
  return lcm(16 / gcd(entry.ra, 16), 16 / gcd(entry.rb, 16));
}

export interface SizeResult {
  w: number;
  h: number;
}

/**
 * Resolve the canvas dimensions we should ask OpenAI to render at.
 *
 * Cases:
 *   • No targetW/targetH: master flow — return the aspect's 2K default.
 *   • targetW/targetH provided (resize bucket): return the smallest
 *     valid canvas that is ≥ target on both edges, preserving the
 *     EXACT aspect ratio, with both edges divisible by 16, and within
 *     OpenAI's pixel and edge caps. The client then does a pure
 *     downscale from this canvas to each tile in the bucket.
 */
export function resolveCanvasSize(
  ratio: string | undefined,
  targetW?: number,
  targetH?: number,
): SizeResult {
  const entry = entryFor(ratio);
  const step = stepFor(entry);
  const { ra, rb } = entry;

  let m = entry.defaultM;

  if (targetW && targetH && targetW > 0 && targetH > 0) {
    // Smallest m such that ra*m ≥ targetW and rb*m ≥ targetH.
    const mForW = Math.ceil(targetW / ra);
    const mForH = Math.ceil(targetH / rb);
    const mMin = Math.max(mForW, mForH, entry.defaultM);
    // Round up to the next valid step.
    m = Math.ceil(mMin / step) * step;
  } else {
    // Master flow: ensure default is already step-aligned (it is for
    // every entry in NATIVE, but guard custom-ratio fallback paths).
    m = Math.ceil(m / step) * step;
  }

  let w = ra * m;
  let h = rb * m;

  // Clamp to OpenAI limits. We shrink m by `step` until we fit.
  while ((w > OPENAI_MAX_EDGE || h > OPENAI_MAX_EDGE || w * h > OPENAI_MAX_PIXELS) && m > step) {
    m -= step;
    w = ra * m;
    h = rb * m;
  }
  // Sanity floor: if even the smallest valid canvas exceeds the cap
  // (shouldn't happen for any aspect we ship), fall back to 1024×1024.
  if (w > OPENAI_MAX_EDGE || h > OPENAI_MAX_EDGE) {
    return { w: 1024, h: 1024 };
  }
  return { w, h };
}

/**
 * Convenience: same as resolveCanvasSize but returns the "WxH" string
 * OpenAI's API expects.
 */
export function openAiSizeString(
  ratio: string | undefined,
  targetW?: number,
  targetH?: number,
): string {
  const { w, h } = resolveCanvasSize(ratio, targetW, targetH);
  return `${w}x${h}`;
}
