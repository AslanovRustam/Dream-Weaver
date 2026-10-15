// Фоны готовых тем лендингов (src/lib/landingThemes.ts) → public/landing-themes/<id>.webp.
// Снимает только недостающие — можно перезапускать. Ключ — OPENAI_API_KEY из .env.local.
//
//   npx tsx scripts/gen-landing-themes.mts            # все недостающие
//   npx tsx scripts/gen-landing-themes.mts halloween  # одну тему (перезаписать)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LANDING_THEMES } from "../src/lib/landingThemes";

const ROOT = process.cwd();
const OUT = join(ROOT, "public", "landing-themes");
mkdirSync(OUT, { recursive: true });
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const KEY = (env.match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) throw new Error("OPENAI_API_KEY не найден в .env.local");
const MODEL = "gpt-image-2.5-sunburst";
// sharp — только в этом скрипте; по имени из переменной, чтобы проверка типов на сборке его не требовала.
const SHARP = "sharp";
const sharp = (await import(SHARP)).default as (b: Buffer) => { resize: (w: number, h: number) => { webp: (o: object) => { toBuffer: () => Promise<Buffer> } } };

const only = process.argv[2];
for (const t of LANDING_THEMES) {
  const file = join(OUT, `${t.id}.webp`);
  if (only ? t.id !== only : existsSync(file)) continue;
  const prompt =
    `Full-bleed square background art for a mobile ${t.kind === "sport" ? "sports-betting" : "casino"} landing page: ${t.bgPrompt}. ` +
    "Cinematic, rich and atmospheric, premium 3D-render quality. The CENTRAL area is calmer and slightly darker so a game widget and a headline can sit on top; " +
    "the detail and props live around the edges and corners. Absolutely no text, letters, numbers, logos, UI, buttons or watermarks.";
  process.stdout.write(`${t.id}… `);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", quality: "medium", n: 1 }),
  });
  const data = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const b64 = data.data?.[0]?.b64_json;
  if (!res.ok || !b64) {
    console.log(`ошибка: ${data.error?.message ?? res.status}`);
    continue;
  }
  const webp = await sharp(Buffer.from(b64, "base64")).resize(1024, 1024).webp({ quality: 78 }).toBuffer();
  writeFileSync(file, webp);
  console.log(`${Math.round(webp.length / 1024)} КБ`);
}
