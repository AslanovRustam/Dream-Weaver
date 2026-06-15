// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, componentTagger (dev-only),
//     VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins,
//     and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// ---------------------------------------------------------------------------
// Load .env into process.env BEFORE Vite/TanStack boot so server-side handlers
// can use process.env.X. We also fall back to legacy .dev.vars for transition.
// VITE_* client variables live in .env.local (loaded natively by Vite).
// ---------------------------------------------------------------------------
function loadServerEnv() {
  const candidates = [".env", ".dev.vars"];
  for (const filename of candidates) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

loadServerEnv();

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
});
