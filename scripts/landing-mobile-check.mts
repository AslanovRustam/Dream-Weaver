// Мобайл-ферст: первый экран лендингов на телефонах 360×640, 390×844, 412×915.
//
//   npx tsx scripts/landing-mobile-check.mts
//
// Колесо, слот, crash, матч и сцена в промо-раскладке — с персонажем и без, длинный
// заголовок и длинный оффер, «сначала оффер» и «сначала игра». Проверяем в Chromium:
// нет горизонтальной прокрутки, текст первого экрана не вылезает за край, заголовок
// и начало оффера видны без прокрутки, шрифт не мельче 10 px. Без сети и кредитов
// (шрифты Google могут не загрузиться — берётся запасной, раскладка от этого не ломается).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { briefExtras, briefLandingHtml, defaultBrief, type CampaignBrief } from "../src/lib/campaign";
import { buildWheelHtml } from "../src/lib/wheelExport";
import { buildSlotHtml } from "../src/lib/slotExport";
import { buildCrashHtml } from "../src/lib/crashExport";
import { buildMatchHtml } from "../src/lib/matchExport";
import type { SceneLoader } from "../src/lib/scenes/build";

// Playwright — только для локальных скриптов (как в playable-previews.mts).
const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };

// --shots <папка>: сохранить скриншоты первого экрана (для глаз).
const SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : "";
const ROOT = join(import.meta.dirname, "..", "public");
const load: SceneLoader = { text: async (p) => readFileSync(join(ROOT, p), "utf8"), base64: async (p) => readFileSync(join(ROOT, p)).toString("base64") };

