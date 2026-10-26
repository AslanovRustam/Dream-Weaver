// Проверка «Кампании» (src/lib/campaign.ts): один бриф → лендинг, плейбл,
// письмо, баннер и черновики редакторов.
//
//   npx tsx scripts/campaign-check.mts
//
// Для каждого типа трафика × механики лендинга × языка: файлы собираются,
// оффер, кнопка и ссылка доходят до каждой части, у письма — цвет кампании,
// черновики редакторов лежат в нужных ключах и ведут в нужный редактор.
// Язык без готовых текстов (de): перевод накладывается во всех частях.
// Гамма: пипетка доходит до лендинга, плейбла и письма; сцена рефа — в редакторы.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { briefAccent, briefBanner, briefEditorDraft, briefEmail, briefLandingHtml, briefPlayableHtml, briefSource, defaultBrief, type CampaignBrief, type CampaignLanding } from "../src/lib/campaign";
import { buildEmailHtml } from "../src/lib/emailExport";
import type { LandingKind, LandingLang } from "../src/lib/landingKit";
import type { SceneLoader } from "../src/lib/scenes/build";

const ROOT = join(process.cwd(), "public");
const load: SceneLoader = {
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

const LINK = "https://offer.example/go?src=camp";
const LANDINGS: Record<LandingKind, CampaignLanding[]> = { casino: ["wheel", "slot", "crash", "scene"], sport: ["match", "scene"] };

for (const kind of ["casino", "sport"] as LandingKind[]) {
  for (const lang of ["ru", "uk", "en", "es"] as LandingLang[]) {
    for (const landing of LANDINGS[kind]) {
      const b: CampaignBrief = { ...defaultBrief(kind, lang), brand: "Lucky<b>", link: LINK, landing, offer: "MEGA OFFER 777" };
      const tag = `${kind}/${lang}/${landing}`;
      const html = await briefLandingHtml(b, load);
      check(`${tag}: лендинг — язык и ссылка`, html.includes(`<html lang="${lang}">`) && html.includes("offer.example"));
      check(`${tag}: оффер в лендинге`, html.includes("MEGA OFFER 777"));
      check(`${tag}: бренд экранирован`, !html.includes("Lucky<b>"));
      check(`${tag}: парящие объекты`, landing === "scene" || html.includes('class="goFl '));
    }
    const b: CampaignBrief = { ...defaultBrief(kind, lang), brand: "Lucky", link: LINK, offer: "MEGA OFFER 777" };
    const pl = await briefPlayableHtml(b, load, "mraid");
    check(`${kind}/${lang}: плейбл MRAID — ссылка и сумма`, pl.includes("mraid.js") && pl.includes("offer.example") && pl.includes(`"amount":${b.amount}`));
    const mail = buildEmailHtml(briefEmail(b));
    check(`${kind}/${lang}: письмо — оффер, ссылка, цвет кампании`, mail.includes("MEGA OFFER 777") && mail.includes("offer.example") && mail.toLowerCase().includes(briefAccent(b).toLowerCase()));
    const ban = briefBanner(b);
    check(`${kind}/${lang}: баннер — пресет и промпт`, ban.preset === (kind === "sport" ? "preset4" : "preset1") && ban.prompt.includes("MEGA OFFER 777"));
  }
}

// черновики редакторов
const casino: CampaignBrief = { ...defaultBrief("casino", "en"), brand: "Lucky", link: LINK, landing: "slot" };
const slot = briefEditorDraft(casino, "landing");
check("слот → /slot, ключ dw_slot_draft", slot.route === "/slot" && slot.writes[0][0] === "dw_slot_draft");
const sd = slot.writes[0][1] as Record<string, unknown>;
check("черновик слота: ссылка, заголовок, фон, язык блоков", sd.ctaUrl === LINK && sd.headline === "CLAIM YOUR BONUS" && String(sd.bgImage).startsWith("data:image/svg+xml") && (sd.extras as { lang: string }).lang === "en");
const sceneLanding = briefEditorDraft({ ...casino, landing: "scene", scene: "mines" }, "landing");
check("лендинг на сцене → /landing/scene, ключ _landing", sceneLanding.route === "/landing/scene?pick=scene-mines" && sceneLanding.writes[0][0] === "dw_scene_draft_mines_landing");
const play = briefEditorDraft({ ...casino, scene: "cases" }, "playable");
check("плейбл → /playable, свой ключ", play.route === "/playable?pick=scene-cases" && play.writes[0][0] === "dw_scene_draft_cases");
const match = briefEditorDraft({ ...defaultBrief("sport", "ru"), link: LINK }, "landing");
check("матч → /match, фрибет из брифа", match.route === "/match" && (match.writes[0][1] as { prizeAmount: string }).prizeAmount === "100");

// ---- язык без готовых текстов: перевод по путям доходит до всех частей
{
  const de0: CampaignBrief = { ...defaultBrief("casino", "de"), brand: "Lucky", link: LINK, scene: "cases" };
  const src = briefSource(de0);
  const groups = ["brief.", "kit.", "extras.", "scene.", "email."];
  check("de: в переводе все части", groups.every((g) => Object.keys(src).some((k) => k.startsWith(g))), Object.keys(src).length + " ключей");
  check("de: игры и валюты не переводим", !Object.keys(src).some((k) => /games.items.d+.title|currency|payments/.test(k)));
  const enSrc = briefSource({ ...defaultBrief("casino", "en") });
  check("en: переводим только письмо", Object.keys(enSrc).length > 0 && Object.keys(enSrc).every((k) => k.startsWith("email.")));
  check("ru: переводить нечего", Object.keys(briefSource(defaultBrief("casino", "ru"))).length === 0);
  const fake = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, "DE·" + v]));
  const de: CampaignBrief = { ...de0, i18n: fake, offer: fake["brief.offer"], cta: fake["brief.cta"] };
  for (const landing of ["wheel", "scene"] as CampaignLanding[]) {
    const html = await briefLandingHtml({ ...de, landing }, load);
    check(`de/${landing}: <html lang="de">`, html.includes('<html lang="de">'));
    check(`de/${landing}: блоки переведены`, html.includes(fake["extras.bonuses.title"]) && html.includes(fake["extras.faq.title"]));
    check(`de/${landing}: подписи механики переведены`, landing === "scene" || html.includes(JSON.stringify(fake["kit.spinAgain"]).slice(1, -1)));
  }
  const pl = await briefPlayableHtml(de, load, "web");
  check("de: плейбл — тексты сцены и юр. строка", pl.includes(fake["scene.text.tap"]) && pl.includes(JSON.stringify(fake["scene.legal"]).slice(1, -1)) && pl.includes('lang="de"'));
  const mail = buildEmailHtml(briefEmail(de));
  check("de: письмо переведено, бренд на месте", mail.includes("DE·") && !mail.includes("BRAND"));
}

