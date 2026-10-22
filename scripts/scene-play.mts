// Прогон сценарного плейбла в headless Chromium по шагам — для доводки сцен.
//
//   npx tsx scripts/scene-play.mts <scene> "<шаги>" [папка для снимков]
//
// Шаги через «;»: число — пауза в мс, после неё снимок; "js=<код>" — выполнить
// код на странице (например, нажать нужную карту); "tap" — нажатие
// в центр экрана; "tapX:Y" — нажатие в точку окна 360×640; "dragX:Y>X:Y" —
// протяжка пальцем (для скретча). Ошибки страницы печатаются в конце.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";


import { buildScenePlayable, type SceneId, type SceneLoader } from "../src/lib/scenes/build";
import { DEFAULT_WIN_INDEX, scenePreset } from "../src/lib/scenes/presets";
import { paletteFromHex, uiFromPalette, wheelFromPalette } from "../src/lib/imagePalette";

// Playwright — только для локальных скриптов, в зависимостях проекта его нет.
// Грузим по имени из переменной: проверка типов на сборке (Vercel) его не ищет.
const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };

const ROOT = join(import.meta.dirname, "..", "public");
const load: SceneLoader = {
  text: async (p) => readFileSync(join(ROOT, p), "utf8"),
  base64: async (p) => readFileSync(join(ROOT, p)).toString("base64"),
};

const scene = process.argv[2] as SceneId;
// "@путь" — шаги из файла, по одному на строку (удобно для длинных js=…).
const rawSteps = process.argv[3] || "1500";
const steps = rawSteps.startsWith("@")
  ? readFileSync(rawSteps.slice(1), "utf8").split(/\r?\n/).filter((l) => l.trim())
  : rawSteps.split(";");
const out = process.argv[4] || join(import.meta.dirname, "..", ".scene-shots");
mkdirSync(out, { recursive: true });

// ART=1 — подложить вместо ИИ-графики цветные заглушки (проверить, что сцена
// правильно встраивает картинки: символы, спрайты, детали).
async function stub(color: string, label: string, w = 256, h = 256): Promise<string> {
  const SHARP = "sharp";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharp = ((await import(SHARP)) as { default: any }).default;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="8" y="8" width="${w - 16}" height="${h - 16}" rx="40" fill="${color}" stroke="#fff" stroke-width="10"/>` +
    `<text x="50%" y="56%" font-size="${Math.round(h / 4)}" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}
const withArt = process.env.ART === "1";
const COLORS = ["#e8143c", "#1f8fe8", "#21c45a", "#ffbf2c", "#9a3ae8", "#ff6a1c"];
const symbols = withArt ? await Promise.all(COLORS.map((c, i) => stub(c, i === 0 ? "WIN" : String(i)))) : undefined;
const art = withArt
  ? Object.fromEntries(
      await Promise.all(
        ["door", "dial", "inside", "token", "case", "cup", "dart", "cone", "tile", "board", "gem", "keeper", "chest", "chestOpen", "plane", "ball", "cardBack", "coin", "pot", "bomb", "mascot", "pointer", "hub"].map(
          async (k, i) => [k, await stub(COLORS[i % COLORS.length], k.slice(0, 5), 320, 320)] as const,
        ),
      ),
    )
  : undefined;

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
    ...(withArt ? { art, symbols } : {}),
    // UI_COLOR=#2a6cff — гамма интерфейса из одного цвета, как пипеткой в студии.
    ...(process.env.UI_COLOR ? { ui: uiFromPalette(paletteFromHex(process.env.UI_COLOR)), palette: wheelFromPalette(paletteFromHex(process.env.UI_COLOR)) } : {}),
  },
  { network: "mraid", preview: true, load },
);

const browser = await chromium.launch();
// LAND=1 — горизонтальный экран 640×360 (координаты тапов — в нём же).
const land = process.env.LAND === "1";
const page = await browser.newPage({ viewport: land ? { width: 640, height: 360 } : { width: 360, height: 640 } });
const errors: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
await page.setContent(html, { waitUntil: "load" });

let n = 0;
for (const s of steps) {
  if (s.startsWith("js=")) await page.evaluate(s.slice(3));
  else if (s === "tap") await page.mouse.click(land ? 320 : 180, land ? 180 : 320);
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
