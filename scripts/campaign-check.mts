// Проверка «Кампании» (src/lib/campaign.ts): один бриф → лендинг, плейбл,
// письмо, баннер и черновики редакторов.
//
//   npx tsx scripts/campaign-check.mts
//
// Для каждого типа трафика × механики лендинга × языка: файлы собираются,
// оффер, кнопка, ссылка и тема доходят до каждой части, у письма — цвет темы,
// черновики редакторов лежат в нужных ключах и ведут в нужный редактор.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { briefBanner, briefEditorDraft, briefEmail, briefLandingHtml, briefPlayableHtml, briefTheme, defaultBrief, type CampaignBrief, type CampaignLanding } from "../src/lib/campaign";
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
      check(`${tag}: объекты темы`, landing === "scene" || html.includes('class="goFl '));
    }
    const b: CampaignBrief = { ...defaultBrief(kind, lang), brand: "Lucky", link: LINK, offer: "MEGA OFFER 777" };
    const pl = await briefPlayableHtml(b, load, "mraid");
    check(`${kind}/${lang}: плейбл MRAID — ссылка и сумма`, pl.includes("mraid.js") && pl.includes("offer.example") && pl.includes(`"amount":${b.amount}`));
    const mail = buildEmailHtml(briefEmail(b));
    check(`${kind}/${lang}: письмо — оффер, ссылка, цвет темы`, mail.includes("MEGA OFFER 777") && mail.includes("offer.example") && mail.toLowerCase().includes(briefTheme(b).accent.toLowerCase()));
    const ban = briefBanner(b);
    check(`${kind}/${lang}: баннер — пресет и промпт`, ban.preset === (kind === "sport" ? "preset4" : "preset1") && ban.prompt.includes("MEGA OFFER 777"));
  }
}

// черновики редакторов
const casino: CampaignBrief = { ...defaultBrief("casino", "en"), brand: "Lucky", link: LINK, landing: "slot" };
const slot = briefEditorDraft(casino, "landing");
check("слот → /slot, ключ dw_slot_draft", slot.route === "/slot" && slot.writes[0][0] === "dw_slot_draft");
const sd = slot.writes[0][1] as Record<string, unknown>;
check("черновик слота: ссылка, заголовок темы, фон, язык блоков", sd.ctaUrl === LINK && sd.headline === "HALLOWEEN BONUS" && String(sd.bgImage).startsWith("data:image/svg+xml") && (sd.extras as { lang: string }).lang === "en");
const sceneLanding = briefEditorDraft({ ...casino, landing: "scene", scene: "mines" }, "landing");
check("лендинг на сцене → /landing/scene, ключ _landing", sceneLanding.route === "/landing/scene?pick=scene-mines" && sceneLanding.writes[0][0] === "dw_scene_draft_mines_landing");
const play = briefEditorDraft({ ...casino, scene: "cases" }, "playable");
check("плейбл → /playable, свой ключ", play.route === "/playable?pick=scene-cases" && play.writes[0][0] === "dw_scene_draft_cases");
const match = briefEditorDraft({ ...defaultBrief("sport", "ru"), link: LINK }, "landing");
check("матч → /match, фрибет из брифа", match.route === "/match" && (match.writes[0][1] as { prizeAmount: string }).prizeAmount === "100");

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
