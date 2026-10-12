// Прогон сценарного плейбла в headless Chromium по шагам — для доводки сцен.
//
//   npx tsx scripts/scene-play.mts <scene> "<шаги>" [папка для снимков]
//
// Шаги через запятую: число — пауза в мс, после неё снимок; "tap" — нажатие
// в центр экрана; "tapX:Y" — нажатие в точку окна 360×640; "dragX:Y>X:Y" —
// протяжка пальцем (для скретча). Ошибки страницы печатаются в конце.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { buildScenePlayable, type SceneId, type SceneLoader } from "../src/lib/scenes/build";
import { DEFAULT_WIN_INDEX, scenePreset } from "../src/lib/scenes/presets";

const ROOT = join(import.meta.dirname, "..", "public");
const load: SceneLoader = {
  text: async (p) => readFileSync(join(ROOT, p), "utf8"),
  base64: async (p) => readFileSync(join(ROOT, p)).toString("base64"),
};

const scene = process.argv[2] as SceneId;
const steps = (process.argv[3] || "1500").split(",");
const out = process.argv[4] || join(import.meta.dirname, "..", ".scene-shots");
mkdirSync(out, { recursive: true });

const p = scenePreset(scene, "ru");
const html = await buildScenePlayable(
  {
    scene,
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
  { network: "mraid", preview: true, load },
);

const browser = await chromium.launch();
// LAND=1 — горизонтальный экран 640×360 (координаты тапов — в нём же).
const land = process.env.LAND === "1";
const page = await browser.newPage({ viewport: land ? { width: 640, height: 360 } : { width: 360, height: 640 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setContent(html, { waitUntil: "load" });

let n = 0;
for (const s of steps) {
  if (s === "tap") await page.mouse.click(land ? 320 : 180, land ? 180 : 320);
  else if (s.startsWith("tap")) {
    const [x, y] = s.slice(3).split(":").map(Number);
    await page.mouse.click(x, y);
  } else if (s.startsWith("drag")) {
    const [a, b] = s.slice(4).split(">").map((pt) => pt.split(":").map(Number));
    await page.mouse.move(a[0], a[1]);
    await page.mouse.down();
    await page.mouse.move(b[0], b[1], { steps: 20 });
    await page.mouse.up();
  } else {
    await page.waitForTimeout(Number(s));
    await page.screenshot({ path: join(out, `${scene}${land ? "-land" : ""}-${n++}.png`) });
  }
}
console.log(errors.length ? "Ошибки страницы:\n" + errors.join("\n") : `ок, снимков: ${n}`);
await browser.close();
