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
import { buildPlayableHtml, type PlayableInput, type PlayableMechanic } from "../src/lib/playableGen";
import { PLAYABLE_TEMPLATES } from "../src/lib/playableTemplates";
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

function constructorInput(mechanic: PlayableMechanic, over: Partial<PlayableInput> = {}): PlayableInput {
  return {
    mechanic,
    clickUrl: "https://example.com",
    network: "mraid",
    preview: true,
    offer: "",
    brandName: "BRAND",
    brandLogo: "",
    language: "ru",
    accent: "#d4ff3d",
    alwaysWin: true,
    ctaText: "",
    duration: "short",
    ratio: "9:16",
    reels: 3,
    slotSymbols: [],
    wheelPrizes: ["100 FS", "x2", "50 FS", "500 FS", "200%", "x3"],
    scratchPrize: "100 FS",
    quizQuestion: "Кто выиграет матч?",
    quizAnswers: ["Хозяева", "Ничья", "Гости"],
    quizCorrect: 0,
    match3Moves: 8,
    ...over,
  };
}

async function htmlFor(id: string): Promise<string> {
  const item = PLAYABLE_CATALOG.find((i) => i.id === id);
  if (!item) throw new Error(`нет в каталоге: ${id}`);
  const t = item.target;
  if (t.kind === "scene") {
    const p = scenePreset(t.scene, "ru");
    return buildScenePlayable(
      {
        scene: t.scene,
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
  if (t.kind === "template") {
    const tpl = PLAYABLE_TEMPLATES.find((x) => x.id === t.templateId)!;
    return buildPlayableHtml(
      constructorInput(tpl.mechanic, {
        offer: tpl.offer,
        ctaText: tpl.ctaText,
        accent: tpl.accent,
        duration: tpl.duration,
        ...(tpl.reels ? { reels: tpl.reels } : {}),
        ...(tpl.wheelPrizes ? { wheelPrizes: tpl.wheelPrizes } : {}),
        ...(tpl.scratchPrize !== undefined ? { scratchPrize: tpl.scratchPrize } : {}),
        ...(tpl.quizQuestion !== undefined ? { quizQuestion: tpl.quizQuestion } : {}),
        ...(tpl.quizAnswers ? { quizAnswers: tpl.quizAnswers } : {}),
        ...(tpl.quizCorrect !== undefined ? { quizCorrect: tpl.quizCorrect } : {}),
        ...(tpl.match3Moves ? { match3Moves: tpl.match3Moves } : {}),
      }),
    );
  }
  return buildPlayableHtml(constructorInput(t.mechanic));
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
