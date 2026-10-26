// Проверка выгрузки лендингов-механик (колесо, слот, краш, матч) с общими
// блоками landingKit: язык, юр. текст, трекинг, блоки под первым экраном.
//
//   npx tsx scripts/landing-export-check.mts
//
// Статика: скрипты компилируются, lang и тексты окон на языке лендинга,
// 18+ на первом экране и в подвале, блоки включаются и выключаются, пиксели
// только при корректных ID, пользовательский текст не ломает разметку,
// javascript:-ссылки вычищены. Поведение (headless Chromium): кнопка уводит
// на оффер, докидывая параметры адреса лендинга (subid), и шлёт события.

import { buildCrashHtml } from "../src/lib/crashExport";
import { defaultExtras, LANDING_LANGS, landingStrings, type LandingExtras, type LandingLang } from "../src/lib/landingKit";
import { buildMatchHtml } from "../src/lib/matchExport";
import { buildSlotHtml } from "../src/lib/slotExport";
import { buildWheelHtml } from "../src/lib/wheelExport";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

const EVIL = "</script><script>alert(1)</script><b>";
const base = { brand: "Brand", headline: "Head", accent: "#22c55e", dark: true, ctaText: "Go", bgImage: "", charLeft: "", charRight: "" };

type Builder = (x: LandingExtras, url: string) => string;
const MECHANICS: { id: string; kind: "casino" | "sport"; build: Builder }[] = [
  { id: "wheel", kind: "casino", build: (x, url) => buildWheelHtml({ ...base, ctaUrl: url, prizes: [{ label: "100 FS" }, { label: "x2" }], extras: x }) },
  { id: "slot", kind: "casino", build: (x, url) => buildSlotHtml({ ...base, ctaUrl: url, symbols: [{ symbol: "🍒" }, { symbol: "⭐" }, { symbol: "7" }], attempts: ["100 FS"], extras: x }) },
  { id: "crash", kind: "casino", build: (x, url) => buildCrashHtml({ ...base, ctaUrl: url, maxAttempts: 2, extras: x }) },
  {
    id: "match", kind: "sport",
    build: (x, url) =>
      buildMatchHtml({
        ...base, ctaUrl: url, teamHome: "", teamAway: "", eventName: "", sport: "football", odds: { home: 1.9, draw: 3.2, away: 4.1 },
        oddsFormat: "decimal", highlightFavourite: true, showOffer: true, prizeType: "freebet", prizeAmount: "100", prizeCurrency: "€",
        offerText: "", countdownMode: "minutes", countdownMinutes: 15, countdownDate: "", extras: x,
      }),
  },
];

const scripts = (html: string) => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());

