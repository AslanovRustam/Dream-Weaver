// Скриншоты страниц из ТЗ — для сайтов, которые собираются скриптами (казино,
// букмекеры): без браузера у них в HTML пусто, видно только название и лого.
// Со скриншотом модель видит стиль, палитру, персонажей и текущие акции, а
// текст страницы берём уже отрисованный.
//
// Браузер — системный Chromium (puppeteer-core его не скачивает):
//   CHROME_PATH=/path/to/chromium — явный путь; иначе ищем chromium /
//   chromium-browser / google-chrome в PATH (на проде: NIXPACKS_PKGS=chromium),
//   на Windows — установленный Chrome. Нет браузера — скриншотов нет, всё
//   остальное работает как раньше. TZ_SCREENSHOTS=0 — выключить.
//
// Безопасность: страница не может достучаться до внутренней сети сервера —
// каждый её запрос (и редиректы) проверяется assertPublicHttpUrl, как обычные
// загрузки. Медиа и шрифты не грузим — быстрее и легче.
//
// Серверный модуль.
import { existsSync } from "node:fs";
import path from "node:path";

import { assertPublicHttpUrl, resolveHost } from "@/lib/safe-fetch";

export type Shot = { image: string; text: string; title: string };

const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT = 15_000;

let cachedPath: string | null | undefined;

/** Путь к браузеру или null — скриншоты недоступны. */
export function chromePath(): string | null {
  if (cachedPath !== undefined) return cachedPath;
  if (process.env.TZ_SCREENSHOTS === "0") return (cachedPath = null);
  const env = process.env.CHROME_PATH?.trim();
  if (env) return (cachedPath = existsSync(env) ? env : null);
  const names = process.platform === "win32" ? [] : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (existsSync(p)) return (cachedPath = p);
    }
  }
  if (process.platform === "win32") {
    for (const p of [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ])
      if (existsSync(p)) return (cachedPath = p);
  }
  return (cachedPath = null);
}

/** Прокси для сайтов, недоступных из страны сервера (как у safe-fetch). */
function proxy(): { server: string; username?: string; password?: string } | null {
  const raw = process.env.FETCH_PROXY_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { server: `${u.hostname}:${u.port || "80"}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined };
  } catch {
    return null;
  }
}

/**
 * Открыть браузер на время fn; shoot(url) — скриншот первого экрана и видимый
 * текст. Браузер закрывается в любом случае. Нет браузера — shoot всегда null.
 */
export async function withScreenshots<T>(urls: string[], fn: (shoot: (url: string) => Promise<Shot | null>) => Promise<T>): Promise<T> {
  const exe = chromePath();
  if (!exe || !urls.length) return fn(async () => null);
  const px = proxy();
  // Домены страниц резолвим через DoH, как safe-fetch: системный DNS провайдера
  // подменяет адреса казино-сайтов (блок-страница с чужим сертификатом).
  const rules: string[] = [];
  if (!px)
    await Promise.all(
      [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return ""; } }).filter(Boolean))].map(async (h) => {
        const ip = (await resolveHost(h).catch(() => []))[0];
        if (ip) for (const name of new Set([h, h.replace(/^www\./, ""), `www.${h.replace(/^www\./, "")}`])) rules.push(`MAP ${name} ${ip}`);
      }),
    );
  let browser: import("puppeteer-core").Browser | null = null;
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--mute-audio",
        ...(px ? [`--proxy-server=${px.server}`] : []),
        ...(rules.length ? [`--host-resolver-rules=${rules.join(", ")}`] : []),
      ],
    });
  } catch (e) {
    console.warn("[tz/screenshot] браузер не запустился:", e instanceof Error ? e.message : e);
    return fn(async () => null);
  }
  const hostOk = new Map<string, Promise<boolean>>();
  const allowed = (u: URL) => {
    let p = hostOk.get(u.host);
    if (!p) {
      p = assertPublicHttpUrl(u.toString()).then(
        () => true,
        () => false,
      );
      hostOk.set(u.host, p);
    }
    return p;
  };
  const shoot = async (url: string): Promise<Shot | null> => {
    const page = await browser!.newPage();
    try {
      if (px?.username) await page.authenticate({ username: px.username, password: px.password ?? "" });
      await page.setViewport(VIEWPORT);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        void (async () => {
          try {
            const u = new URL(req.url());
            if (u.protocol === "data:" || u.protocol === "blob:") return req.continue();
            if (u.protocol !== "http:" && u.protocol !== "https:") return req.abort();
            const t = req.resourceType();
            if (t === "media" || t === "font") return req.abort();
            return (await allowed(u)) ? req.continue() : req.abort();
          } catch {
            return req.abort().catch(() => {});
          }
        })();
      });
      await assertPublicHttpUrl(url);
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
      } catch {
        // Долгая догрузка (чаты, аналитика) — снимаем то, что уже отрисовалось.
      }
      await new Promise((r) => setTimeout(r, 1200));
      const [buf, text, title] = await Promise.all([
        page.screenshot({ type: "jpeg", quality: 72 }),
        page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+\n/g, "\n").slice(0, 3000)).catch(() => ""),
        page.title().catch(() => ""),
      ]);
      // Страница ошибки браузера (сертификат, DNS, недоступен) — не сайт.
      if (page.url().startsWith("chrome-error://") || /NET::ERR_|ERR_[A-Z_]{6,}/.test(text)) return null;
      const bytes = Buffer.from(buf);
      // Пустой экран (белый/чёрный ~ до 15 КБ) — не референс.
      if (bytes.length < 15_000 && !text.trim()) return null;
      return { image: `data:image/jpeg;base64,${bytes.toString("base64")}`, text, title };
    } catch {
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  };
  try {
    return await fn(shoot);
  } finally {
    await browser.close().catch(() => {});
  }
}
