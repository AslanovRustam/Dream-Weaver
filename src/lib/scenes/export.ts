// Упаковка готового плейбла под площадку: один выбранный пункт — один файл.
//
// MRAID и Meta принимают один HTML, Google и сайт — ZIP. Если HTML для Meta
// тяжелее 2 МБ, отдаём ZIP по правилам Meta: картинки выносятся из HTML в
// отдельные файлы рядом с index.html (тот остаётся ≤ 2 МБ), всего ≤ 5 МБ и
// не больше 100 файлов. Рантайм берёт картинки как обычные src/url(), так
// что относительный путь работает так же, как data:URL.

import JSZip from "jszip";

import { META_ZIP_LIMIT, NETWORK_BY_ID, type PlayableNetwork } from "./networks";

export type Packaged = {
  network: PlayableNetwork;
  filename: string;
  blob: Blob;
  /** Вес файла, который уйдёт на площадку. */
  bytes: number;
  /** Лимит площадки для этого вида файла. */
  limit: number;
  /** Что сказать пользователю, если файл не пройдёт или собран особым образом. */
  note?: string;
};

const MB = 1024 * 1024;
const bytesOf = (s: string) => new Blob([s]).size;

/** Картинки data:URL крупнее порога — в отдельные файлы. */
function externalizeImages(html: string, minBytes = 16 * 1024): { html: string; files: { name: string; data: string }[] } {
  const files: { name: string; data: string }[] = [];
  const seen = new Map<string, string>();
  const out = html.replace(/data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=]+)/g, (whole, type: string, b64: string) => {
    if (b64.length * 0.75 < minBytes) return whole;
    const known = seen.get(b64);
    if (known) return known;
    const ext = type === "jpeg" ? "jpg" : type === "svg+xml" ? "svg" : type;
    const name = `assets/img${files.length + 1}.${ext}`;
    files.push({ name, data: b64 });
    seen.set(b64, name);
    return name;
  });
  return { html: out, files };
}

function embedSnippet(title: string): string {
  return [
    `Плейбл «${title}» — встраивание на сайт`,
    "",
    "1. Распакуйте архив на свой хостинг, например в папку /playable/.",
    "2. Вставьте на страницу:",
    "",
    '<iframe src="/playable/index.html" title="' + title.replace(/"/g, "&quot;") + '"',
    '  style="width:100%;max-width:420px;aspect-ratio:9/16;border:0;border-radius:16px"',
    '  loading="lazy" allow="fullscreen"></iframe>',
    "",
    "Сцена сама подстраивается под размер: в узком блоке — вертикальная,",
    "в широком (например, aspect-ratio:16/9 и max-width:960px) — горизонтальная.",
    "Кнопка в плейбле открывает вашу ссылку в новой вкладке.",
    "",
  ].join("\n");
}

export async function packageFor(network: PlayableNetwork, html: string, base: string, title: string): Promise<Packaged> {
  const spec = NETWORK_BY_ID.get(network)!;
  const size = bytesOf(html);

  if (network === "mraid") {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    return { network, filename: `${base}-mraid.html`, blob, bytes: blob.size, limit: spec.limit };
  }

  if (network === "meta") {
    if (size <= spec.limit) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      return { network, filename: `${base}-meta.html`, blob, bytes: blob.size, limit: spec.limit };
    }
    const { html: light, files } = externalizeImages(html);
    const zip = new JSZip();
    zip.file("index.html", light);
    files.forEach((f) => zip.file(f.name, f.data, { base64: true }));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const indexBytes = bytesOf(light);
    const note =
      indexBytes > spec.limit
        ? `index.html ${(indexBytes / MB).toFixed(2)} МБ — Meta требует до 2 МБ`
        : files.length + 1 > 100
          ? "в архиве больше 100 файлов — Meta не примет"
          : "HTML тяжелее 2 МБ — собран ZIP: картинки отдельными файлами";
    return { network, filename: `${base}-meta.zip`, blob, bytes: blob.size, limit: META_ZIP_LIMIT, note };
  }

  const zip = new JSZip();
  zip.file("index.html", html);
  if (network === "web") zip.file("README.txt", embedSnippet(title));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { network, filename: `${base}-${network}.zip`, blob, bytes: blob.size, limit: spec.limit };
}
