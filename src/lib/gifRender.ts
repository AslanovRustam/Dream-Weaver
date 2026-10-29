// Сборка одного GIF под сеть — общая для окна GIF и выгрузки «все GIF пакета ZIP».
// Слои есть — анимируем композицию (bannerLayers); нет — блик поверх картинки.
import { apiFetch } from "./api-client";
import {
  makeGifFromFrames,
  makeGifFromPixels,
  pixelsFromImage,
  type GifEffects,
} from "./bannerGif";
import { bannerFrames, bannerSlides, prepareBanner, type LayerSource } from "./bannerLayers";
import {
  checkGif,
  ladderFor,
  planGif,
  playsFor,
  type GifCheck,
  type GifMode,
  type GifNetwork,
} from "./gifNetworks";

/** Длина цикла «Блика поверх», с (как в makeGifFromPixels). */
export const FLAT_LOOP_S = 2.4;

/** Хранилище не отдаёт CORS — для канваса удалённую картинку берём через свой сервер. */
const fetched = new Map<string, Promise<string>>();
export function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:") || url.startsWith("blob:")) return Promise.resolve(url);
  let p = fetched.get(url);
  if (!p) {
    p = (async () => {
      const res = await apiFetch("/api/fetch-master", { method: "POST", json: { url } });
      const data = (await res.json()) as { dataUrl?: string };
      if (!res.ok || !data.dataUrl) throw new Error("Не удалось забрать картинку");
      return data.dataUrl;
    })();
    p.catch(() => fetched.delete(url));
    fetched.set(url, p);
  }
  return p;
}

/** Сколько кадров «по очереди» есть у слоёв (заголовок, оффер, доп-текст, лого). */
export const slidesOf = (layers?: LayerSource) =>
  layers
    ? bannerSlides({ ...layers.opts, logo: layers.opts.logoSrc ? { w: 1, h: 1 } : null }).map(
        (x) => x.name,
      )
    : [];

export type BuiltGif = {
  bytes: Uint8Array;
  fps: number;
  colors: number;
  plays: number;
  checks: GifCheck[];
};

/**
 * GIF размера w×h под сеть. mode не задан — по плану сети (planGif).
 * src — готовая картинка баннера (для «Блика поверх»).
 */
export async function buildGif(a: {
  net: GifNetwork;
  w: number;
  h: number;
  layers?: LayerSource;
  src?: string;
  mode?: GifMode;
  fx?: GifEffects;
  wantPlays?: number;
}): Promise<BuiltGif> {
  const { net, w, h, layers } = a;
  const mode =
    a.mode ?? planGif(net, { w, h, layered: !!layers, slides: slidesOf(layers).length }).mode;
  const ladder = ladderFor(net, mode);
  const wanted = a.wantPlays ?? 0;
  let r;
  let plays;
  if (mode !== "flat" && layers) {
    const b = await prepareBanner(w, h, layers.kind, await toDataUrl(layers.plate), layers.opts);
    const style = mode === "light" ? "light" : mode === "slides" ? "slides" : "full";
    plays = playsFor(net, b.timing(style).loop, wanted);
    r = makeGifFromFrames((fps) => bannerFrames(b, fps, style), w, h, {
      plays,
      maxBytes: net.maxBytes,
      ladder,
    });
  } else {
    if (!a.src) throw new Error("Нет картинки баннера");
    const px = await pixelsFromImage(await toDataUrl(a.src), w, h);
    plays = playsFor(net, FLAT_LOOP_S, wanted);
    r = makeGifFromPixels(px, w, h, {
      ...(a.fx ?? { shine: true, sparkles: true, zoom: false }),
      seconds: FLAT_LOOP_S,
      plays,
      maxBytes: net.maxBytes,
      ladder,
    });
  }
  return {
    bytes: r.bytes,
    fps: r.fps,
    colors: r.colors,
    plays,
    checks: checkGif(net, {
      bytes: r.bytes.length,
      seconds: r.seconds,
      plays,
      minFrameMs: r.minFrameMs,
      w,
      h,
    }),
  };
}
