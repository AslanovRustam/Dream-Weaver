// Сборка сценарного плейбла в один HTML-файл.
//
// Сценарий живёт статикой в public/playable: ядро (core.js/css), разметка,
// стили и хореография сценария, шрифт. Сборщик склеивает это с конфигом
// кампании и картинками в один файл без внешних запросов — сети их запрещают.
// Файлы подаёт загрузчик: в браузере — fetch, в проверочном скрипте — диск.

import { embedJson, safeCtaUrl } from "../exportUtils";
import type { PlayableNetwork } from "./networks";
import type { FrameArt } from "./art";
import type { UiPalette, WheelPalette } from "./presets";

export type SceneId = "safe" | "wheel" | "scratch" | "slot" | "chests" | "aviator" | "plinko" | "memory" | "catcher" | "basket" | "penalty" | "roulette" | "mines" | "cases" | "claw" | "darts" | "dice" | "cut" | "blast" | "match3" | "quiz";

export type SceneConfig = {
  scene: SceneId;
  /** Тексты сцены по ключам (title, tap, cta…). Перевод строки — \n. */
  text: Record<string, string>;
  amount: number;
  unit: string;
  /** Формат суммы в попапе: ru-RU, en-US, es-MX… */
  locale: string;
  clickUrl: string;
  legal: string;
  brandName: string;
  /** Лого (data URL). Пусто — название бренда градиентом. */
  logo: string;
  /** Фон от ИИ (data URL). Пусто — фирменный градиент сценария. */
  bgImage?: string;
  /** Награда в попапе от ИИ (data URL). Пусто — векторное золото. */
  reward?: string;
  /** Сектора колеса. */
  prizes?: string[];
  /** Индекс выигрышного сектора колеса. */
  winIndex?: number;
  /** Язык документа (lang у <html>). */
  lang: string;
  /**
   * Детали от ИИ (или загруженные): спрайты по ключам из SCENE_PARTS —
   * door, chest, plane, ball, pot… Рама колеса — объект с внутренним радиусом.
   */
  art?: { frame?: FrameArt } & Record<string, string | FrameArt | undefined>;
  /** Набор символов (слот, скретч, мемори, разрез, самоцветы); [0] — выигрышный. */
  symbols?: string[];
  /** Палитра нашего диска колеса под выбранный стиль. */
  palette?: WheelPalette;
  /** Цвета интерфейса: градиент заголовков, плашки. */
  ui?: UiPalette;
};

const isImg = (v: unknown): v is string => typeof v === "string" && /^data:image\//.test(v);

/** В файл — только картинки (data:image) под безопасными ключами. */
function cleanArt(art: SceneConfig["art"]): Record<string, string | FrameArt> {
  const out: Record<string, string | FrameArt> = {};
  if (!art) return out;
  for (const [key, v] of Object.entries(art)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(key) || !v) continue;
    if (key === "frame" && typeof v === "object" && isImg(v.src)) out.frame = { src: v.src, inner: Number(v.inner) || 0.82 };
    else if (isImg(v)) out[key] = v;
  }
  return out;
}

export type SceneLoader = {
  text: (path: string) => Promise<string>;
  base64: (path: string) => Promise<string>;
};

/** Золото в попапе по умолчанию — вектор, чтобы сцена работала и без ИИ. */
const REWARD_SVG =
  '<svg viewBox="0 0 420 300" aria-hidden="true"><defs>' +
  '<linearGradient id="rwT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset="1" stop-color="#f2bb4c"/></linearGradient>' +
  '<linearGradient id="rwF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0ad3e"/><stop offset="1" stop-color="#9c561a"/></linearGradient>' +
  '<radialGradient id="rwC" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffd35a"/><stop offset="1" stop-color="#a6561a"/></radialGradient>' +
  '<g id="rwB"><polygon points="22,0 132,0 154,24 0,24" fill="url(#rwT)"/><polygon points="0,24 154,24 144,64 10,64" fill="url(#rwF)"/><polygon points="28,6 124,6 138,20 16,20" fill="#fff" opacity=".35"/></g>' +
  "</defs>" +
  '<use href="#rwB" x="40" y="220"/><use href="#rwB" x="200" y="220"/><use href="#rwB" x="120" y="160"/>' +
  '<use href="#rwB" x="200" y="160"/><use href="#rwB" x="160" y="100"/>' +
  '<ellipse cx="60" cy="282" rx="40" ry="13" fill="url(#rwC)"/><ellipse cx="360" cy="276" rx="44" ry="14" fill="url(#rwC)"/><ellipse cx="345" cy="262" rx="40" ry="13" fill="url(#rwC)"/>' +
  "</svg>";

const POPUP =
  '<div id="popup" class="abs fill">' +
  '<div id="popDim" class="abs fill"></div>' +
  // Содержимое попапа свёрстано под 1080×1920; в горизонтали core.css
  // переносит его целиком в центр экрана.
  '<div id="popInner" class="abs">' +
  '<div id="popBox" class="abs"></div>' +
  '<div id="popRays" class="abs rays"></div>' +
  '<div id="popReward" class="abs">' + REWARD_SVG + "</div>" +
  '<div id="popText" class="abs gt" data-max="780"></div>' +
  '<div id="popBtn" class="abs"><span class="lbl"></span><i class="shine"></i></div>' +
  '<div id="popHand" class="abs hand"></div>' +
  "</div></div>";

