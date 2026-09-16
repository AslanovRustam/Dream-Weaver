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

function tooMany(retryAfterSec: number): Response {
  return Response.json(
    { error: "rate_limited", retry_after: retryAfterSec },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  );
}

/**
 * Convenience wrapper for route handlers: returns a ready 429 Response when
 * the (bucket,key) is over the limit, or null to proceed.
 *
 * Two tiers:
 *   1. the in-process window above — free, and rejects a hammering client
 *      before we touch the network;
 *   2. the shared `rate_limit_hit` RPC (migration 0010) — the counter that
 *      actually holds across restarts/deploys and multiple Node instances.
 *      Without it the limit silently became `limit × instances` and reset to
 *      zero on every deploy.
 * If the RPC is unavailable (migration not applied, DB hiccup) we log and fall
 * back to tier 1 only — availability over strictness, since every bucket is
 * keyed by an authenticated user id, not by IP.
 */
export async function rateLimitResponse(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<Response | null> {
  const local = checkRate(bucket, key, limit, windowMs);
  if (!local.ok) return tooMany(local.retryAfterSec);

  try {
    const { getAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await getAdminClient().rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; retry_after_sec?: number }
      | null
      | undefined;
    if (row && row.allowed === false) {
      return tooMany(Math.max(1, Number(row.retry_after_sec ?? 1)));
    }
  } catch (err) {
    if (!warnedSharedLimiter) {
      warnedSharedLimiter = true;
      console.warn(
        "[rate-limit] shared counter unavailable, using in-process window only:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return null;
}
let warnedSharedLimiter = false;

// ---------------------------------------------------------------------
// In-flight concurrency cap
// ---------------------------------------------------------------------
// The rate limiter bounds calls per minute; this bounds calls at the SAME
// moment. generate-image reads the balance once per request, so N parallel
// requests all see the same balance and all pass the pre-gate — capping
// in-flight work per user is what actually limits that overspend window.
const inflight = new Map<string, number>();

/** Try to take a slot for (bucket,key). Returns a release() to call in a
 *  `finally`, or null when `max` slots are already in use. */
export function acquireSlot(bucket: string, key: string, max: number): (() => void) | null {
  const k = `${bucket}:${key}`;
  const n = inflight.get(k) ?? 0;
  if (n >= max) return null;
  inflight.set(k, n + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const c = (inflight.get(k) ?? 1) - 1;
    if (c <= 0) inflight.delete(k);
    else inflight.set(k, c);
  };
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
export const MAX_DATAURL_BYTES = 20 * 1024 * 1024;

/** Approximate decoded byte length of a `data:...;base64,XXXX` URL. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}
