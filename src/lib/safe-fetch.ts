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

// ---------------------------------------------------------------------------
// Arbitrary-public-URL fetching — used by the "Найти по сайту" brand lookup
// (analyze-banner-for-landing's sibling: instead of an uploaded banner, the
// source is a THIRD-PARTY WEBSITE the user names, found via web search). This
// is a materially bigger attack surface than assertAllowedImageUrl above (no
// origin allowlist — fetching arbitrary internet hosts is the whole point),
// so it adds what that one gets for free from the allowlist: manual redirect
// following with the SAME IP check re-applied at every hop. `redirect:"error"`
// would just break normal sites (bare-domain→www, http→https are near-universal
// redirects); blindly following redirects would let a same-origin-on-request-
// #1 URL still bounce to an internal target on hop #2.
const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB — plenty for a homepage <head>
const MAX_REDIRECTS = 5;

async function assertPublicHost(hostname: string): Promise<void> {
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("DNS resolution failed");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
    throw new UnsafeUrlError("host resolves to a blocked address");
  }
}

/** Validate an ARBITRARY (no origin allowlist) http(s) URL is safe to fetch
 *  server-side: scheme http(s), hostname resolves only to public IPs. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("malformed URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("only http(s) URLs are allowed");
  }
  await assertPublicHost(url.hostname);
  return url;
}

/** Fetch an arbitrary public URL's response, manually following redirects
 *  (re-validating the target's IP at every hop) up to MAX_REDIRECTS times.
 *  Returns the final Response — caller reads/caps the body. */
async function fetchPublicUrlFollowing(raw: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GenGoBrandLookup/1.0)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new UnsafeUrlError("redirect with no Location");
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("too many redirects");
}

/** Fetch a public webpage's HTML (size-capped, redirect-safe). Returns the
 *  final URL (post-redirects) alongside the text — callers resolve any
 *  relative asset URLs found in the markup against `finalUrl`, not `raw`. */
export async function fetchPublicHtml(raw: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetchPublicUrlFollowing(raw);
  if (!res.ok) throw new UnsafeUrlError(`upstream ${res.status}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new UnsafeUrlError("not an HTML page");
  }
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > MAX_HTML_BYTES) throw new UnsafeUrlError("page too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_HTML_BYTES) throw new UnsafeUrlError("page too large");
  return { html: buf.toString("utf8"), finalUrl: res.url || raw };
}

/** Fetch an arbitrary public image URL (redirect-safe, unlike safeFetchImage
 *  which is restricted to our own FTP origin). Used for logo/og:image
 *  candidates discovered on a third-party site. */
export async function fetchPublicImage(raw: string): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetchPublicUrlFollowing(raw);
  if (!res.ok) throw new UnsafeUrlError(`upstream ${res.status}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/")) throw new UnsafeUrlError("not an image");
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > MAX_IMAGE_BYTES) throw new UnsafeUrlError("image too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new UnsafeUrlError("image too large");
  return { buffer: buf, mime: ct || "image/png" };
}
