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

import { PLAYABLE_NETWORKS, type PlayableNetwork } from "../src/lib/scenes/networks";
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
      } else {
        check(`${tag}: размер Google`, html.includes('<meta name="ad.size" content="width=320,height=480"/>'));
        check(`${tag}: только exitapi.js`, ext.length === 1 && ext[0].endsWith("/exitapi.js"), ext.join(", "));
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

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
