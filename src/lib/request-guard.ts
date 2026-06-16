// Request-hardening primitives:
//   1. In-memory rate limiting (fixed window per bucket+key).
//   2. Inbound payload-size checks for base64 data: URLs.
//
// Single Node instance today → the store is in-process. Horizontal scale
// moves this to a shared store (Redis/Upstash) — see QUEUE-1 Ф3 in PLAN.md.
// This closes SEC-H1 (no rate-limit anywhere) and SEC-H4 (unbounded
// inbound dataURL → OOM).

// ---------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------
type Hit = { count: number; resetAt: number };
const windows = new Map<string, Map<string, Hit>>();

/** Fixed-window counter. Returns whether the call is allowed + seconds to
 *  wait if not. */
export function checkRate(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  let b = windows.get(bucket);
  if (!b) {
    b = new Map();
    windows.set(bucket, b);
  }
  const hit = b.get(key);
  if (!hit || hit.resetAt <= now) {
    b.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (hit.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) };
  }
  hit.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Convenience wrapper for route handlers: returns a ready 429 Response
 *  when the (bucket,key) is over the limit, or null to proceed. */
export function rateLimitResponse(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Response | null {
  const r = checkRate(bucket, key, limit, windowMs);
  if (r.ok) return null;
  return Response.json(
    { error: "rate_limited", retry_after: r.retryAfterSec },
    { status: 429, headers: { "retry-after": String(r.retryAfterSec) } },
  );
}

// Periodic sweep so the maps don't grow unbounded (esp. with per-IP keys).
const sweep: ReturnType<typeof setInterval> = setInterval(() => {
  const now = Date.now();
  for (const b of windows.values()) {
    for (const [k, hit] of b) {
      if (hit.resetAt <= now) b.delete(k);
    }
  }
}, 60_000);
(sweep as unknown as { unref?: () => void }).unref?.();

// ---------------------------------------------------------------------
// Inbound payload size
// ---------------------------------------------------------------------

/** Per inbound image field. Blocks the "POST a 100 MB dataURL" OOM vector
 *  while staying generous for real masters/logos/screenshots. */
export const MAX_DATAURL_BYTES = 20 * 1024 * 1024; // 20 MB

/** Approximate decoded byte length of a `data:...;base64,XXXX` URL. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}
