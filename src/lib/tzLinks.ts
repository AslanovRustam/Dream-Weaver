// Ссылки из ТЗ — открываем до разбора, чтобы модель понимала, что за ними.
//
// В ТЗ пишут «сделать ленд под https://olymp-csn.com/uz» и «формат игры —
// https://www.crazygames.com/…/plinko»: по одному адресу не понять, где сайт
// оператора (бренд, лого), а где пример игры. Сервер открывает страницы
// (тем же безопасным fetch, что «Найти по сайту»: DoH, прокси для
// заблокированных) и берёт название сайта и заголовок; это идёт в подсказку
// разбора полей и подбора креативов. Лого потом тянет «Найти по сайту»
// с адреса, который модель выбрала как сайт оператора.
//
// Серверный модуль.

import { extractSiteName, nameFromHost } from "./brandExtract";
import { fetchPublicHtml } from "./safe-fetch";

export type TzLink = { url: string; name: string; title: string; description: string; ok: boolean };

const URL_RE = /\bhttps?:\/\/[^\s<>"'«»)\]]+|\b(?:www\.)?[a-z0-9][a-z0-9-]{1,62}\.(?:com|net|org|io|bet|casino|ru|ua|kz|uz|by|az|ge|am|pl|de|es|pt|it|fr|tr|in|br|mx|co|vip|top|club|win|app|online|site|xyz)(?:\/[^\s<>"'«»)\]]*)?/gi;

/** Адреса из текста ТЗ — без повторов и хвостовой пунктуации, не больше max. */
export function findTzLinks(text: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of text.match(URL_RE) ?? []) {
    const raw = m.replace(/[.,;:!?]+$/, "");
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let host = "";
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      continue;
    }
    if (!host || out.includes(url)) continue;
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

const pick = (html: string, re: RegExp) => (re.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

async function openLink(url: string, timeoutMs: number): Promise<TzLink> {
  const fallback: TzLink = { url, name: nameFromHost(url), title: "", description: "", ok: false };
  try {
    const { html, finalUrl } = await Promise.race([
      fetchPublicHtml(url),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    const head = html.slice(0, 60_000);
    const name = extractSiteName(html) || nameFromHost(finalUrl || url);
    return {
      url: finalUrl || url,
      name: decode(name).slice(0, 60),
      title: decode(pick(head, /<title[^>]*>([^<]{1,200})<\/title>/i)).slice(0, 140),
      description: decode(pick(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)).slice(0, 200),
      ok: true,
    };
  } catch {
    return fallback;
  }
}

/** Открыть ссылки ТЗ параллельно; недоступные — с названием из домена. */
export async function readTzLinks(text: string, timeoutMs = 8000): Promise<TzLink[]> {
  const urls = findTzLinks(text);
  return urls.length ? Promise.all(urls.map((u) => openLink(u, timeoutMs))) : [];
}

/** Блок для подсказки модели. */
export function tzLinksPrompt(links: TzLink[]): string {
  if (!links.length) return "";
  const rows = links.map((l) =>
    l.ok
      ? `- ${l.url} — сайт «${l.name}»${l.title ? `; заголовок страницы: «${l.title}»` : ""}${l.description ? `; описание: «${l.description}»` : ""}`
      : `- ${l.url} — открыть не удалось; по домену: «${l.name}»`,
  );
  return (
    "ССЫЛКИ ИЗ ТЗ (мы их открыли):\n" +
    rows.join("\n") +
    "\nСайт казино/букмекера — это бренд (его название — в brand, адрес — в site). Ссылки на игры, каталоги игр и референсы — не бренд."
  );
}
