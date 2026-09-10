// Lightweight <head> signal extraction for the "Найти по сайту" brand lookup.
// Pure string/regex parsing — no DOM/JSDOM/cheerio dependency, and critically
// no HTML execution: we only ever read text out of the markup, never render
// or evaluate it. Good enough for the handful of well-standardised tags every
// real site's <head> carries.

export type LogoCandidate = { url: string; kind: string; score: number };

// Attribute values are markup — `href="...&amp;h=180"` — so a literal `&amp;`
// must become `&` before the value is usable as a real URL query string.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    const key = (m[1] ?? m[3] ?? "").toLowerCase();
    const val = decodeEntities(m[2] ?? m[4] ?? "");
    if (key) out[key] = val;
  }
  return out;
}

/** Resolve a possibly-relative asset URL against the page's (post-redirect)
 *  final URL. Returns null for anything that isn't a usable http(s) URL
 *  (data: URIs are skipped — we want a real fetchable asset here). */
function resolve(href: string, baseUrl: string): string | null {
  try {
    const u = new URL(href, baseUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Rank every plausible logo/icon asset a page's <head> advertises, best guess
 * first. Priority: apple-touch-icon (usually a clean square mark) > largest
 * declared `sizes=` icon > og:image / twitter:image (a real marketing image —
 * useful for the visual-style pass even when it isn't a clean logo) >
 * favicon.ico as the last resort.
 */
export function extractLogoCandidates(html: string, baseUrl: string): LogoCandidate[] {
  const headEnd = html.indexOf("</head>");
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 40_000);
  const out: LogoCandidate[] = [];

  const linkTags = head.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const a = attrsOf(tag);
    const rel = (a.rel || "").toLowerCase();
    if (!a.href) continue;
    const url = resolve(a.href, baseUrl);
    if (!url) continue;
    if (rel.includes("apple-touch-icon")) {
      out.push({ url, kind: "apple-touch-icon", score: 100 });
    } else if (rel === "icon" || rel === "shortcut icon" || rel.includes("mask-icon")) {
      const sizeMatch = /(\d+)x\d+/.exec(a.sizes || "");
      const size = sizeMatch ? Number(sizeMatch[1]) : 32;
      out.push({ url, kind: "icon", score: 40 + Math.min(size, 256) / 4 });
    }
  }

  const metaTags = head.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const a = attrsOf(tag);
    const prop = (a.property || a.name || "").toLowerCase();
    if (!a.content) continue;
    if (prop === "og:image" || prop === "og:image:url") {
      const url = resolve(a.content, baseUrl);
      if (url) out.push({ url, kind: "og:image", score: 30 });
    } else if (prop === "twitter:image") {
      const url = resolve(a.content, baseUrl);
      if (url) out.push({ url, kind: "twitter:image", score: 25 });
    }
  }

  // Last-resort default favicon path (works even with no <link rel="icon">).
  const fallback = resolve("/favicon.ico", baseUrl);
  if (fallback) out.push({ url: fallback, kind: "favicon.ico", score: 5 });

  // De-dupe by URL, keep highest score, sort best-first.
  const byUrl = new Map<string, LogoCandidate>();
  for (const c of out) {
    const prev = byUrl.get(c.url);
    if (!prev || c.score > prev.score) byUrl.set(c.url, c);
  }
  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

/** og:site_name, else the page <title> (trimmed of a trailing " — Slogan"
 *  suffix many sites append), else "". */
export function extractSiteName(html: string): string {
  const headEnd = html.indexOf("</head>");
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 40_000);
  const metaTags = head.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const a = attrsOf(tag);
    if ((a.property || "").toLowerCase() === "og:site_name" && a.content) {
      return a.content.trim();
    }
  }
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(head);
  if (titleMatch?.[1]) {
    return titleMatch[1].split(/[|–—-]/)[0].trim();
  }
  return "";
}
