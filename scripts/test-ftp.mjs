/**
 * Quick FTP connectivity check.
 *   bun run scripts/test-ftp.mjs
 *
 * Loads .env, opens FTP connection, uploads a tiny test PNG, then
 * deletes it. Prints public URL so you can verify HTTP access too.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- load .env ---
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const { ping } = await import("../src/lib/ftp/uploader.ts");
const { uploadImage } = await import("../src/lib/ftp/storage.ts");

console.log("→ ping FTP...");
const p = await ping();
console.log("  result:", p);
if (!p.ok) process.exit(1);

console.log("→ upload tiny test PNG...");
// 1x1 transparent PNG
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const fakeUserId = "test-1234-5678-9abc-def012345678";
const fakePublicId = "00000000-test-test-test-000000000000";

const result = await uploadImage(tinyPng, {
  userId: fakeUserId,
  publicId: fakePublicId,
  kind: "master",
  format: "png",
});

console.log("  uploaded:");
console.log("    URL:     ", result.url);
console.log("    FTP path:", result.ftpPath);
console.log("    filename:", result.filename);
console.log("");
console.log("Open the URL in your browser to verify HTTP serving works.");
console.log("Then delete the test file via WinSCP if needed.");
