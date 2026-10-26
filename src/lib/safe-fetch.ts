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
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import tls from "node:tls";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
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
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice("::ffff:".length);
      if (isIP(v4) === 4) return isBlockedIp(v4);
    }
    return false;
  }
  return true;
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
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Адрес сайта — через публичный DNS (Cloudflare, запасной — Google), а не через
 * DNS сервера: провайдеры подменяют адреса заблокированных у них сайтов
 * (азартные — почти везде) на заглушку, и «Найти по сайту» падало, хотя сам
 * сайт жив. Не ответил ни один — системный DNS, как раньше.
 */
async function resolveHost(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  for (const doh of [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  ]) {
    try {
      const res = await fetch(doh, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5_000) });
      if (!res.ok) continue;
      const j = (await res.json()) as { Answer?: { type: number; data: string }[] };
      const ips = (j.Answer ?? []).filter((a) => a.type === 1 && isIP(a.data) === 4).map((a) => a.data);
      if (ips.length) return ips;
    } catch {
      /* следующий резолвер */
    }
  }
  try {
    return (await lookup(hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new UnsafeUrlError("DNS resolution failed");
  }
}

/** Проверить, что хост ведёт только на публичные адреса; вернуть адрес для соединения. */
async function assertPublicHost(hostname: string): Promise<string> {
  const addrs = await resolveHost(hostname);
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a))) {
    throw new UnsafeUrlError("host resolves to a blocked address");
  }
  return addrs[0];
}

/** Validate an ARBITRARY (no origin allowlist) http(s) URL is safe to fetch
 *  server-side: scheme http(s), hostname resolves only to public IPs. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  await assertPublicHost(url.hostname);
  return url;
}

function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("malformed URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("only http(s) URLs are allowed");
  }
  return url;
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; url: string };

/** Ответ целиком с потолком по размеру: больше limit — ошибка, а не обрезка. */
function readCapped(res: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(res.headers["content-length"] || 0);
    if (declared && declared > limit) {
      res.destroy();
      reject(new UnsafeUrlError("response too large"));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        res.destroy();
        reject(new UnsafeUrlError("response too large"));
      } else chunks.push(c);
    });
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

/**
 * Один запрос без перенаправлений. Напрямую — соединение ровно на проверенный
 * адрес (pinned: подменить адрес между проверкой и запросом нельзя). Через
 * прокси (FETCH_PROXY_URL, http://[user:pass@]host:port) — туннель CONNECT,
 * TLS до сайта поверх него.
 */
function requestOnce(url: URL, ip: string, limit: number, proxy: URL | null): Promise<RawResponse> {
  return new Promise((ok, fail) => {
    // Любой исход снимает общий таймер запроса.
    const timer = setTimeout(() => fail(new UnsafeUrlError("timeout")), FETCH_TIMEOUT_MS);
    const resolve = (r: RawResponse) => { clearTimeout(timer); ok(r); };
    const reject = (e: unknown) => { clearTimeout(timer); fail(e); };
    const isHttps = url.protocol === "https:";
    const port = Number(url.port) || (isHttps ? 443 : 80);
    const headers = { "User-Agent": UA, Accept: "text/html,image/*,*/*;q=0.8", "Accept-Language": "en,ru;q=0.8", Host: url.host };
    const onResponse = (res: http.IncomingMessage) =>
      readCapped(res, limit).then((body) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, url: url.toString() }), reject);

    if (!proxy) {
      const mod = isHttps ? https : http;
      const req = mod.request(
        {
          host: ip,
          port,
          path: url.pathname + url.search,
          method: "GET",
          headers,
          servername: isHttps ? url.hostname : undefined,
          timeout: FETCH_TIMEOUT_MS,
        },
        onResponse,
      );
      req.on("timeout", () => req.destroy(new UnsafeUrlError("timeout")));
      req.on("error", reject);
      req.end();
      return;
    }

    const auth = proxy.username ? { "Proxy-Authorization": `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}` } : {};
    const connect = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: "CONNECT",
      path: `${url.hostname}:${port}`,
      headers: { Host: `${url.hostname}:${port}`, ...auth },
      timeout: FETCH_TIMEOUT_MS,
    });
    connect.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new UnsafeUrlError(`proxy ${res.statusCode}`));
        return;
      }
      const stream = isHttps ? tls.connect({ socket, servername: url.hostname }) : socket;
      const req = (isHttps ? https : http).request(
        { createConnection: () => stream, path: url.pathname + url.search, method: "GET", headers, agent: false },
        onResponse,
      );
      req.on("error", reject);
      req.end();
    });
    connect.on("timeout", () => connect.destroy(new UnsafeUrlError("proxy timeout")));
    connect.on("error", reject);
    connect.end();
  });
}

