// Проверка сценарных плейблов: каждая сцена × каждая сеть × каждый язык.
//
//   npx tsx scripts/scene-export-check.mts
//
// Что ловит: синтаксическую ошибку в core.js или скрипте сцены, не ту
// упаковку под сеть, лишние внешние запросы (сети их запрещают), побег из
// <script> через пользовательский текст, javascript:-ссылку в файле, пустые
// тексты в пресетах и перевес по лимиту сети с картинками от ИИ.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import JSZip from "jszip";

import { PLAYABLE_NETWORKS, type PlayableNetwork } from "../src/lib/scenes/networks";
import { packageFor } from "../src/lib/scenes/export";
import { buildScenePlayable, type SceneConfig, type SceneLoader } from "../src/lib/scenes/build";
import { DEFAULT_WIN_INDEX, SCENES, SCENE_LANGS, scenePreset } from "../src/lib/scenes/presets";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

const ROOT = join(import.meta.dirname, "..", "public");
const diskLoader: SceneLoader = {
  text: async (p) => readFileSync(join(ROOT, p), "utf8"),
  base64: async (p) => readFileSync(join(ROOT, p)).toString("base64"),
};

const fakeImage = (bytes: number, mime: string) => `data:${mime};base64,` + Buffer.alloc(bytes, 7).toString("base64");
// Фон после ужатия ≈ 250 КБ, награда ≈ 300 КБ PNG, лого ≈ 40 КБ.
const BG = fakeImage(250 * 1024, "image/jpeg");
const REWARD = fakeImage(300 * 1024, "image/png");
const LOGO = fakeImage(40 * 1024, "image/png");
const EVIL = "</script><script>alert(1)</script>";

