// Куда пойдёт GIF — от этого зависит, как его собирать (src/lib/bannerGif.ts,
// анимация слоёв — src/lib/bannerLayers.ts). Пользователь выбирает сеть, а план
// подбирает сценарий анимации, частоту кадров, повторы и лимит веса так, чтобы и
// визуал был живой, и техтребования сети соблюдены.
//
// Google Ads (support.google.com/google-ads/answer/1722096): GIF до 150 КБ,
//   анимация до 30 с (повторять можно, но остановиться за 30 с), «медленнее
//   5 кадр/с» — каждый кадр дольше 200 мс. Плавное движение туда не проходит:
//   собираем кадры по очереди шагами (4 кадр/с, стоп-кадры одним длинным кадром).
// Сети с лимитом 150 КБ: ExoClick (лимит 150 КБ на баннеры с 2020 г.); у
//   TrafficStars, Adsterra, PropellerAds и др. публичных требований к GIF нет —
//   150 КБ как ориентир. Анимация свободная: плавно, вес подгоняем.
// Свободный вес: прямые размещения, сайты, партнёры — анимация как у дизайнеров.

export type GifNetworkId = "google" | "net150" | "free";

export type GifNetwork = {
  id: GifNetworkId;
  label: string;
  hint: string;
  /** Лимит веса, байт (Infinity — без лимита). */
  maxBytes: number;
  /** Сколько анимация может идти в сумме (все повторы), с; null — без ограничения. */
  maxSeconds: number | null;
  /** Кадр не короче, мс (Google: медленнее 5 кадр/с → дольше 200 мс). */
  minFrameMs: number;
  /** Что проверит площадка — коротко. */
  rules: string;
  /** Принимаемые размеры «WxH»; нет — любые. */
  sizes?: string[];
};

/** Размеры анимированных GIF в Google Ads (support.google.com/google-ads/answer/1722096). */
const GOOGLE_SIZES = [
  "200x200",
  "240x400",
  "250x250",
  "250x360",
  "300x250",
  "336x280",
  "580x400",
  "120x600",
  "160x600",
  "300x600",
  "300x1050",
  "468x60",
  "728x90",
  "930x180",
  "970x90",
  "970x250",
  "980x120",
  "300x50",
  "320x50",
  "320x100",
];

const KB = 1024;

export const GIF_NETWORKS: GifNetwork[] = [
  {
    id: "google",
    label: "Google Ads",
    hint: "КМС / Display",
    maxBytes: 150 * KB,
    maxSeconds: 30,
    minFrameMs: 210,
    rules:
      "До 150 КБ, анимация до 30 с (с повторами), медленнее 5 кадр/с, размер из списка Google.",
    sizes: GOOGLE_SIZES,
  },
  {
    id: "net150",
    label: "Сети 150 КБ",
    hint: "ExoClick, TrafficStars, Adsterra, PropellerAds…",
    maxBytes: 150 * KB,
    maxSeconds: null,
    minFrameMs: 0,
    rules: "До 150 КБ (ExoClick — требование, у остальных — ориентир), анимация свободная.",
  },
  {
    id: "free",
    label: "Свободный вес",
    hint: "Прямые размещения, сайты, партнёры",
    maxBytes: Infinity,
    maxSeconds: null,
    minFrameMs: 0,
    rules: "Без ограничений — максимум движения, как у дизайнеров.",
  },
];

export const GIF_NETWORK_BY_ID = new Map(GIF_NETWORKS.map((n) => [n.id, n]));

/** scene — элементы влетают; light — двигаются кнопка/блик; slides — кадры по очереди; flat — блик поверх картинки. */
export type GifMode = "scene" | "light" | "slides" | "flat";

export type GifPlan = {
  mode: GifMode;
  /** Ступени подгонки веса (частота, цвета). */
  ladder: { fps: number; colors: number }[];
  maxBytes: number;
  /** Почему так — одной строкой для интерфейса. */
  why: string;
};

/** Мелкий формат: всё сразу не помещается — текст читается только по кадрам. */
export const isSmallFormat = (w: number, h: number) =>
  w / h >= 3.2 ? h <= 60 : h / w >= 2.2 ? w <= 160 : w * h <= 240 * 240;

const SMOOTH = [
  { fps: 15, colors: 256 },
  { fps: 15, colors: 128 },
  { fps: 12.5, colors: 128 },
  { fps: 10, colors: 128 },
  { fps: 10, colors: 64 },
];
const FLAT = [
  { fps: 12.5, colors: 256 },
  { fps: 12.5, colors: 128 },
  { fps: 10, colors: 128 },
  { fps: 10, colors: 64 },
  { fps: 8, colors: 64 },
  { fps: 8, colors: 32 },
];
/** Google: 4 кадр/с (кадр 250 мс) — с запасом медленнее 5 кадр/с. */
const STEPS = [
  { fps: 4, colors: 256 },
  { fps: 4, colors: 128 },
  { fps: 4, colors: 64 },
  { fps: 4, colors: 32 },
];

