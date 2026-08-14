// One-off: compress public/previews/*.png → *.webp (resized for tile previews)
// and delete the source PNGs, so the repo carries lightweight previews instead
// of ~1.5MB PNGs. Re-runnable.
import sharp from "sharp";
import { readdirSync, unlinkSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "previews");
const pngs = readdirSync(DIR).filter((f) => f.endsWith(".png"));
let before = 0, after = 0;

for (const png of pngs) {
  const src = join(DIR, png);
  const out = join(DIR, png.replace(/\.png$/, ".webp"));
  before += statSync(src).size;
  await sharp(src).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  after += statSync(out).size;
  unlinkSync(src);
  console.log(`${png} -> ${png.replace(/\.png$/, ".webp")}`);
}

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`\nDone. ${pngs.length} files: ${mb(before)}MB PNG -> ${mb(after)}MB webp`);
