// Движок ТЗ, шаг 1 — собрать из ТЗ ВСЁ, а не только текст.
//
// Источники: текст, файлы (.docx — текст и картинки внутри, .pdf — текст,
// .txt), приложенные картинки и ссылки из текста. Ссылку открываем и смотрим,
// что за ней: страница (название, описание, видимый текст, превью og:image и
// лого), прямая картинка (сразу в референсы), публичный Google Doc (его текст).
// Что открыть не удалось — помечаем, а не пропускаем молча: это попадёт в
// карточку «Как я понял ТЗ».
//
// Серверный модуль. Все внешние запросы — через safe-fetch (SSRF-защита, прокси
// для заблокированных сайтов).
import { extractLogoCandidates, extractSiteName, nameFromHost } from "@/lib/brandExtract";
import { fetchPublicHtml, fetchPublicImage, fetchPublicUrlFollowing } from "@/lib/safe-fetch";
import { sniffDocument } from "@/lib/request-guard";

export type TzImage = {
  id: string;
  /** data:image/… */
  src: string;
  /** Откуда: «вложение», «файл brief.docx», «og:image site.com», «ссылка …». */
  from: string;
};

export type TzLinkInfo = {
  url: string;
  ok: boolean;
  kind: "page" | "image" | "doc";
  name: string;
  title: string;
  description: string;
  /** Видимый текст страницы / документа (сокращён). */
  text: string;
  /** Почему не открылась. */
  error?: string;
};

export type TzSource = { kind: "text" | "file" | "image" | "link"; name: string; ok: boolean; note?: string };

export type TzBundle = { text: string; images: TzImage[]; links: TzLinkInfo[]; sources: TzSource[] };

export type TzInput = {
  text?: string;
  files?: { name: string; base64: string }[];
  /** Приложенные картинки — data URL. */
  images?: string[];
};

const MAX_TEXT = 30_000;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIN_IMAGE_BYTES = 6 * 1024; // иконки, пиксели, линии — не референсы
const MAX_LINKS = 6;
const LINK_TIMEOUT = 10_000;

const IMG_EXT = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;
const URL_RE =
  /\bhttps?:\/\/[^\s<>"'«»)\]]+|\b(?:www\.)?[a-z0-9][a-z0-9-]{1,62}\.(?:com|net|org|io|bet|casino|ru|ua|kz|uz|by|az|ge|am|pl|de|es|pt|it|fr|tr|in|br|mx|co|vip|top|club|win|app|online|site|xyz)(?:\/[^\s<>"'«»)\]]*)?/gi;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
const pick = (html: string, re: RegExp) => decode((re.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim());

/** Видимый текст страницы: без скриптов, стилей, навигации-разметки. */
function visibleText(html: string, max = 2500): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, max);
}

