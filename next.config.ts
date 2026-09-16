import type { NextConfig } from "next";

// NEXT_PUBLIC_DEV_AUTH_BYPASS only affects client-side presentation (server
// authz never consults it), but a production bundle built with it on would
// still render the admin UI for everyone. Refuse to build that.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true") {
  throw new Error("NEXT_PUBLIC_DEV_AUTH_BYPASS must not be enabled in a production build");
}

const isDev = process.env.NODE_ENV !== "production";

// Supabase origin for connect-src (REST + realtime websocket). Falls back to
// the wildcard so a missing env at build time can't lock the app out.
const supabaseOrigin = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return `${u.origin} ${u.origin.replace(/^http/, "ws")}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
})();

// 'unsafe-inline' for scripts is required by Next's own inline runtime and by
// the generated landings/playables previewed in srcdoc iframes (they inherit
// this CSP and are built from inline <script>). Tightening to nonces is a
// Phase 2 item that needs those previews on a separate origin first.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}`,
  "frame-src 'self' blob: data: about:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Portable Node build for ukraine.com.ua hosting (VPS or Node-shared).
  output: "standalone",
  // Keep these out of the webpack bundle: basic-ftp uses raw Node sockets, and
  // the document parsers (mammoth / pdfjs-dist) pull in Node-only code that must
  // be required at runtime on the server, not bundled.
  serverExternalPackages: ["basic-ftp", "mammoth", "pdfjs-dist"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Report-Only for the first production deploy: violations show up in
          // the browser console without breaking anything. Once a pass through
          // every generator + the playable/landing previews is clean, rename to
          // "Content-Security-Policy" to enforce.
          { key: "Content-Security-Policy-Report-Only", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
