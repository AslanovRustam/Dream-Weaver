// Живые превью для каталогов: анимированный WebP на ~4 секунды — появление,
// подсказка, касание и первая реакция сцены. Каталог показывает его при
// наведении (или когда плитка на экране у телефона), в покое — обычный кадр.
//
//   npx tsx scripts/live-previews.mts                 — всё
//   npx tsx scripts/live-previews.mts scene-wheel     — только указанные id
//
// Плейблы → public/playable/previews/<id>.anim.webp (те же кадры служат и
// лендингам на сценах); механики лендингов → public/landing-previews/<id>.anim.webp.

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { defaultExtras } from "../src/lib/landingKit";
import { PLAYABLE_CATALOG } from "../src/lib/playableCatalog";
import { buildCrashHtml } from "../src/lib/crashExport";
import { buildMatchHtml } from "../src/lib/matchExport";
import { buildSlotHtml } from "../src/lib/slotExport";
import { buildWheelHtml } from "../src/lib/wheelExport";
import { buildScenePlayable, type SceneLoader } from "../src/lib/scenes/build";
import { DEFAULT_WIN_INDEX, scenePreset } from "../src/lib/scenes/presets";

const PLAYWRIGHT = "playwright";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = (await import(PLAYWRIGHT)) as { chromium: any };
const SHARP = "sharp";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharp = ((await import(SHARP)) as { default: any }).default;

const PUB = join(import.meta.dirname, "..", "public");
const diskLoader: SceneLoader = {
  text: async (p) => readFileSync(join(PUB, p), "utf8"),
  base64: async (p) => readFileSync(join(PUB, p)).toString("base64"),
};

type Job = { id: string; out: string; html: () => Promise<string>; tapAt: number };
const jobs: Job[] = [];

for (const item of PLAYABLE_CATALOG) {
  jobs.push({
    id: item.id,
    out: join(PUB, "playable", "previews", `${item.id}.anim.webp`),
    tapAt: 1200,
    html: () => {
      const p = scenePreset(item.scene, "ru");
      return buildScenePlayable(
        { scene: item.scene, text: p.text, amount: 500, unit: p.unit, locale: "ru-RU", clickUrl: "", legal: p.legal, brandName: "BRAND", logo: "", prizes: p.prizes, winIndex: DEFAULT_WIN_INDEX, lang: "ru" },
        { network: "web", preview: true, load: diskLoader },
      );
    },
  });
}

const base = { brand: "LUCKY", dark: true, ctaUrl: "", bgImage: "", charLeft: "", charRight: "" };
const casino = defaultExtras("ru", "casino");
const sport = defaultExtras("ru", "sport");
const mech: { id: string; html: () => string }[] = [
  { id: "gambling-wheel", html: () => buildWheelHtml({ ...base, accent: "#f97316", ctaText: "КРУТИТЬ", headline: "Крути и выигрывай", prizes: [{ label: "100 FS" }, { label: "x2" }, { label: "500 €" }, { label: "TRY" }, { label: "50 FS" }, { label: "BONUS" }], extras: casino }) },
  { id: "gambling-slot-machine", html: () => buildSlotHtml({ ...base, accent: "#818cf8", ctaText: "КРУТИТЬ", headline: "Лови три в ряд", symbols: [{ symbol: "🍒" }, { symbol: "⭐" }, { symbol: "7" }, { symbol: "💎" }, { symbol: "🔔" }, { symbol: "🍋" }], attempts: ["100 FS", "200 FS"], extras: casino }) },
  { id: "gambling-crash", html: () => buildCrashHtml({ ...base, accent: "#ef4444", ctaText: "ИГРАТЬ", headline: "Успей забрать!", maxAttempts: 2, extras: casino }) },
  {
    id: "betting-match",
    html: () =>
      buildMatchHtml({
        ...base, accent: "#16a34a", ctaText: "СДЕЛАТЬ СТАВКУ", headline: "Ставь на матч дня", teamHome: "Реал", teamAway: "Барселона", eventName: "Эль-Класико", sport: "football",
        odds: { home: 1.9, draw: 3.4, away: 4.1 }, oddsFormat: "decimal", highlightFavourite: true, showOffer: true, prizeType: "freebet", prizeAmount: "100", prizeCurrency: "€",
        offerText: "", countdownMode: "minutes", countdownMinutes: 15, countdownDate: "", extras: sport,
      }),
  },
];
for (const m of mech) jobs.push({ id: m.id, out: join(PUB, "landing-previews", `${m.id}.anim.webp`), tapAt: 1600, html: async () => m.html() });

const only = process.argv.slice(2);
const todo = jobs.filter((j) => !only.length || only.includes(j.id));
mkdirSync(join(PUB, "playable", "previews"), { recursive: true });

const W = 240; // ширина кадра в файле
const VIEW = { width: 360, height: 640 };
const TOTAL = 4200; // мс записи
const STEP = 90; // мс между кадрами (снимок сам занимает часть)

const browser = await chromium.launch();
for (const job of todo) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await page.setContent(await job.html(), { waitUntil: "load" });
  const shots: Buffer[] = [];
  const delays: number[] = [];
  const t0 = Date.now();
  let tapped = false;
  let last = t0;
  while (Date.now() - t0 < TOTAL) {
    if (!tapped && Date.now() - t0 >= job.tapAt) {
      tapped = true;
      // Касание по центру механики: колесо крутится, сцена реагирует.
      await page.mouse.click(VIEW.width / 2, VIEW.height * 0.48).catch(() => {});
    }
    // Сжатие — после записи: в цикле только снимок, чтобы кадров было больше.
    shots.push(await page.screenshot({ type: "jpeg", quality: 90 }));
    const now = Date.now();
    if (shots.length > 1) delays.push(now - last);
    last = now;
    const wait = STEP - (Date.now() - now);
    if (wait > 0) await page.waitForTimeout(wait);
  }
  delays.push(1200); // последний кадр задерживается перед повтором
  const frames = await Promise.all(shots.map((b) => sharp(b).resize({ width: W }).ensureAlpha().raw().toBuffer() as Promise<Buffer>));
  const H = Math.round((VIEW.height * W) / VIEW.width);
  await sharp(Buffer.concat(frames), { raw: { width: W, height: H * frames.length, channels: 4, pageHeight: H } })
    .webp({ quality: 62, loop: 0, delay: delays.map((d) => Math.max(60, Math.min(400, d))), effort: 6 })
    .toFile(job.out);
  console.log(`✓ ${job.id}: ${frames.length} кадров, ${Math.round(statSync(job.out).size / 1024)} КБ`);
  await page.close();
}
await browser.close();