for (const m of MECHANICS) {
  for (const { id: lang } of LANDING_LANGS) {
    const x = defaultExtras(lang as LandingLang, m.kind);
    const html = m.build(x, "https://offer.example/go");
    const tag = `${m.id}/${lang}`;
    const S = landingStrings(lang as LandingLang);
    for (const [i, sc] of scripts(html).entries()) {
      try {
        new Function(sc);
        check(`${tag}: скрипт ${i} компилируется`, true);
      } catch (e) {
        check(`${tag}: скрипт ${i} компилируется`, false, String(e));
      }
    }
    check(`${tag}: lang`, html.includes(`<html lang="${lang}">`));
    check(`${tag}: 18+ на первом экране`, html.includes('class="exLegalLine"') && html.includes(x.legal.slice(0, 20)));
    check(`${tag}: подвал 18+`, html.includes('<div class="age">18+</div>'));
    check(`${tag}: тексты окна на языке`, html.includes(JSON.stringify(S.claim).slice(1, -1)));
    if (lang !== "en") check(`${tag}: нет зашитого английского`, !/Almost!|Claim bonus'|Jackpot!</.test(html));
    if (lang !== "ru") check(`${tag}: нет зашитого русского`, !/Осталось попыток|Забрал вовремя|Хозяева|Выберите исход/.test(html));
    check(`${tag}: карусель на 8 обложек`, html.includes("data-exgames") && (html.match(/class="gc"/g) ?? []).length === 8);
    check(`${tag}: блоки`, html.includes('class="bento"') && html.includes('class="trust"') && html.includes('class="steps"') && html.includes("data-exticker"));
    check(`${tag}: переход через __goCta`, html.includes("__goCta") && !/location\.href=u;/.test(html.replace(/__goCta[\s\S]*?\};/, "")));
    check(`${tag}: без пикселей — ни одного внешнего скрипта`, !/<script[^>]+src=/.test(html));
  }

  // блоки выключены — только подвал
  const off = defaultExtras("ru", m.kind);
  for (const k of ["bonuses", "games", "trust", "steps", "winners", "timer", "reviews", "faq"] as const) off[k].on = false;
  const bare = m.build(off, "");
  check(`${m.id}: карусель выключается`, !bare.includes('class="games"'));
  check(`${m.id}: блоки выключаются`, !bare.includes('class="bento"') && !bare.includes("<b data-extimer>") && !bare.includes('class="trust"') && bare.includes('<div class="age">18+</div>'));

  // первый экран: появление и линии
  check(`${m.id}: анимация появления по умолчанию`, bare.includes("classList.add('go-intro')") && bare.includes('class="goArt"'));
  check(`${m.id}: парящие объекты по умолчанию`, (bare.match(/class="goFl /g) ?? []).length === 7);
  const own = defaultExtras("ru", m.kind);
  own.look.floatImgs = ["data:image/png;base64,AAAA", "javascript:alert(1)"];
  const ownHtml = m.build(own, "");
  check(`${m.id}: свои объекты, мусор отброшен`, ownHtml.split('<img src="data:image/png;base64,AAAA"').length - 1 === 7 && !ownHtml.includes("javascript:alert"));
  const calm = defaultExtras("ru", m.kind);
  calm.look = { intro: false, lines: "off", style: "vivid", floaters: false };
  const calmHtml = m.build(calm, "");
  check(`${m.id}: появление, линии и объекты выключаются`, !calmHtml.includes('class="goFl') && !calmHtml.includes("classList.add('go-intro')") && !calmHtml.includes("animate(k,o)") && !calmHtml.includes('class="goArt"'));
  for (const lines of ["rays", "arcs"] as const) {
    const lx = defaultExtras("ru", m.kind);
    lx.look.lines = lines;
    check(`${m.id}: линии ${lines}`, m.build(lx, "").includes("data-draw"));
  }

  const prem = defaultExtras("ru", m.kind);
  prem.look.style = "premium";
  const premHtml = m.build(prem, "");
  check(`${m.id}: стиль «Премиум»`, premHtml.includes("-webkit-text-fill-color:currentColor") && !bare.includes("-webkit-text-fill-color:currentColor"));

  // пиксели и проверки ID
  const px = defaultExtras("ru", m.kind);
  px.tracking = { metaPixel: "1234567890", tiktokPixel: "CABCDEF1234567", gtm: "GTM-ABC123", passParams: true };
  const withPx = m.build(px, "https://offer.example/go");
  check(`${m.id}: Meta Pixel`, withPx.includes("fbq('init','1234567890')"));
  check(`${m.id}: TikTok Pixel`, withPx.includes("ttq.load('CABCDEF1234567')"));
  check(`${m.id}: GTM`, withPx.includes("'GTM-ABC123'"));
  const badPx = defaultExtras("ru", m.kind);
  badPx.tracking = { metaPixel: "1');alert(1);//", tiktokPixel: "<x>", gtm: "GTM-'x", passParams: true };
  const bad = m.build(badPx, "");
  check(`${m.id}: кривые ID пикселей отбрасываются`, !bad.includes("fbq('init'") && !bad.includes("ttq.load(") && !bad.includes("gtm.js"));

  // пользовательский текст не ломает разметку
  const ev = defaultExtras("ru", m.kind);
  ev.legal = EVIL;
  ev.bonuses.items[0].title = EVIL;
  ev.reviews.items[0].text = EVIL;
  ev.faq.items[0].q = EVIL;
  ev.winners.currency = EVIL;
  const evHtml = m.build(ev, "javascript:alert(1)");
  check(`${m.id}: текст не вырывается из разметки`, !evHtml.includes("<script>alert(1)") && evHtml.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;"));
  check(`${m.id}: javascript:-ссылки нет`, !/javascript:alert/i.test(evHtml));
}

// ---- готовые темы: фон проходит в CSS url() как есть, объекты темы — в выгрузке
{
  const { LANDING_THEMES, themeBackground } = await import("../src/lib/landingThemes");
  const { cssUrl } = await import("../src/lib/exportUtils");
  for (const t of LANDING_THEMES) {
    const bg = themeBackground(t.id);
    const svg = Buffer.from(bg.split(",")[1] ?? "", "base64").toString("utf8");
    check(`тема ${t.id}: фон — SVG, cssUrl его не режет`, bg.startsWith("data:image/svg+xml;base64,") && cssUrl(bg) === bg && svg.startsWith("<svg") && svg.endsWith("</svg>") && !svg.includes("NaN"));
    check(`тема ${t.id}: заголовок на 4 языках`, ["ru", "uk", "en", "es"].every((l) => !!t.headline[l as LandingLang]));
    const x = defaultExtras("ru", t.kind);
    x.look.floatTheme = t.id;
    const m = MECHANICS.find((mm) => mm.kind === t.kind)!;
    const html = m.build(x, "");
    check(`тема ${t.id}: объекты темы в выгрузке`, (html.match(/class="goFl /g) ?? []).length === 7 && !html.includes('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="url(#gf'));
  }
}

// ---- поведение в браузере: кнопка уводит на оффер с subid
const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };
const browser = await chromium.launch();
for (const m of MECHANICS) {
  const x = defaultExtras("uk", m.kind);
  const html = m.build(x, "https://offer.example/go?src=landing");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  await page.route("**/*", (route: { request: () => { url: () => string }; fulfill: (o: object) => void; abort: () => void }) => {
    const url = route.request().url();
    if (url.startsWith("https://landing.test/")) return route.fulfill({ contentType: "text/html", body: html });
    if (url.startsWith("https://offer.example/")) return route.fulfill({ contentType: "text/html", body: "<p>offer</p>" });
    return route.abort();
  });
  await page.goto("https://landing.test/?subid=777&click_id=abc");
  await page.waitForTimeout(400);
  const ticker = await page.evaluate(() => document.querySelector("[data-exticker]")?.children.length ?? 0);
  check(`${m.id}: лента выигрышей заполнена`, ticker >= 12, String(ticker));
  const timer = await page.evaluate(() => document.querySelector("[data-extimer]")?.textContent ?? "");
  check(`${m.id}: таймер идёт`, /^1[45]:\d\d$/.test(timer), timer);
  await page.click("[data-excta]", { force: true });
  await page.waitForURL(/offer\.example/, { timeout: 3000 }).catch(() => {});
  const dest = page.url();
  check(`${m.id}: кнопка ведёт на оффер`, dest.startsWith("https://offer.example/go"), dest);
  check(`${m.id}: subid и click_id докинуты, свои параметры целы`, /subid=777/.test(dest) && /click_id=abc/.test(dest) && /src=landing/.test(dest), dest);
  check(`${m.id}: без ошибок на странице`, errors.length === 0, errors.join("; "));
  await page.close();

  // карусель: перетаскивание крутит и не уводит, клик по обложке — уводит
  {
    const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const html3 = m.build(defaultExtras("ru", m.kind), "https://offer.example/go");
    await p3.route("**/*", (route: { request: () => { url: () => string }; fulfill: (o: object) => void; abort: () => void }) => {
      const url = route.request().url();
      if (url.startsWith("https://landing.test/")) return route.fulfill({ contentType: "text/html", body: html3 });
      if (url.startsWith("https://offer.example/")) return route.fulfill({ contentType: "text/html", body: "<p>offer</p>" });
      return route.abort();
    });
    await p3.goto("https://landing.test/");
    await p3.evaluate(`document.querySelector("[data-exgames]").scrollIntoView({ block: "center" })`);
    await p3.waitForTimeout(1200);
    const box = (await p3.evaluate(`(() => { const r = document.querySelector("[data-exgames]").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`)) as { x: number; y: number; w: number; h: number };
    const rot0 = await p3.evaluate(`getComputedStyle(document.querySelector("[data-exgames] .ring")).getPropertyValue("--rot")`);
    await p3.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await p3.mouse.down();
    await p3.mouse.move(box.x + box.w / 2 - 160, box.y + box.h / 2, { steps: 8 });
    await p3.mouse.up();
    await p3.waitForTimeout(500);
    const rot1 = await p3.evaluate(`getComputedStyle(document.querySelector("[data-exgames] .ring")).getPropertyValue("--rot")`);
    check(`${m.id}: карусель крутится перетаскиванием`, Math.abs(parseFloat(String(rot1)) - parseFloat(String(rot0))) > 30, `${rot0} → ${rot1}`);
    check(`${m.id}: перетаскивание не уводит на оффер`, p3.url().startsWith("https://landing.test/"), p3.url());
    // ближайшая к центру обложка лицом к нам (между обложками бывает зазор).
    // Карусель вращается сама, и точка, посчитанная за миг до клика, иногда
    // попадает в зазор — до трёх попыток с пересчётом точки.
    for (let attempt = 0; attempt < 3 && !p3.url().startsWith("https://offer.example/go"); attempt++) {
      const pt = (await p3.evaluate(`(() => {
        const g = document.querySelector("[data-exgames]").getBoundingClientRect(), cx = g.x + g.width / 2;
        let best = null;
        for (const c of document.querySelectorAll("[data-exgames] .gc")) {
          const r = c.getBoundingClientRect(), x = r.x + r.width / 2;
          if (!best || Math.abs(x - cx) < Math.abs(best.x - cx)) best = { x, y: r.y + r.height / 2 };
        }
        return best;
      })()`)) as { x: number; y: number };
      await p3.mouse.click(pt.x, pt.y);
      await p3.waitForURL(/offer.example/, { timeout: 2000 }).catch(() => {});
    }
    check(`${m.id}: клик по обложке — на оффер`, p3.url().startsWith("https://offer.example/go"), p3.url());
    await p3.close();
  }

  // появление: после старта всё видно, заголовок разбит на буквы, класс снят
  for (const reduce of [false, true]) {
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: reduce ? "reduce" : "no-preference" });
    const errs: string[] = [];
    p2.on("pageerror", (e: Error) => errs.push(String(e)));
    await p2.setContent(m.build(defaultExtras("ru", m.kind), ""));
    await p2.waitForTimeout(2600);
    // строкой: tsx оборачивает функции в __name, которого нет на странице
    const st = (await p2.evaluate(`(() => {
      const op = (s) => { const el = document.querySelector(s); return el ? Number(getComputedStyle(el).opacity) : 1; };
      const l = document.querySelectorAll(".stage h1 .gl");
      const h = document.querySelector(".stage h1");
      return {
        intro: document.documentElement.classList.contains("go-intro"),
        letters: l.length,
        h1: (h && (h.getAttribute("aria-label") || h.textContent)) || "",
        min: Math.min(op(".stage .top"), op(".stage h1"), op(".stage .wheelWrap, .stage .mid"), op(".stage .col>.cta")),
        lastLetter: l.length ? Number(getComputedStyle(l[l.length - 1]).opacity) : 1,
      };
    })()`)) as { intro: boolean; letters: number; h1: string; min: number; lastLetter: number };
    const tag = `${m.id}${reduce ? " (reduce-motion)" : ""}`;
    check(`${tag}: класс появления снят`, !st.intro);
    check(`${tag}: всё видно после появления`, st.min > 0.99 && st.lastLetter > 0.99, JSON.stringify(st));
    if (reduce) check(`${tag}: без начальных состояний`, st.letters === 0);
    else check(`${tag}: заголовок по буквам`, st.letters > 3 && st.h1.length > 3, JSON.stringify(st));
    // прокрутка: секции проявляются, цифры доверия доходят до заданных
    for (let y = 0; y < 12; y++) { await p2.mouse.wheel(0, 700); await p2.waitForTimeout(150); }
    await p2.waitForTimeout(1800);
    const rv = (await p2.evaluate(`(() => {
      const secs = Array.from(document.querySelectorAll(".ex .w > *"));
      const hidden = secs.filter((e) => Number(getComputedStyle(e).opacity) < 0.99).length;
      return { hidden, trust: Array.from(document.querySelectorAll(".ex .trust b")).map((b) => b.textContent) };
    })()`)) as { hidden: number; trust: string[] };
    check(`${tag}: после прокрутки все блоки видны`, rv.hidden === 0, JSON.stringify(rv));
    const want = defaultExtras("ru", m.kind).trust;
    check(`${tag}: цифры доверия дошли до конца`, JSON.stringify(rv.trust) === JSON.stringify([want.rating, want.players, want.payout]), JSON.stringify(rv.trust));
    check(`${tag}: без ошибок`, errs.length === 0, errs.join("; "));
    await p2.close();
  }
}
await browser.close();

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