/** Скрипты и внешние адреса в готовом файле. */
function scripts(html: string): string[] {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
function externalUrls(html: string): string[] {
  return [...html.matchAll(/\b(?:src|href)=["'](https?:[^"']+|[^"':]+\.js)["']/g)].map((m) => m[1]);
}

for (const meta of SCENES) {
  for (const lang of SCENE_LANGS) {
    const p = scenePreset(meta.id, lang.id);
    for (const f of meta.fields) {
      check(`${meta.id}/${lang.id}: текст «${f.key}» задан`, !!(p.text[f.key] ?? "").trim());
    }
    check(`${meta.id}/${lang.id}: юр. текст и единица`, !!p.legal.trim() && !!p.unit.trim());
    if (meta.id === "wheel") check(`${meta.id}/${lang.id}: сектора`, (p.prizes?.length ?? 0) > DEFAULT_WIN_INDEX);
  }

  for (const net of PLAYABLE_NETWORKS) {
    for (const preview of [false, true]) {
      const p = scenePreset(meta.id, "ru");
      const cfg: SceneConfig = {
        scene: meta.id,
        text: { ...p.text, title: `Заголовок ${EVIL}` },
        amount: 1500,
        unit: p.unit,
        locale: "ru-RU",
        clickUrl: "javascript:alert(1)",
        legal: p.legal,
        brandName: `Brand ${EVIL}`,
        logo: LOGO,
        bgImage: BG,
        reward: REWARD,
        prizes: p.prizes,
        winIndex: DEFAULT_WIN_INDEX,
        lang: "ru",
      };
      const tag = `${meta.id}/${net.id}${preview ? "/превью" : ""}`;
      const html = await buildScenePlayable(cfg, { network: net.id as PlayableNetwork, preview, load: diskLoader });

      const js = scripts(html);
      // config + core + сцена (+ exitapi у Google, он внешний и пустой)
      check(`${tag}: три встроенных скрипта`, js.filter((s) => s.trim()).length === 3, String(js.length));
      for (const [i, s] of js.entries()) {
        if (!s.trim()) continue;
        try {
          new Function(s);
          check(`${tag}: скрипт ${i} компилируется`, true);
        } catch (e) {
          check(`${tag}: скрипт ${i} компилируется`, false, String(e));
        }
      }
      check(`${tag}: текст не вырвался из <script>`, !html.includes("<script>alert(1)"));
      check(`${tag}: javascript:-ссылки нет`, !/javascript:alert/i.test(html));
      check(`${tag}: шрифт встроен`, (html.match(/data:font\/woff2;base64,/g) ?? []).length === 2);
      check(`${tag}: фон в CSS`, html.includes(`--img-bg:url("data:image/jpeg`));

      const ext = externalUrls(html);
      if (preview) {
        check(`${tag}: в превью нет сетевых скриптов`, ext.length === 0, ext.join(", "));
      } else if (net.id === "mraid") {
        check(`${tag}: только mraid.js`, ext.length === 1 && ext[0] === "mraid.js", ext.join(", "));
      } else if (net.id === "google") {
        check(`${tag}: размер Google`, html.includes('<meta name="ad.size" content="width=320,height=480"/>'));
        check(`${tag}: ориентация Google`, html.includes('<meta name="ad.orientation" content="portrait,landscape"/>'));
        check(`${tag}: только exitapi.js`, ext.length === 1 && ext[0].endsWith("/exitapi.js"), ext.join(", "));
      } else {
        // Meta и сайт: ни одного внешнего адреса, mraid.js под запретом.
        check(`${tag}: без внешних скриптов`, ext.length === 0, ext.join(", "));
        check(`${tag}: без mraid.js`, !html.includes("mraid.js"));
        if (net.id === "meta") check(`${tag}: кнопка знает FbPlayableAd`, html.includes("FbPlayableAd.onCTAClick"));
      }
      const bytes = Buffer.byteLength(html);
      check(`${tag}: вес под лимитом сети`, bytes < net.limit, `${(bytes / 1024 / 1024).toFixed(2)} МБ`);
    }
  }
}

// Без картинок сцена тоже собирается — и весит немного.
const bare = await buildScenePlayable(
  { scene: "safe", text: scenePreset("safe", "en").text, amount: 100, unit: "FS", locale: "en-US", clickUrl: "https://x.example", legal: "", brandName: "", logo: "", lang: "en" },
  { network: "mraid", preview: false, load: diskLoader },
);
check("без картинок: фон по умолчанию", !bare.includes("--img-bg:url"));
check("без картинок: < 400 КБ", Buffer.byteLength(bare) < 400 * 1024, `${Math.round(Buffer.byteLength(bare) / 1024)} КБ`);
check("ссылка в конфиге", bare.includes('"clickUrl":"https://x.example"'));

// ---- упаковка: по файлу на площадку, Meta тяжелее 2 МБ — ZIP по её правилам
{
  const p = scenePreset("wheel", "ru");
  const heavy = await buildScenePlayable(
    {
      scene: "wheel", text: p.text, amount: 500, unit: p.unit, locale: "ru-RU", clickUrl: "https://x.example", legal: p.legal,
      brandName: "B", logo: "", lang: "ru", prizes: p.prizes, winIndex: DEFAULT_WIN_INDEX,
      bgImage: fakeImage(900 * 1024, "image/webp"), reward: fakeImage(700 * 1024, "image/png"),
      art: { frame: { src: fakeImage(500 * 1024, "image/png"), inner: 0.84 }, pointer: fakeImage(120 * 1024, "image/png") },
    },
    { network: "meta", preview: false, load: diskLoader },
  );
  check("тяжёлый плейбл > 2 МБ (для проверки ZIP)", Buffer.byteLength(heavy) > 2 * 1024 * 1024);
  const pkg = await packageFor("meta", heavy, "pl", "Колесо");
  check("Meta > 2 МБ → ZIP", pkg.filename.endsWith("-meta.zip"), pkg.filename);
  const zip = await JSZip.loadAsync(await pkg.blob.arrayBuffer());
  const index = await zip.file("index.html")!.async("string");
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  check("Meta ZIP: index.html ≤ 2 МБ", Buffer.byteLength(index) <= 2 * 1024 * 1024, `${(Buffer.byteLength(index) / 1024 / 1024).toFixed(2)} МБ`);
  check("Meta ZIP: ≤ 100 файлов", names.length <= 100, String(names.length));
  check("Meta ZIP: ≤ 5 МБ", pkg.bytes <= 5 * 1024 * 1024);
  check("Meta ZIP: картинки отдельными файлами", names.some((n) => n.startsWith("assets/")) && index.includes('"assets/img'));
  check("Meta ZIP: фон по относительному пути", /--img-bg:url\("assets\/img\d+\.webp"\)/.test(index));

  const small = await buildScenePlayable(
    { scene: "safe", text: scenePreset("safe", "ru").text, amount: 1, unit: "FS", locale: "ru-RU", clickUrl: "https://x.example", legal: "", brandName: "", logo: "", lang: "ru" },
    { network: "meta", preview: false, load: diskLoader },
  );
  check("Meta ≤ 2 МБ → один HTML", (await packageFor("meta", small, "pl", "Сейф")).filename.endsWith("-meta.html"));
  check("MRAID → один HTML", (await packageFor("mraid", small, "pl", "Сейф")).filename.endsWith("-mraid.html"));
  const g = await packageFor("google", small, "pl", "Сейф");
  check("Google → ZIP с index.html", g.filename.endsWith("-google.zip") && !!(await JSZip.loadAsync(await g.blob.arrayBuffer())).file("index.html"));
  const w = await JSZip.loadAsync(await (await packageFor("web", small, "pl", "Сейф")).blob.arrayBuffer());
  check("Сайт → ZIP: index.html и инструкция с iframe", !!w.file("index.html") && (await w.file("README.txt")!.async("string")).includes("<iframe"));
}

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