// Персонаж-заглушка: высокая фигура на прозрачном фоне, как у сгенерированных.
const CHAR =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><circle cx="300" cy="170" r="120" fill="#e9b17a"/><rect x="140" y="300" width="320" height="600" rx="120" fill="#7a2a2a"/><circle cx="470" cy="330" r="70" fill="#f5b324"/></svg>`,
  ).toString("base64");

type Case = { id: string; html: string; order: "offer" | "game" };
const cases: Case[] = [];

for (const order of ["offer", "game"] as const) {
  for (const withChar of [false, true]) {
    for (const long of [false, true]) {
      const tag = `${order}${withChar ? "+char" : ""}${long ? "+long" : ""}`;
      const b: CampaignBrief = {
        ...defaultBrief("casino", "ru"),
        brand: "Olymp",
        offer: long ? "+200% до 50 000 ₽ и 500 фриспинов" : "+200% и 500 фриспинов",
        cta: "Забрать бонус",
        link: "https://example.com",
      };
      const sb: CampaignBrief = { ...defaultBrief("sport", "ru"), brand: "Olymp", offer: long ? "Фрибет 5 000 ₽ на первый экспресс" : "Фрибет 500 ₽", cta: "Сделать ставку", link: "https://example.com" };
      const extras = (x: CampaignBrief) => {
        const e = briefExtras(x);
        return { ...e, look: { ...e.look, mobileOrder: order } };
      };
      const common = (x: CampaignBrief, headline: string, cta: string) => ({
        brand: "Olymp", brandLogo: "", headline, accent: "#f5b324", dark: true, ctaText: cta, ctaUrl: x.link, bgImage: "", charLeft: withChar ? CHAR : "", charRight: "", extras: extras(x),
      });
      const h = (s: string, l: string) => (long ? l : s);
      cases.push({ id: `wheel ${tag}`, order, html: buildWheelHtml({ ...common(b, h("Крути колесо", "Крути колесо удачи и забирай бонус"), "Крутить"), prizes: [{ label: "500 FS" }, { label: "x2" }, { label: "100 FS" }, { label: "TRY AGAIN" }] } as never) });
      cases.push({ id: `slot ${tag}`, order, html: buildSlotHtml({ ...common(b, h("Слот удачи", "Слот викингов: три попытки на бонус"), "Крутить"), symbols: ["🍒", "⭐", "7", "💎"].map((symbol) => ({ symbol })), attempts: ["+200%"] } as never) });
      cases.push({ id: `crash ${tag}`, order, html: buildCrashHtml({ ...common(b, h("Лови множитель", "Лови множитель и забирай выигрыш"), "Старт"), maxAttempts: 2 } as never) });
      cases.push({
        id: `match ${tag}`,
        order,
        html: buildMatchHtml({
          ...common(sb, h("Кто победит?", "Кто победит в финале кубка?"), "Сделать ставку"),
          sport: "football", eventName: "Финал кубка", teamHome: "Бавария", teamAway: "Тоттенхэм", odds: { home: 1.85, draw: 3.4, away: 4.2 }, oddsFormat: "decimal",
          highlightFavourite: true, showOffer: true, prizeType: "freebet", prizeAmount: "500", prizeCurrency: "₽", offerText: "за первую ставку", countdownMode: "minutes", countdownMinutes: 15, countdownDate: "",
        } as never),
      });
      if (!withChar) {
        const sc = { ...b, extras: extras(b), landing: "scene" as const, scene: "chests", headline: h("Открой сундук", "Открой сундук викингов и забери бонус") };
        cases.push({ id: `scene ${tag}`, order, html: await briefLandingHtml(sc as CampaignBrief, load) });
      }
    }
  }
}

const SIZES = [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
];

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => (cond ? pass++ : fails.push(msg));

const browser = await chromium.launch();
for (const s of SIZES) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // tsx оборачивает функции в __name — в странице его нет.
  await page.addInitScript("window.__name = (f) => f");
  // Шрифты Google — не ждём сеть.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r: { abort: () => unknown }) => r.abort());
  for (const c of cases) {
    const name = `${c.id} @${s.w}×${s.h}`;
    await page.setContent(c.html, { waitUntil: "load" });
    await page.waitForTimeout(150);
    await page.evaluate("window.__name = (f) => f");
    const m = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const hero = document.querySelector(".pHero");
      const out: string[] = [];
      let minFont = 99;
      if (hero) {
        for (const el of Array.from(hero.querySelectorAll<HTMLElement>(".pCopy *, .pAct *"))) {
          if (el.closest(".pStage")) continue;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
          if (!own) continue;
          minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
          if (b.right > vw + 1 || b.left < -1) out.push(`${el.className || el.tagName}: ${Math.round(b.left)}..${Math.round(b.right)}`);
        }
      }
      return {
        promo: !!hero,
        scrollX: document.documentElement.scrollWidth - vw,
        h1: r(".pCopy h1"),
        bonus: r(".pBonus"),
        vh,
        out,
        minFont,
      };
    });
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${c.id.replace(/[^\w]+/g, "_")}_${s.w}.png`) });
    if (!m.promo) {
      fails.push(`${name}: нет промо-раскладки`);
      continue;
    }
    ok(m.scrollX <= 1, `${name}: горизонтальная прокрутка ${m.scrollX}px`);
    ok(m.out.length === 0, `${name}: текст за краем — ${m.out.slice(0, 3).join("; ")}`);
    ok(m.minFont >= 10, `${name}: шрифт ${m.minFont}px`);
    if (c.order === "offer") {
      ok(!!m.h1 && m.h1.bottom <= m.vh, `${name}: заголовок не в первом экране (низ ${Math.round(m.h1?.bottom ?? -1)})`);
      ok(!!m.bonus && m.bonus.top + 20 <= m.vh, `${name}: оффер не начинается в первом экране (верх ${Math.round(m.bonus?.top ?? -1)})`);
    } else {
      ok(!!m.h1 && m.h1.top + 20 <= m.vh, `${name}: при «сначала игра» заголовок не выглядывает (верх ${Math.round(m.h1?.top ?? -1)})`);
    }
  }
  await page.close();
}
await browser.close();

if (fails.length) {
  console.log(fails.map((f) => "✗ " + f).join("\n"));
  console.log(`\n${fails.length} проблем, ${pass} проверок прошли`);
  process.exit(1);
}
console.log(`✓ все ${pass} проверок прошли (${cases.length} лендингов × ${SIZES.length} экрана)`);
