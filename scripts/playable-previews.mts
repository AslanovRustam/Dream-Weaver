// Превью-картинки для каталога плейблов: собираем каждый плейбл как есть,
// открываем в headless Chromium, ждём, пока сцена встанет, и снимаем кадр.
//
//   npx tsx scripts/playable-previews.mts            — все
//   npx tsx scripts/playable-previews.mts scene-wheel — только указанные
//
// Картинки кладутся в public/playable/previews/<id>.webp и коммитятся:
// каталог показывает их как обычные файлы, без живых iframe.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAYABLE_CATALOG } from "../src/lib/playableCatalog";
import { buildScenePlayable, type SceneLoader } from "../src/lib/scenes/build";
import { DEFAULT_WIN_INDEX, scenePreset } from "../src/lib/scenes/presets";

// Playwright — только для локальных скриптов, в зависимостях проекта его нет.
// Грузим по имени из переменной: проверка типов на сборке (Vercel) его не ищет.
const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };
const SHARP = "sharp"; // транзитивно из Next — тоже по имени
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharp = ((await import(SHARP)) as { default: any }).default;

const ROOT = join(import.meta.dirname, "..", "public");
const OUT = join(ROOT, "playable", "previews");
mkdirSync(OUT, { recursive: true });

const diskLoader: SceneLoader = {
  text: async (p) => readFileSync(join(ROOT, p), "utf8"),
  base64: async (p) => readFileSync(join(ROOT, p)).toString("base64"),
};

async function htmlFor(id: string): Promise<string> {
  const item = PLAYABLE_CATALOG.find((i) => i.id === id);
  if (!item) throw new Error(`нет в каталоге: ${id}`);
  const p = scenePreset(item.scene, "ru");
  return buildScenePlayable(
    {
      scene: item.scene,
      text: p.text,
      amount: 500,
      unit: p.unit,
      locale: "ru-RU",
      clickUrl: "https://example.com",
      legal: p.legal,
      brandName: "BRAND",
      logo: "",
      prizes: p.prizes,
      winIndex: DEFAULT_WIN_INDEX,
      lang: "ru",
    },
    { network: "mraid", preview: true, load: diskLoader },
  );
}

const only = process.argv.slice(2);
const ids = PLAYABLE_CATALOG.map((i) => i.id).filter((id) => !only.length || only.includes(id));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
for (const id of ids) {
  await page.setContent(await htmlFor(id), { waitUntil: "load" });
  await page.waitForTimeout(2200); // шрифт, вход сцены, рука-подсказка
  const png = await page.screenshot({ type: "png" });
  const out = join(OUT, `${id}.webp`);
  await sharp(png).resize({ width: 480 }).webp({ quality: 78 }).toFile(out);
  console.log(`✓ ${id}`);
}
await browser.close();