// ---- гамма и реф
{
  const blue: CampaignBrief = { ...defaultBrief("casino", "en"), link: LINK, pickColor: "#2a6cff", refScene: "neon city rooftop at night" };
  const acc = briefAccent(blue);
  check("пипетка: акцент синий", /^#[0-9a-f]{6}$/.test(acc) && parseInt(acc.slice(5, 7), 16) > parseInt(acc.slice(1, 3), 16), acc);
  check("пипетка: лендинг в цвете", (await briefLandingHtml(blue, load)).toLowerCase().includes(acc));
  check("пипетка: плейбл с гаммой", (await briefPlayableHtml(blue, load)).includes('"ui":{'));
  check("пипетка: письмо в цвете", buildEmailHtml(briefEmail(blue)).toLowerCase().includes(acc));
  check("реф: сцена — в промпт баннера", briefBanner(blue).prompt.includes("neon city rooftop"));
  const ed = briefEditorDraft({ ...blue, landing: "wheel" }, "landing").writes[0][1] as { theme?: string };
  const sc = briefEditorDraft(blue, "playable").writes[0][1] as { theme?: string; pickColor?: string };
  check("реф: сцена — темой в редакторы", ed.theme === "neon city rooftop at night" && sc.theme === "neon city rooftop at night" && sc.pickColor === "#2a6cff");
}

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
