// Проверка лендингов на премиум-сценах: каждая сцена → страница с блоками.
//
//   npx tsx scripts/scene-landing-check.mts
//
// Статика: сцена встроена srcdoc целиком (её </script> не рвёт страницу),
// блоки и подвал 18+ на месте, тип блоков (казино/спорт) по сцене, своя
// анимация первого экрана выключена, в каталоге лендингов — шаблон на каждую
// сцену. Браузер (headless Chromium): сцена загрузилась в iframe и видит
// parent.__goCta (тот же источник), переход из сцены уводит на оффер с subid.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultExtras } from "../src/lib/landingKit";
import { LANDING_TEMPLATE_CATEGORIES } from "../src/lib/landingGen";
import { sceneLandingKind, wrapSceneLanding } from "../src/lib/sceneLanding";
import { buildScenePlayable, type SceneLoader } from "../src/lib/scenes/build";
import { SCENES, scenePreset } from "../src/lib/scenes/presets";

const ROOT = join(process.cwd(), "public");
const diskLoader: SceneLoader = {
  text: async (p) => readFileSync(join(ROOT, p), "utf8"),
  base64: async (p) => readFileSync(join(ROOT, p)).toString("base64"),
};

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

const OFFER = "https://offer.example/go";
const pages = new Map<string, string>();
const allTemplates = LANDING_TEMPLATE_CATEGORIES.flatMap((c) => c.templates);

for (const sc of SCENES) {
  const p = scenePreset(sc.id, "ru");
  const scene = await buildScenePlayable(
    { scene: sc.id, text: p.text, amount: 500, unit: p.unit, locale: "ru-RU", clickUrl: OFFER, legal: p.legal, brandName: "Brand", logo: "", prizes: p.prizes, lang: "ru" },
    { network: "web", preview: false, load: diskLoader },
  );
  const kind = sceneLandingKind(sc.id);
  const html = wrapSceneLanding(scene, { extras: defaultExtras("ru", kind), accent: "#f59e0b", ctaUrl: OFFER, kind, title: "Brand" });
  pages.set(sc.id, html);
  const tag = sc.id;
  const outer = html.replace(/srcdoc="[^"]*"/, 'srcdoc=""');
  check(`${tag}: сцена встроена srcdoc целиком`, html.includes("srcdoc=\"&lt;!DOCTYPE html&gt;") && !/srcdoc="[^"]*<\/script/i.test(html));
  check(`${tag}: в странице снаружи сцены нет её скриптов`, !outer.includes("PLAYABLE_CONFIG"));
  check(`${tag}: блоки и подвал 18+`, outer.includes('class="bento"') && outer.includes('<div class="age">18+</div>') && outer.includes('class="sceneMore"'));
  check(`${tag}: без анимации и объектов первого экрана`, !outer.includes("classList.add('go-intro')") && !outer.includes('class="goFl') && !outer.includes('class="goArt"'));
  check(`${tag}: карусель — ${kind === "sport" ? "матчи" : "игры"}`, kind === "sport" ? outer.includes("Real Madrid") : outer.includes("Golden Pharaoh"));
  const t = allTemplates.find((x) => x.scenePick === `scene-${sc.id}`);
  check(`${tag}: шаблон в каталоге лендингов`, !!t && t.interactive === "scene" && t.vertical === (kind === "sport" ? "sport" : "gambling") && t.preview === `/playable/previews/scene-${sc.id}.webp`);
}

const core = readFileSync(join(ROOT, "playable/core.js"), "utf8");
check("core.js: переход из сцены через parent.__goCta", core.includes("w.parent.__goCta(url)"));

// ---- в браузере
const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };
const browser = await chromium.launch();
for (const id of ["chests", "basket", "aviator"] as const) {
  const html = pages.get(id)!;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  await page.route("**/*", (route: { request: () => { url: () => string }; fulfill: (o: object) => void; abort: () => void }) => {
    const url = route.request().url();
    if (url.startsWith("https://landing.test/")) return route.fulfill({ contentType: "text/html", body: html });
    if (url.startsWith("https://offer.example/")) return route.fulfill({ contentType: "text/html", body: "<p>offer</p>" });
    return route.abort();
  });
  await page.goto("https://landing.test/?subid=42");
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f: { parentFrame: () => unknown }) => f.parentFrame());
  check(`${id}: сцена загрузилась в iframe`, !!frame && (await frame.evaluate(`!!document.getElementById("stage") && !document.getElementById("stage").classList.contains("loading")`)));
  check(`${id}: сцена видит parent.__goCta`, !!frame && (await frame.evaluate(`typeof parent.__goCta === "function"`)));
  const box = (await page.evaluate(`(() => { const r = document.querySelector(".sceneHero").getBoundingClientRect(); return { h: r.height, more: document.querySelector(".sceneMore").getBoundingClientRect().bottom }; })()`)) as { h: number; more: number };
  check(`${id}: полоса «к блокам» видна на первом экране`, box.more <= 844 && box.h > 600, JSON.stringify(box));
  // Тот же путь, что у кнопки попапа: core.js → AD.click(url) → parent.__goCta.
  await frame.evaluate(`parent.__goCta(${JSON.stringify(OFFER)})`);
  await page.waitForURL(/offer\.example/, { timeout: 3000 }).catch(() => {});
  check(`${id}: из сцены — на оффер с subid`, page.url().startsWith(OFFER) && page.url().includes("subid=42"), page.url());
  check(`${id}: без ошибок на странице`, errors.length === 0, errors.join("; "));
  await page.close();
}
await browser.close();

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