/** Ступени частоты/цветов: у Google — только шаги (сеть проверяет fps), иначе по режиму. */
export function ladderFor(net: GifNetwork, mode: GifMode) {
  if (net.minFrameMs > 0) return STEPS;
  return mode === "flat" ? FLAT : SMOOTH;
}

/**
 * Сценарий под сеть и формат. layered — баннер собран слоями (можно двигать элементы);
 * slides — сколько кадров «по очереди» есть (заголовок, оффер, доп-текст, лого).
 */
export function planGif(
  net: GifNetwork,
  f: { w: number; h: number; layered: boolean; slides: number },
): GifPlan {
  const small = isSmallFormat(f.w, f.h);
  const canSlides = f.layered && f.slides > 1;
  if (net.id === "google") {
    if (canSlides)
      return {
        mode: "slides",
        ladder: STEPS,
        maxBytes: net.maxBytes,
        why: "Google: медленнее 5 кадр/с — кадры сменяются шагами, без плавного движения.",
      };
    if (f.layered)
      return {
        mode: "light",
        ladder: STEPS,
        maxBytes: net.maxBytes,
        why: "Google: медленнее 5 кадр/с — кнопка и блик шагами.",
      };
    return {
      mode: "flat",
      ladder: STEPS,
      maxBytes: net.maxBytes,
      why: "Google: медленнее 5 кадр/с — блик и искры шагами.",
    };
  }
  if (!f.layered)
    return {
      mode: "flat",
      ladder: FLAT,
      maxBytes: net.maxBytes,
      why: "Баннер одной картинкой — блик и искры поверх.",
    };
  if (small && canSlides)
    return {
      mode: "slides",
      ladder: SMOOTH,
      maxBytes: net.maxBytes,
      why: "Мелкий формат: всё сразу не читается — показываем по кадрам.",
    };
  if (net.id === "net150")
    return {
      mode: "light",
      ladder: SMOOTH,
      maxBytes: net.maxBytes,
      why: "150 КБ: надписи стоят, двигаются кнопка, блик и искры.",
    };
  return {
    mode: "scene",
    ladder: SMOOTH,
    maxBytes: net.maxBytes,
    why: "Вес свободный: надписи влетают, оффер бьётся, кнопка выскакивает.",
  };
}

/** Повторы: у Google — сколько полных циклов влезает в 30 с; иначе — как выбрал пользователь (0 — бесконечно). */
export function playsFor(net: GifNetwork, loopSeconds: number, wanted: number): number {
  if (net.maxSeconds === null) return wanted;
  return Math.max(1, Math.floor(net.maxSeconds / Math.max(0.1, loopSeconds)));
}

export type GifCheck = { label: string; ok: boolean };

/** Соответствие готового GIF требованиям сети — для чек-листа в интерфейсе. */
export function checkGif(
  net: GifNetwork,
  g: { bytes: number; seconds: number; plays: number; minFrameMs: number; w?: number; h?: number },
): GifCheck[] {
  const out: GifCheck[] = [];
  if (net.sizes && g.w && g.h) {
    const okSize = net.sizes.includes(`${g.w}x${g.h}`);
    out.push({
      label: okSize
        ? `Размер ${g.w}×${g.h} — из списка сети`
        : `Размер ${g.w}×${g.h} — сеть такой не принимает`,
      ok: okSize,
    });
  }
  const kb = Math.round(g.bytes / KB);
  out.push(
    net.maxBytes === Infinity
      ? { label: `Вес ${kb} КБ — без лимита`, ok: true }
      : {
          label: `Вес ${kb} КБ из ${Math.round(net.maxBytes / KB)} КБ`,
          ok: g.bytes <= net.maxBytes,
        },
  );
  if (net.maxSeconds !== null) {
    const total = g.plays <= 0 ? Infinity : g.seconds * g.plays;
    out.push({
      label:
        total === Infinity
          ? "Повторы бесконечные — больше 30 с"
          : `Анимация ${total.toFixed(1)} с из ${net.maxSeconds} с`,
      ok: total <= net.maxSeconds,
    });
  }
  if (net.minFrameMs > 0)
    out.push({
      label: `Кадр от ${g.minFrameMs} мс (${(1000 / Math.max(1, g.minFrameMs)).toFixed(1)} кадр/с, нужно < 5)`,
      ok: g.minFrameMs >= net.minFrameMs,
    });
  return out;
}

/** Размеры GIF-генератора: дисплейные (все есть у Google) + соцсети и нативка. */
export const GIF_SIZE_GROUPS: { title: string; sizes: string[] }[] = [
  {
    title: "Дисплей",
    sizes: ["300x250", "336x280", "300x600", "160x600", "120x600", "300x1050", "728x90", "970x90", "970x250", "468x60", "320x50", "320x100", "300x50", "580x400"],
  },
  { title: "Соцсети и нативка", sizes: ["1200x628", "1080x1080", "1080x1350"] },
];

/** Что отмечено по умолчанию — самые ходовые дисплейные. */
export const GIF_DEFAULT_SIZES = ["300x250", "336x280", "728x90", "160x600", "300x600", "320x50"];
