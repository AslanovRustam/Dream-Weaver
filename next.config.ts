import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portable Node build for ukraine.com.ua hosting (VPS or Node-shared).
  output: "standalone",
  // basic-ftp opens raw TCP/TLS sockets via Node `net`/`tls` — keep it external
  // so it is required at runtime, not bundled.
  // Keep these out of the webpack bundle: basic-ftp uses raw Node sockets, and
  // the document parsers (mammoth / pdfjs-dist) pull in Node-only code that must
  // be required at runtime on the server, not bundled.
  serverExternalPackages: ["basic-ftp", "mammoth", "pdfjs-dist"],
};

export default nextConfig;