function networkHead(network: PlayableNetwork, preview: boolean): string {
  if (preview) return "";
  if (network === "google") {
    // Полноэкранный мобильный размер Google; сцена сама перестраивается под
    // поворот, поэтому заявляем обе ориентации.
    return (
      '<meta name="ad.size" content="width=320,height=480"/>' +
      '<meta name="ad.orientation" content="portrait,landscape"/>' +
      '<script type="text/javascript" src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>'
    );
  }
  // Meta подкладывает FbPlayableAd сама и запрещает mraid.js и любые внешние
  // скрипты; на сайте сетевых скриптов нет вовсе.
  if (network === "meta" || network === "web") return "";
  // MRAID-контейнер подкладывает mraid.js сам; вне контейнера ссылка просто не загрузится.
  return '<script src="mraid.js"></script>';
}

/** В инлайн-скрипте не должно быть закрывающего тега — иначе браузер оборвёт его. */
function inlineScript(js: string, name: string): string {
  if (/<\/script/i.test(js)) throw new Error(`${name}: в скрипте есть </script>`);
  return `<script>\n${js}\n</script>`;
}

export async function buildScenePlayable(
  cfg: SceneConfig,
  opts: { network: PlayableNetwork; preview: boolean; load: SceneLoader },
): Promise<string> {
  const { load } = opts;
  const [coreCss, coreJs, sceneCss, sceneJs, sceneHtml, fontLatin, fontCyr] = await Promise.all([
    load.text("playable/core.css"),
    load.text("playable/core.js"),
    load.text(`playable/${cfg.scene}.css`),
    load.text(`playable/${cfg.scene}.js`),
    load.text(`playable/${cfg.scene}.html`),
    load.base64("playable/fonts/inter-latin.woff2"),
    load.base64("playable/fonts/inter-cyrillic.woff2"),
  ]);

  const fonts =
    `@font-face{font-family:"PInter";font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontLatin}) format("woff2");` +
    "unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}" +
    `@font-face{font-family:"PInter";font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontCyr}) format("woff2");` +
    "unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}";
  // Фон — через CSS-переменную: сценарий решает, где и как его показывать.
  const bg = cfg.bgImage && /^data:image\//.test(cfg.bgImage) ? `:root{--img-bg:url("${cfg.bgImage}")}` : "";

  // В конфиг файла — только то, что нужно рантайму, и ссылка без javascript:.
  const runtimeCfg = {
    text: cfg.text,
    amount: cfg.amount,
    unit: cfg.unit,
    locale: cfg.locale,
    clickUrl: safeCtaUrl(cfg.clickUrl),
    legal: cfg.legal,
    brandName: cfg.brandName,
    logo: cfg.logo && /^data:image\//.test(cfg.logo) ? cfg.logo : "",
    reward: cfg.reward && /^data:image\//.test(cfg.reward) ? cfg.reward : "",
    prizes: cfg.prizes ?? [],
    winIndex: cfg.winIndex ?? 0,
    art: cleanArt(cfg.art),
    symbols: (cfg.symbols ?? []).filter(isImg).slice(0, 8),
    palette: cfg.palette ?? null,
    ui: cfg.ui && Object.values(cfg.ui).every((c) => /^#[0-9a-fA-F]{3,8}$/.test(c)) ? cfg.ui : null,
  };

  const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(cfg.lang) ? cfg.lang : "ru";
  return (
    "<!DOCTYPE html>" +
    `<html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
    networkHead(opts.network, opts.preview) +
    `<style>${fonts}${coreCss}${sceneCss}${bg}</style></head><body>` +
    '<div id="stage" class="loading">' +
    '<div id="bg" class="abs"></div><div id="shadeTop" class="abs"></div><div id="shadeBot" class="abs"></div>' +
    sceneHtml +
    '<div id="logo" class="abs"></div>' +
    '<div id="fx" class="abs fill"></div><div id="flash" class="abs fill"></div>' +
    POPUP +
    '<div id="legal" class="abs"></div>' +
    "</div>" +
    `<script>window.PLAYABLE_CONFIG=${embedJson(runtimeCfg)};</script>` +
    inlineScript(coreJs, "core.js") +
    inlineScript(sceneJs, `${cfg.scene}.js`) +
    "</body></html>"
  );
}

/** Загрузчик для браузера: файлы сценария лежат в public/. */
export const browserLoader: SceneLoader = {
  text: async (path) => {
    const res = await fetch(`/${path}`);
    if (!res.ok) throw new Error(`Не удалось загрузить ${path}`);
    return res.text();
  },
  base64: async (path) => {
    const res = await fetch(`/${path}`);
    if (!res.ok) throw new Error(`Не удалось загрузить ${path}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};
