"use client";
// GIF из готового баннера (мастер или ресайз): эффекты кодом, без генераций —
// подробности в src/lib/bannerGif.ts. Превью — сам итоговый GIF, вес — как скачается.
// Сеть (src/lib/gifNetworks.ts) решает, как собирать: сценарий, частота кадров,
// повторы и лимит веса; под превью — чек-лист техтребований сети.
import { useEffect, useMemo, useState } from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import {
  imageSize,
  makeGifFromFrames,
  makeGifFromPixels,
  pixelsFromImage,
  type GifEffects,
} from "@/lib/bannerGif";
import {
  bannerFrames,
  bannerSlides,
  prepareBanner,
  type LayerSource,
  type SlideName,
} from "@/lib/bannerLayers";
import {
  GIF_NETWORKS,
  GIF_NETWORK_BY_ID,
  checkGif,
  ladderFor,
  planGif,
  playsFor,
  type GifCheck,
  type GifMode,
  type GifNetworkId,
} from "@/lib/gifNetworks";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  /** Точный размер (ресайз). Нет — мастер: уменьшаем с его пропорциями. */
  size?: { w: number; h: number };
  /** Тонкий формат, собранный слоями: можно анимировать сами элементы. */
  layers?: LayerSource;
};

const SIDES = [320, 480, 640];
const SLIDE_LABEL: Record<SlideName, string> = {
  headline: "заголовок",
  offer: "оффер",
  sub: "доп-текст",
  brand: "лого",
};
/** Длина цикла «Блика поверх», с (как в makeGifFromPixels). */
const FLAT_LOOP_S = 2.4;
const NET_KEY = "gengo.gif.network";
/** 1 показ, 3 показа, 7 показов. */
const showsWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? "показ"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? "показа"
      : "показов";

/** Хранилище не отдаёт CORS — для канваса удалённую картинку берём через свой сервер. */
const fetched = new Map<string, Promise<string>>();
function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:") || url.startsWith("blob:")) return Promise.resolve(url);
  let p = fetched.get(url);
  if (!p) {
    p = fetchDataUrl(url);
    p.catch(() => fetched.delete(url));
    fetched.set(url, p);
  }
  return p;
}
async function fetchDataUrl(url: string): Promise<string> {
  const res = await apiFetch("/api/fetch-master", { method: "POST", json: { url } });
  const data = (await res.json()) as { dataUrl?: string };
  if (!res.ok || !data.dataUrl) throw new Error("Не удалось забрать картинку");
  return data.dataUrl;
}

