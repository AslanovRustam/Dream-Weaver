import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portable Node build for ukraine.com.ua hosting (VPS or Node-shared).
  output: "standalone",
  // basic-ftp opens raw TCP/TLS sockets via Node `net`/`tls` — keep it external
  // so it is required at runtime, not bundled.
  serverExternalPackages: ["basic-ftp"],
};

export default nextConfig;
