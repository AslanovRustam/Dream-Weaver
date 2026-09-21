import { createHash } from "node:crypto";

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

/**
 * Cheap pre-parse guard on the declared request size. App Router route
 * handlers have NO default body limit (the 4 MB cap is a Pages-API thing), so
 * without this a route reads however many hundred MB a client sends before
 * any of the per-field checks below can run. Chunked requests carry no
 * content-length and pass through — the per-field caps still apply to them.
 */
export function rejectLargeBody(request: Request, maxBytes: number): Response | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > maxBytes) return payloadTooLarge(maxBytes);
  return null;
}

function payloadTooLarge(maxBytes: number): Response {
  return Response.json({ error: "payload_too_large", max_bytes: maxBytes }, { status: 413 });
}

export type CappedBody =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json"; response: Response };

/**
 * Read and parse a JSON body, refusing to buffer more than maxBytes whatever
 * the caller declares. rejectLargeBody trusts content-length, which a chunked
 * request simply omits; this reads the stream and cancels it the moment the
 * cap is passed, so an unauthenticated route cannot be made to hold an
 * arbitrary body in memory.
 */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<CappedBody> {
  const declared = rejectLargeBody(request, maxBytes);
  if (declared) return { ok: false, reason: "too_large", response: declared };

  const body = request.body;
  if (!body) return { ok: true, value: null };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large", response: payloadTooLarge(maxBytes) };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      response: Response.json({ error: "Invalid body" }, { status: 400 }),
    };
  }

  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.byteLength;
  }
  const text = new TextDecoder().decode(merged).trim();
  if (!text) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      response: Response.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}

/**
 * Rate-limit key for routes that have no user to key on.
 *
 * X-Forwarded-For is a chain, and everything except the LAST entry is whatever
 * the caller chose to send. Keying on the first entry — the usual "original
 * client" reading — lets anyone mint a fresh bucket per request and walk
 * straight past the limit. The last entry is the one our own proxy appended,
 * the only value in that header we did not take on trust. This assumes exactly
 * one reverse proxy in front of the app (Traefik, see docs/DEPLOY_HOSTINGER.md);
 * another hop means counting back one more entry.
 *
 * The address is hashed, so the limiter's key store never holds a raw IP.
 */
export function clientRateKey(request: Request): { key: string; identified: boolean } {
  const chain = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = chain.length
    ? chain[chain.length - 1]
    : (request.headers.get("x-real-ip") || "").trim();
  if (!ip) return { key: "no-client-ip", identified: false };
  return { key: createHash("sha256").update(ip).digest("hex").slice(0, 32), identified: true };
}

// ---------------------------------------------------------------------
// Content sniffing — never trust the client's MIME / extension
// ---------------------------------------------------------------------

export type SniffedImage = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Identify a real raster image by its magic bytes, or null. */
export function sniffImageMime(buf: Uint8Array): SniffedImage | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Decode only the head of a base64 data URL — enough for magic bytes,
 *  without materialising a 20 MB buffer just to look at 12 bytes. */
function dataUrlHead(dataUrl: string, bytes = 32): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return new Uint8Array(0);
  // 4 base64 chars → 3 bytes; take a little extra and slice.
  const chars = Math.ceil(bytes / 3) * 4 + 4;
  return Buffer.from(dataUrl.slice(comma + 1, comma + 1 + chars), "base64").subarray(0, bytes);
}

/**
 * Validate that a `data:image/...;base64,` field really holds PNG/JPEG/WebP/
 * GIF bytes AND is within MAX_DATAURL_BYTES. Returns a ready 413/415 Response
 * or null to proceed. Non-string / non-data: values are ignored (the caller
 * decides whether the field is required).
 */
export function assertImageDataUrl(field: string, value: unknown): Response | null {
  if (typeof value !== "string" || !value.startsWith("data:")) return null;
  if (dataUrlByteLength(value) > MAX_DATAURL_BYTES) {
    return Response.json({ error: `${field} too large` }, { status: 413 });
  }
  if (!sniffImageMime(dataUrlHead(value))) {
    return Response.json(
      { error: `${field} is not a PNG/JPEG/WebP/GIF image` },
      { status: 415 },
    );
  }
  return null;
}

/** Magic bytes of the two document formats parse-brief accepts. */
export function sniffDocument(buf: Uint8Array): "docx" | "pdf" | null {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return "docx"; // ZIP container (OOXML)
  }
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) {
    return "pdf"; // "%PDF-"
  }
  return null;
}
