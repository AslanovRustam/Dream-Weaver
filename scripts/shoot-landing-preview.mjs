// Render an exported landing page to a gallery preview JPEG.
//
//   node scripts/shoot-landing-preview.mjs <exported.html> <out.jpg>
//   node scripts/shoot-landing-preview.mjs ~/Downloads/my-wheel.html \
//        public/landing-previews/gambling-wheel.jpg
//
// Input is a "Скачать HTML" export from one of the landing builders — a
// self-contained page with the generated background/characters inlined as
// base64 — so this needs no dev server, no auth and no API spend, and the
// preview shows a REAL full generation instead of the empty default state.
//
// 1200x900 (4:3) at quality 82 keeps the file ~200KB: these are gallery
// cards a few hundred px wide, a 2x shot ballooned them past 700KB for no
// visible gain.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node scripts/shoot-landing-preview.mjs <exported.html> <out.jpg>");
  process.exit(1);
}

const W = 1200;
const H = 900;

// Exports taken before the decorative "EN" pill was dropped from the landing
// header still carry it; strip it so a preview never advertises a control the
// product no longer has.
let html = await readFile(src, "utf8");
html = html.split('<span class="lang">EN</span>').join("");
const patched = join(tmpdir(), `landing-preview-${Date.now()}.html`);
await writeFile(patched, html, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(patched).href, { waitUntil: "load" });
// Let fonts and the mount-time wheel/reel render settle before the shot.
await page.waitForTimeout(2500);
await page.screenshot({ path: out, type: "jpeg", quality: 82 });
await browser.close();
console.log(`saved ${out}`);
