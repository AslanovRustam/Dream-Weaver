// Re-encode every banner-template preview in public/previews to a 768px-wide
// WebP (tiles render at ~400 CSS px; 768 covers 2× displays). The generator
// (gen-previews.mjs) writes 1536×1024 PNGs of ~2 MB each — 98 of them made the
// catalog pull ~180 MB. Run after generating new previews:
//   node scripts/optimize-previews.mjs
import sharp from "sharp";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "previews");
const WIDTH = 768;
let before = 0, after = 0, n = 0;
for (const f of readdirSync(DIR)) {
  if (!/\.(png|webp|jpe?g)$/i.test(f)) continue;
  const src = join(DIR, f);
  const id = f.replace(/\.\w+$/, "");
  const out = join(DIR, `${id}.webp`);
  before += statSync(src).size;
  // Buffer first: sharp can't stream onto its own input, and a rename over a
  // file the dev server is watching fails on Windows (EPERM).
  // Read the input into memory so sharp never holds a handle on the file we
  // are about to overwrite (webp → webp in place).
  const buf = await sharp(readFileSync(src)).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  if (src !== out) unlinkSync(src);
  // The dev server / AV can hold a freshly written file for a moment on
  // Windows — retry instead of dying halfway through the batch.
  for (let attempt = 1; ; attempt++) {
    try {
      writeFileSync(out, buf);
      break;
    } catch (e) {
      if (attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  after += statSync(out).size;
  n++;
}
console.log(`${n} files: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