export function findLinks(text: string, max = MAX_LINKS): string[] {
  const out: string[] = [];
  for (const m of text.match(URL_RE) ?? []) {
    const raw = m.replace(/[.,;:!?]+$/, "");
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (!out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

const toDataUrl = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;
const okImage = (buf: Buffer, mime: string) =>
  /^image\/(png|jpeg|webp|gif)$/.test(mime) && buf.length >= MIN_IMAGE_BYTES && buf.length <= MAX_IMAGE_BYTES;

async function extractDocx(buf: Buffer): Promise<{ text: string; images: { buf: Buffer; mime: string; name: string }[] }> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const media = Object.values(zip.files).filter((f) => /^word\/media\/.+\.(png|jpe?g|webp|gif)$/i.test(f.name));
  const images = await Promise.all(
    media.map(async (f) => {
      const b = Buffer.from(await f.async("uint8array"));
      const ext = f.name.split(".").pop()!.toLowerCase();
      return { buf: b, mime: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`, name: f.name.split("/").pop()! };
    }),
  );
  return { text: value || "", images };
}

async function extractPdf(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const fontsDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: pathToFileURL(fontsDir).href,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: unknown) => (it && typeof it === "object" && "str" in it ? String((it as { str: string }).str) : "")).join(" ") + "\n";
    } catch {
      /* нечитаемая страница */
    }
  }
  return text;
}

/** Google Docs / Drive: публичный документ — его текст, публичный файл-картинка — картинку. */
function googleExport(url: string): { kind: "doc" | "image"; url: string } | null {
  const doc = /docs\.google\.com\/document\/d\/([\w-]+)/.exec(url);
  if (doc) return { kind: "doc", url: `https://docs.google.com/document/d/${doc[1]}/export?format=txt` };
  const file = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/.exec(url);
  if (file) return { kind: "image", url: `https://drive.google.com/uc?export=download&id=${file[1]}` };
  return null;
}

async function openLink(url: string): Promise<{ info: TzLinkInfo; images: TzImage[] }> {
  const base: TzLinkInfo = { url, ok: false, kind: "page", name: nameFromHost(url), title: "", description: "", text: "" };
  const g = googleExport(url);
  try {
    if (g?.kind === "doc") {
      const res = await withTimeout(fetchPublicUrlFollowing(g.url, 2 * 1024 * 1024), LINK_TIMEOUT);
      if (res.status !== 200) throw new Error(res.status === 401 || res.status === 403 ? "документ закрыт — нужен публичный доступ" : `ответ ${res.status}`);
      const text = res.body.toString("utf8");
      if (/<html/i.test(text.slice(0, 500))) throw new Error("документ закрыт — нужен публичный доступ");
      return { info: { ...base, ok: true, kind: "doc", name: "Google Doc", text: text.slice(0, 8000) }, images: [] };
    }
    if (g?.kind === "image" || IMG_EXT.test(url)) {
      const { buffer, mime } = await withTimeout(fetchPublicImage(g?.url ?? url), LINK_TIMEOUT);
      if (!okImage(buffer, mime)) throw new Error("не картинка или слишком большая");
      return {
        info: { ...base, ok: true, kind: "image", name: "картинка" },
        images: [{ id: "", src: toDataUrl(buffer, mime), from: `ссылка ${url}` }],
      };
    }
    const { html, finalUrl } = await withTimeout(fetchPublicHtml(url), LINK_TIMEOUT);
    const head = html.slice(0, 80_000);
    const info: TzLinkInfo = {
      ...base,
      url: finalUrl || url,
      ok: true,
      name: decode(extractSiteName(html) || nameFromHost(finalUrl || url)).slice(0, 60),
      title: pick(head, /<title[^>]*>([^<]{1,200})<\/title>/i).slice(0, 160),
      description: pick(head, /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']{1,400})["']/i).slice(0, 300),
      text: visibleText(html),
    };
    // Превью страницы и лого — референсы стиля и бренда.
    const imgs: TzImage[] = [];
    const og = pick(head, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const logo = extractLogoCandidates(html, finalUrl || url)[0]?.url;
    for (const [src, what] of [
      [og, "превью"],
      [logo, "лого"],
    ] as const) {
      if (!src) continue;
      try {
        const abs = new URL(src, finalUrl || url).toString();
        const { buffer, mime } = await withTimeout(fetchPublicImage(abs), LINK_TIMEOUT);
        if (okImage(buffer, mime) || (what === "лого" && /^image\/(png|jpeg|webp)$/.test(mime) && buffer.length <= MAX_IMAGE_BYTES))
          imgs.push({ id: "", src: toDataUrl(buffer, mime), from: `${what} ${info.name}` });
      } catch {
        /* картинка недоступна — страница всё равно прочитана */
      }
    }
    if (!info.text && !info.title) info.error = "страница пустая без скриптов — видно только название";
    return { info, images: imgs };
  } catch (e) {
    return { info: { ...base, error: e instanceof Error ? e.message : "не открылась" }, images: [] };
  }
}

export async function ingestTz(input: TzInput): Promise<TzBundle> {
  const sources: TzSource[] = [];
  const images: TzImage[] = [];
  const texts: string[] = [];
  const own = (input.text ?? "").trim();
  if (own) {
    texts.push(own);
    sources.push({ kind: "text", name: "текст", ok: true });
  }

  for (const f of input.files ?? []) {
    const name = String(f.name || "файл").slice(0, 120);
    try {
      const b64 = f.base64.includes(",") ? f.base64.split(",")[1] : f.base64;
      const buf = Buffer.from(b64, "base64");
      const kind = sniffDocument(buf);
      const lower = name.toLowerCase();
      if (lower.endsWith(".docx") && kind === "docx") {
        const d = await extractDocx(buf);
        texts.push(`[Файл ${name}]\n${d.text}`);
        const good = d.images.filter((i) => okImage(i.buf, i.mime));
        good.forEach((i) => images.push({ id: "", src: toDataUrl(i.buf, i.mime), from: `файл ${name}` }));
        sources.push({ kind: "file", name, ok: true, note: good.length ? `картинок внутри: ${good.length}` : undefined });
      } else if (lower.endsWith(".pdf") && kind === "pdf") {
        texts.push(`[Файл ${name}]\n${await extractPdf(buf)}`);
        sources.push({ kind: "file", name, ok: true, note: "картинки из PDF пока не берём — приложите их отдельно" });
      } else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
        const mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : lower.endsWith(".gif") ? "image/gif" : "image/jpeg";
        if (buf.length <= MAX_IMAGE_BYTES) images.push({ id: "", src: toDataUrl(buf, mime), from: `файл ${name}` });
        sources.push({ kind: "image", name, ok: buf.length <= MAX_IMAGE_BYTES, note: buf.length > MAX_IMAGE_BYTES ? "больше 4 МБ" : undefined });
      } else if (!kind) {
        texts.push(`[Файл ${name}]\n${new TextDecoder("utf-8", { fatal: true }).decode(buf)}`);
        sources.push({ kind: "file", name, ok: true });
      } else {
        sources.push({ kind: "file", name, ok: false, note: "формат не поддерживается — нужен .docx, .pdf, .txt или картинка" });
      }
    } catch {
      sources.push({ kind: "file", name, ok: false, note: "не удалось прочитать" });
    }
  }

  for (const src of input.images ?? []) {
    if (typeof src === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(src) && src.length < MAX_IMAGE_BYTES * 1.4) {
      images.push({ id: "", src, from: "вложение" });
      sources.push({ kind: "image", name: "картинка", ok: true });
    }
  }

  // Ссылки — из всего текста (и из файлов тоже), параллельно.
  const urls = findLinks(texts.join("\n"));
  const opened = await Promise.all(urls.map(openLink));
  const links = opened.map((o) => o.info);
  for (const o of opened) {
    images.push(...o.images);
    sources.push({ kind: "link", name: o.info.url, ok: o.info.ok, note: o.info.error });
    if (o.info.kind === "doc" && o.info.text) texts.push(`[Google Doc ${o.info.url}]\n${o.info.text}`);
  }

  // Картинки по порядку: вложения и файлы важнее превью сайтов.
  const kept = images.slice(0, MAX_IMAGES).map((im, i) => ({ ...im, id: `img${i + 1}` }));
  if (images.length > MAX_IMAGES) sources.push({ kind: "image", name: "картинки", ok: true, note: `взяли первые ${MAX_IMAGES} из ${images.length}` });

  return { text: texts.join("\n\n").replace(/\s+\n/g, "\n").trim().slice(0, MAX_TEXT), images: kept, links, sources };
}
