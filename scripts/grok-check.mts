// Проверка запасной генерации через Grok (src/lib/grokImage.ts) — без сети.
//
//   npx tsx scripts/grok-check.mts
//
// Вырезка фона на синтетической картинке: предмет на маджента-фоне с
// замкнутым «окном» фона внутри и деталью того же цвета, что фон, но не
// чистого. Плюс распознавание отказа OpenAI по фильтру и выключенный Grok
// без ключа.

import sharp from "sharp";

import { grokConfigured, grokOnFilter, isFilterRejection, keyOutBackground } from "../src/lib/grokImage";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

// 200×200: маджента; синий квадрат 60..140 с маджента-окном 90..110 внутри
const W = 200;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}">
  <rect width="${W}" height="${W}" fill="#ff00ff"/>
  <rect x="60" y="60" width="80" height="80" fill="#1f4fd8"/>
  <rect x="90" y="90" width="20" height="20" fill="#ff00ff"/>
  <rect x="64" y="64" width="10" height="10" fill="#b0306f"/>
</svg>`;
const png = await keyOutBackground(await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer());
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
check("PNG с альфой", info.channels === 4);
check("фон снаружи прозрачный", alpha(5, 5) === 0 && alpha(195, 100) === 0);
check("предмет непрозрачный", alpha(75, 100) === 255 && alpha(130, 130) === 255);
check("замкнутое окно фона внутри — прозрачное", alpha(100, 100) === 0, String(alpha(100, 100)));
check("деталь, похожая на фон, но не он — на месте", alpha(69, 69) === 255, String(alpha(69, 69)));

// без ровного фона — картинку не портим
const noisy = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#808080" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">${Array.from({ length: 64 }, (_, i) => `<rect x="${(i * 7) % 64}" y="${(i * 13) % 64}" width="9" height="9" fill="hsl(${i * 37},80%,50%)"/>`).join("")}</svg>`) }])
  .png().toBuffer();
const kept = await sharp(await keyOutBackground(noisy)).raw().toBuffer({ resolveWithObject: true });
check("пёстрая картинка без фона — не прозрачная насквозь", kept.data[3] > 0 || kept.data[kept.data.length - 1] > 0);

// отказ OpenAI и выключенный Grok
check("отказ по фильтру распознаётся", isFilterRejection(JSON.stringify({ error: { message: "Your request was rejected by the safety system.", code: "moderation_blocked" } })));
check("обычная ошибка — не фильтр", !isFilterRejection(JSON.stringify({ error: { message: "Rate limit reached" } })));
const saved = process.env.XAI_API_KEY;
delete process.env.XAI_API_KEY;
check("без XAI_API_KEY Grok выключен", !grokConfigured() && (await grokOnFilter(false, '{"error":{"message":"rejected by the safety system"}}', { prompt: "x", size: "1024x1024", transparent: true })) === null);
if (saved !== undefined) process.env.XAI_API_KEY = saved;
check("при успехе OpenAI Grok не вызывается", (await grokOnFilter(true, "{}", { prompt: "x", size: "1024x1024", transparent: true })) === null);

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