/** Последняя выбранная сеть — удобство на этом устройстве; без хранилища — Google. */
function savedNetwork(): GifNetworkId {
  try {
    const v = localStorage.getItem(NET_KEY);
    if (v && GIF_NETWORK_BY_ID.has(v as GifNetworkId)) return v as GifNetworkId;
  } catch {
    /* приватный режим */
  }
  return "google";
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`;

export function GifDialog({ open, onOpenChange, src, size, layers }: Props) {
  // Кадры по очереди — если есть что чередовать (заголовок, оффер, доп-текст, лого).
  const slideNames = useMemo(
    () =>
      layers
        ? bannerSlides({ ...layers.opts, logo: layers.opts.logoSrc ? { w: 1, h: 1 } : null }).map(
            (x) => x.name,
          )
        : [],
    [layers],
  );
  const canSlides = slideNames.length > 1;
  const [netId, setNetId] = useState<GifNetworkId>(savedNetwork);
  const net = GIF_NETWORK_BY_ID.get(netId)!;
  const [side, setSide] = useState(480);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(size ?? null);
  const plan = useMemo(
    () =>
      planGif(net, {
        w: dims?.w ?? size?.w ?? 300,
        h: dims?.h ?? size?.h ?? 250,
        layered: !!layers,
        slides: slideNames.length,
      }),
    [net, dims, size?.w, size?.h, layers, slideNames.length],
  );
  // Сценарий — по плану сети; пользователь может сменить, смена сети возвращает план.
  const [mode, setMode] = useState<GifMode>(plan.mode);
  useEffect(() => setMode(plan.mode), [plan.mode]);
  const [fx, setFx] = useState<GifEffects>({ shine: true, sparkles: true, zoom: false });
  const [wantPlays, setWantPlays] = useState(0);
  const [gif, setGif] = useState<{
    url: string;
    kb: number;
    fps: number;
    colors: number;
    checks: GifCheck[];
    plays: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Старый GIF освобождаем, когда его сменил новый (или окно закрыли), — не раньше:
  // иначе превью показывает отозванную ссылку.
  useEffect(() => () => void (gif && URL.revokeObjectURL(gif.url)), [gif]);

  const pickNet = (id: GifNetworkId) => {
    setNetId(id);
    try {
      localStorage.setItem(NET_KEY, id);
    } catch {
      /* приватный режим */
    }
  };

  // Размер: у ресайза — его; у мастера — длинная сторона = side.
  useEffect(() => {
    if (!open) return;
    // size приходит новым объектом на каждый рендер родителя — сравниваем числа,
    // иначе GIF пересобирается на любой рендер пакета.
    if (size)
      return setDims((d) => (d && d.w === size.w && d.h === size.h ? d : { w: size.w, h: size.h }));
    let off = false;
    imageSize(src)
      .then(({ w, h }) => {
        const k = side / Math.max(w, h);
        if (!off) setDims({ w: Math.round(w * k), h: Math.round(h * k) });
      })
      .catch(() => !off && toast.error("Не удалось открыть баннер"));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src, size?.w, size?.h, side]);

  useEffect(() => {
    if (!open || !dims) return;
    let off = false;
    setBusy(true);
    // Даём кадру отрисовать спиннер — кодирование идёт в основном потоке.
    const t = setTimeout(async () => {
      try {
        const ladder = ladderFor(net, mode);
        let r;
        let plays;
        if (mode !== "flat" && layers) {
          const b = await prepareBanner(
            dims.w,
            dims.h,
            layers.kind,
            await toDataUrl(layers.plate),
            layers.opts,
          );
          if (off) return;
          const style = mode === "light" ? "light" : mode === "slides" ? "slides" : "full";
          plays = playsFor(net, b.timing(style).loop, wantPlays);
          r = makeGifFromFrames((fps) => bannerFrames(b, fps, style), dims.w, dims.h, {
            plays,
            maxBytes: net.maxBytes,
            ladder,
          });
        } else {
          const px = await pixelsFromImage(await toDataUrl(src), dims.w, dims.h);
          if (off) return;
          plays = playsFor(net, FLAT_LOOP_S, wantPlays);
          r = makeGifFromPixels(px, dims.w, dims.h, {
            ...fx,
            seconds: FLAT_LOOP_S,
            plays,
            maxBytes: net.maxBytes,
            ladder,
          });
        }
        const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: "image/gif" }));
        if (off) return URL.revokeObjectURL(url);
        setGif({
          url,
          kb: r.bytes.length / 1024,
          fps: r.fps,
          colors: r.colors,
          plays,
          checks: checkGif(net, {
            bytes: r.bytes.length,
            seconds: r.seconds,
            plays,
            minFrameMs: r.minFrameMs,
            w: dims.w,
            h: dims.h,
          }),
        });
      } catch (e) {
        if (!off)
          toast.error("Не удалось собрать GIF", {
            description: e instanceof Error ? e.message : String(e),
          });
      } finally {
        if (!off) setBusy(false);
      }
    }, 40);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [open, src, dims, fx, wantPlays, mode, layers, net]);

  const none = mode === "flat" && !fx.shine && !fx.sparkles && !fx.zoom;
  const allOk = !!gif && gif.checks.every((c) => c.ok);
  const MODES: { id: GifMode; label: string; show: boolean }[] = [
    { id: "scene", label: "Элементы", show: !!layers },
    { id: "slides", label: "Кадры", show: canSlides },
    { id: "light", label: "Лёгкая", show: !!layers },
    { id: "flat", label: "Блик поверх", show: true },
  ];
  const modeNote: Record<GifMode, string> = {
    scene: "Надписи влетают по словам, оффер «бьётся», кнопка выскакивает, по ней бежит блик.",
    slides: `По очереди: ${slideNames.map((n) => SLIDE_LABEL[n]).join(" → ")}. Фон и кнопка стоят, меняется текст.`,
    light: "Надписи стоят; кнопка выскакивает и толкается, по ней бежит блик, мерцают искры.",
    flat: "Блик и искры поверх готовой картинки.",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-3xl overflow-y-auto border-border bg-popover p-0 text-foreground">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="ds-h4 text-left">
            GIF-баннер{dims ? ` · ${dims.w}×${dims.h}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_260px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="relative flex min-h-48 min-w-0 flex-1 items-center justify-center rounded-xl bg-black/40 p-3">
              {gif ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gif.url}
                  alt="GIF"
                  // Явная ширина: иначе во flex-контейнере полоса 728×90 ужимается до пары десятков px.
                  className="h-auto max-h-[60svh] max-w-full shrink-0 object-contain"
                  style={{ width: dims?.w, opacity: busy ? 0.5 : 1 }}
                />
              ) : null}
              {busy ? (
                <Loader2 className="absolute h-8 w-8 animate-spin text-accent-green" />
              ) : null}
            </div>
            {gif ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${allOk ? "bg-accent-green/10" : "bg-[color:var(--status-warning,#f59e0b)]/15"}`}
              >
                <div className="mb-1 font-semibold">
                  {allOk ? `Подходит для «${net.label}»` : `Не проходит требования «${net.label}»`}
                </div>
                <ul className="space-y-0.5">
                  {gif.checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5">
                      {c.ok ? (
                        <Check className="h-3.5 w-3.5 text-accent-green" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-[color:var(--status-error)]" />
                      )}
                      {c.label}
                    </li>
                  ))}
                </ul>
                <div className="ds-caption mt-1 text-muted-foreground">
                  {gif.fps} кадр/с · {gif.colors} цветов ·{" "}
                  {gif.plays > 0 ? `${gif.plays} ${showsWord(gif.plays)}` : "бесконечно"}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="ds-caption mb-2 text-muted-foreground">Куда пойдёт</div>
              <div className="flex flex-wrap gap-2">
                {GIF_NETWORKS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    title={n.hint}
                    className={chip(netId === n.id)}
                    onClick={() => pickNet(n.id)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              <p className="ds-caption mt-2 text-muted-foreground">
                {net.hint}. {net.rules}
              </p>
            </div>
            <div>
              <div className="ds-caption mb-2 text-muted-foreground">Анимация</div>
              <div className="flex flex-wrap gap-2">
                {MODES.filter((m) => m.show).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={chip(mode === m.id)}
                    onClick={() => setMode(m.id)}
                  >
                    {m.label}
                    {m.id === plan.mode ? " ★" : ""}
                  </button>
                ))}
              </div>
              <p className="ds-caption mt-2 text-muted-foreground">
                {modeNote[mode]} {mode === plan.mode ? `★ ${plan.why}` : ""}
              </p>
            </div>
            {mode === "flat" ? (
              <div>
                <div className="ds-caption mb-2 text-muted-foreground">Эффекты</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={chip(fx.shine)}
                    onClick={() => setFx({ ...fx, shine: !fx.shine })}
                  >
                    Блик
                  </button>
                  <button
                    type="button"
                    className={chip(fx.sparkles)}
                    onClick={() => setFx({ ...fx, sparkles: !fx.sparkles })}
                  >
                    Искры
                  </button>
                  <button
                    type="button"
                    className={chip(fx.zoom)}
                    onClick={() => setFx({ ...fx, zoom: !fx.zoom })}
                  >
                    Наезд
                  </button>
                </div>
                {fx.zoom ? (
                  <p className="ds-caption mt-2 text-muted-foreground">
                    Наезд меняет каждый пиксель — GIF станет в разы тяжелее.
                  </p>
                ) : null}
              </div>
            ) : null}
            {net.maxSeconds === null ? (
              <div>
                <div className="ds-caption mb-2 text-muted-foreground">Повторы</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={chip(wantPlays === 0)}
                    onClick={() => setWantPlays(0)}
                  >
                    Бесконечно
                  </button>
                  <button
                    type="button"
                    className={chip(wantPlays === 3)}
                    onClick={() => setWantPlays(3)}
                  >
                    3 раза
                  </button>
                </div>
              </div>
            ) : null}
            {!size ? (
              <div>
                <div className="ds-caption mb-2 text-muted-foreground">
                  Размер (длинная сторона)
                </div>
                <div className="flex flex-wrap gap-2">
                  {SIDES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={chip(side === s)}
                      onClick={() => setSide(s)}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <a
              href={gif && !none ? gif.url : undefined}
              download={dims ? `banner-${dims.w}x${dims.h}-${netId}.gif` : "banner.gif"}
              onClick={() => gif && toast.success("GIF скачан")}
              aria-disabled={!gif || busy || none}
              className={`ds-btn ds-btn-primary flex items-center justify-center gap-2 px-5 py-2.5 ${!gif || busy || none ? "pointer-events-none opacity-50" : ""}`}
            >
              <Download className="h-4 w-4" />
              Скачать GIF
            </a>
            {none ? (
              <p className="ds-caption text-muted-foreground">Включите хотя бы один эффект.</p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