/** Прокси для сайтов, недоступных из страны сервера: FETCH_PROXY_URL=http://user:pass@host:port. */
function fetchProxy(): URL | null {
  const raw = process.env.FETCH_PROXY_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Сайт не ответил напрямую так, что стоит попробовать через прокси: сеть, таймаут, 403/451 (блок по стране). */
const worthProxy = (r: RawResponse | null) => !r || r.status === 403 || r.status === 451;

/** Fetch an arbitrary public URL, manually following redirects (re-validating
 *  the target's IP at every hop) up to MAX_REDIRECTS times. Direct first; if
 *  the site is unreachable or geo-blocks us and FETCH_PROXY_URL is set — the
 *  same chain through the proxy. */
async function fetchPublicUrlFollowing(raw: string, limit: number): Promise<RawResponse> {
  const proxy = fetchProxy();
  const run = async (via: URL | null): Promise<RawResponse> => {
    let current = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = parsePublicUrl(current);
      const ip = await assertPublicHost(url.hostname);
      const res = await requestOnce(url, ip, limit, via);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.location;
        if (!loc) throw new UnsafeUrlError("redirect with no Location");
        current = new URL(loc, current).toString();
        continue;
      }
      return res;
    }
    throw new UnsafeUrlError("too many redirects");
  };
  let direct: RawResponse | null = null;
  let directError: unknown = null;
  try {
    direct = await run(null);
  } catch (e) {
    // Небезопасный адрес — не повод идти через прокси.
    if (e instanceof UnsafeUrlError && !/timeout|ECONN|EHOST|ENET|socket/i.test(e.message)) throw e;
    directError = e;
  }
  if (proxy && worthProxy(direct)) {
    try {
      return await run(proxy);
    } catch {
      /* прокси тоже не смог — отдаём прямой результат или его ошибку */
    }
  }
  if (direct) return direct;
  throw directError instanceof Error ? directError : new UnsafeUrlError("fetch failed");
}

const header = (h: http.IncomingHttpHeaders, k: string) => String(h[k] ?? "").toLowerCase();

/** Fetch a public webpage's HTML (size-capped, redirect-safe). Returns the
 *  final URL (post-redirects) alongside the text — callers resolve any
 *  relative asset URLs found in the markup against `finalUrl`, not `raw`. */
export async function fetchPublicHtml(raw: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetchPublicUrlFollowing(raw, MAX_HTML_BYTES);
  if (res.status < 200 || res.status >= 300) throw new UnsafeUrlError(`upstream ${res.status}`);
  const ct = header(res.headers, "content-type");
  if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new UnsafeUrlError("not an HTML page");
  }
  return { html: res.body.toString("utf8"), finalUrl: res.url || raw };
}

/** Fetch an arbitrary public image URL (redirect-safe, unlike safeFetchImage
 *  which is restricted to our own FTP origin). Used for logo/og:image
 *  candidates discovered on a third-party site. */
export async function fetchPublicImage(raw: string): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetchPublicUrlFollowing(raw, MAX_IMAGE_BYTES);
  if (res.status < 200 || res.status >= 300) throw new UnsafeUrlError(`upstream ${res.status}`);
  const ct = header(res.headers, "content-type").split(";")[0].trim();
  if (!ct.startsWith("image/")) throw new UnsafeUrlError("not an image");
  return { buffer: res.body, mime: ct || "image/png" };
}
