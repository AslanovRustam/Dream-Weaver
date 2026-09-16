// Shared helpers for the static landing exporters (wheelExport / slotExport /
// crashExport). They build a self-contained HTML page by string interpolation,
// and user-entered text (headline, prize labels, bonus texts, CTA URL) reaches
// three different sink types that each need their own treatment:
//
//   - HTML text/attributes  -> the exporters' local `esc()`
//   - inline <script> JSON  -> embedJson(): JSON.stringify does NOT escape "/",
//                              so a value containing "</script>" terminates the
//                              script element and injects markup into the page
//   - CSS url('...')        -> cssUrl(): a quote or ")" ends the url() token
//   - navigation target     -> safeCtaUrl(): "javascript:" / "data:" would run
//                              in the PUBLISHER's top frame (exports do
//                              window.top.location = ctaUrl on purpose)
//
// Regexes are built at runtime from char codes on purpose: source-level
// \uXXXX escapes for U+2028/2029 and control chars have been mangled into the
// literal characters by tooling before, which silently breaks the file.

const ch = (n: number) => String.fromCharCode(n);
const LINE_SEP = ch(0x2028);
const PARA_SEP = ch(0x2029);
// [\x00-\x1f\x7f]
const CONTROL_RE = new RegExp(`[${ch(0)}-${ch(31)}${ch(127)}]`, "g");
// ['")\\] plus control chars — everything that can close a CSS url('…') token
const CSS_URL_UNSAFE_RE = new RegExp(`['")\\\\${ch(0)}-${ch(31)}]`, "g");

/** JSON that is safe to embed inside an inline <script>: no "</script>"
 *  breakout, no U+2028/2029 line terminators (invalid inside JS strings). */
export function embedJson(v: unknown): string {
  return JSON.stringify(v)
    .split("<").join("\\u003c")
    .split(LINE_SEP).join("\\u2028")
    .split(PARA_SEP).join("\\u2029");
}

/** Reject URL schemes that execute code; everything else — including tracker
 *  macros like {clickurl} or %%CLICK_URL%% that the traffic source replaces
 *  later — passes through untouched. Control chars are stripped first so
 *  "java<TAB>script:" can't sneak past the check. */
export function safeCtaUrl(u: string | undefined): string {
  const t = (u ?? "").trim().replace(CONTROL_RE, "");
  return /^\s*(javascript|data|vbscript|file|blob):/i.test(t) ? "" : t;
}

/** Value for a CSS url('…') token: strip the characters that would close it. */
export function cssUrl(s: string): string {
  return String(s ?? "").replace(CSS_URL_UNSAFE_RE, "");
}
