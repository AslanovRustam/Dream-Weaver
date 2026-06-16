// SSRF guard for server-side fetches of user-supplied image URLs.
//
// The ONLY legitimate remote image source is our own public image host
// (the origin of FTP_BASE_URL — that's where every generated banner is
// served from). So we hard-allowlist that origin; additionally we resolve
// the hostname and reject any private / loopback / link-local / ULA /
// metadata IP (defense in depth), block redirects (so an allowed URL
// can't bounce us to an internal target), and cap time + size.
//
// Without this, `fetch(userUrl)` let an authenticated attacker make the
// server read http://169.254.169.254/ (cloud metadata), http://localhost,
// internal RFC1918 hosts, etc. — and fetch-master even reflected the body.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
const FETCH_TIMEOUT_MS = 15_000;

export class UnsafeUrlError extends Error {}

/** Origin (scheme://host[:port]) the server is allowed to fetch from. */
function allowedOrigin(): string | null {
  const base = process.env.FTP_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/** True if an IP literal is in a range the server must never reach
 *  (private / loopback / link-local / ULA / CGNAT / metadata / multicast). */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true; // 0/8, 10/8, loopback
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 → re-check the embedded v4.
      const v4 = lower.slice("::ffff:".length);
      if (isIP(v4) === 4) return isBlockedIp(v4);
    }
    return false;
  }
  return true; // not a valid IP literal → block
}

/**
 * Validate a user-supplied image URL. Throws UnsafeUrlError unless:
 *  - scheme is http(s),
 *  - the origin equals our public image host (FTP_BASE_URL origin),
 *  - every resolved IP is public.
 * Returns the parsed URL on success.
 */
export async function assertAllowedImageUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("malformed URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("only http(s) URLs are allowed");
  }
  const allowed = allowedOrigin();
  if (!allowed) {
    throw new UnsafeUrlError("no allowed image origin configured");
  }
  if (url.origin !== allowed) {
    throw new UnsafeUrlError("URL origin is not allowed");
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(url.hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("DNS resolution failed");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
    throw new UnsafeUrlError("host resolves to a blocked address");
  }
  return url;
}

/**
 * Safely fetch a user-supplied image URL into a Buffer + mime. Enforces
 * the allowlist, refuses redirects, and caps time + size.
 */
export async function safeFetchImage(raw: string): Promise<{ buffer: Buffer; mime: string }> {
  await assertAllowedImageUrl(raw);
  const res = await fetch(raw, {
    redirect: "error", // no redirects → cannot be bounced to an internal target
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "image/*" },
  });
  if (!res.ok) {
    throw new UnsafeUrlError(`upstream ${res.status}`);
  }
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > MAX_IMAGE_BYTES) {
    throw new UnsafeUrlError("image too large");
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_IMAGE_BYTES) {
    throw new UnsafeUrlError("image too large");
  }
  const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  return { buffer: Buffer.from(ab), mime };
}
