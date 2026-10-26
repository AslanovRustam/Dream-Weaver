// Кнопки магазинов для письма — целиком картинкой.
//
//   npx tsx scripts/gen-store-badges.mts
//
// Почему картинкой: Gmail на Android перекрашивает письмо целиком (и тёмное
// тоже), а картинки — нет. Кнопка из ячейки с чёрным фоном и белым значком
// после перекраски становилась светлой, и белый значок на ней пропадал.
// Кнопка-картинка (как официальные бейджи App Store и Google Play) остаётся
// чёрной с белым в любой теме почтовика.
//
// Собирает из белых глифов src/lib/emailStoreIcons.ts: чёрная скруглённая
// плашка, глиф, подпись. Пишет src/lib/emailStoreBadges.ts (PNG в base64,
// вдвое больше — для ретины). Руками файл не правят — запускают скрипт.

import { writeFileSync } from "node:fs";
import sharp from "sharp";

import { APP_STORE_ICON, GOOGLE_PLAY_ICON } from "../src/lib/emailStoreIcons";

const SCALE = 2;
const H = 38; // высота кнопки в письме, px
const PAD_X = 14, GAP = 8, GLYPH_H = 22, FONT = 13;

async function textWidth(label: string): Promise<number> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><text x="0" y="50" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${FONT * SCALE}" fill="#fff">${label}</text></svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return info.width;
}

async function badge(label: string, glyph: string, glyphW: number): Promise<{ b64: string; width: number }> {
  const tw = await textWidth(label);
  const w = (PAD_X * 2 + glyphW + GAP) * SCALE + tw;
  const h = H * SCALE;
  const gx = PAD_X * SCALE, gy = ((H - GLYPH_H) / 2) * SCALE;
  const tx = (PAD_X + glyphW + GAP) * SCALE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect x="0" y="0" width="${w}" height="${h}" rx="${8 * SCALE}" fill="#000000"/>
  <image href="${glyph}" x="${gx}" y="${gy}" width="${glyphW * SCALE}" height="${GLYPH_H * SCALE}"/>
  <text x="${tx}" y="${h / 2}" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${FONT * SCALE}" fill="#ffffff">${label}</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { b64: png.toString("base64"), width: Math.round(w / SCALE) };
}

const app = await badge("App Store", APP_STORE_ICON, 17);
const play = await badge("Google Play", GOOGLE_PLAY_ICON, 22);

writeFileSync(
  "src/lib/emailStoreBadges.ts",
  `// Кнопки магазинов для письма целиком — PNG вдвое больше (ретина).
// Сгенерировано scripts/gen-store-badges.mts — руками не править.
// Картинкой, а не ячейкой с фоном: почтовики, перекрашивающие письмо (Gmail
// на Android), картинки не трогают — кнопка остаётся чёрной с белым.

/** Высота кнопки в письме, px. */
export const STORE_BADGE_HEIGHT = ${H};

export const APP_STORE_BADGE_WIDTH = ${app.width};
export const APP_STORE_BADGE = "data:image/png;base64,${app.b64}";

export const GOOGLE_PLAY_BADGE_WIDTH = ${play.width};
export const GOOGLE_PLAY_BADGE = "data:image/png;base64,${play.b64}";
`,
);
console.log("App Store", app.width + "x" + H, Math.round(app.b64.length * 0.75), "B;", "Google Play", play.width + "x" + H, Math.round(play.b64.length * 0.75), "B");
