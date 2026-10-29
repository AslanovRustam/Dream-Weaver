"use client";
// GIF из готового баннера (мастер или ресайз): эффекты кодом, без генераций —
// подробности в src/lib/bannerGif.ts. Превью — сам итоговый GIF, вес — как скачается.
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import {
  GDN_GIF_LIMIT,
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

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`;

export function GifDialog({ open, onOpenChange, src, size, layers }: Props) {
  // «Сцена» — надписи и кнопка двигаются (есть слои); «Блик» — эффекты поверх картинки.
  // Кадры по очереди — если есть что чередовать (заголовок, оффер, доп-текст, лого);
  // на мелких размерах всё сразу не помещается — там они по умолчанию.
  const slideNames = layers
    ? bannerSlides({ ...layers.opts, logo: layers.opts.logoSrc ? { w: 1, h: 1 } : null }).map(
        (x) => x.name,
      )
    : [];
  const canSlides = slideNames.length > 1;
  const small = !!size && (size.w / size.h >= 3.2 ? size.h <= 60 : size.w <= 160);
  const [mode, setMode] = useState<"scene" | "light" | "slides" | "flat">(
    !layers ? "flat" : canSlides && small ? "slides" : "scene",
  );
  const [limit, setLimit] = useState(true);
  const [fx, setFx] = useState<GifEffects>({ shine: true, sparkles: true, zoom: false });
  const [plays, setPlays] = useState(3);
  const [side, setSide] = useState(480);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(size ?? null);
  const [gif, setGif] = useState<{
    url: string;
    kb: number;
    fps: number;
    colors: number;
    over: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Старый GIF освобождаем, когда его сменил новый (или окно закрыли), — не раньше:
  // иначе превью показывает отозванную ссылку.
  useEffect(() => () => void (gif && URL.revokeObjectURL(gif.url)), [gif]);

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
    let url = "";
    setBusy(true);
    // Даём кадру отрисовать спиннер — кодирование идёт в основном потоке.
    const t = setTimeout(async () => {
      try {
        const maxBytes = limit ? GDN_GIF_LIMIT : Infinity;
        let r;
        if (mode !== "flat" && layers) {
          const b = await prepareBanner(
            dims.w,
            dims.h,
            layers.kind,
            await toDataUrl(layers.plate),
            layers.opts,
          );
          if (off) return;
          r = makeGifFromFrames(
            (fps) =>
              bannerFrames(
                b,
                fps,
                mode === "light" ? "light" : mode === "slides" ? "slides" : "full",
              ),
            dims.w,
            dims.h,
            { plays, maxBytes },
          );
        } else {
          const px = await pixelsFromImage(await toDataUrl(src), dims.w, dims.h);
          if (off) return;
          r = makeGifFromPixels(px, dims.w, dims.h, { ...fx, plays, maxBytes });
        }
        url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: "image/gif" }));
        if (off) return URL.revokeObjectURL(url);
        setGif({ url, kb: r.bytes.length / 1024, fps: r.fps, colors: r.colors, over: r.overLimit });
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
  }, [open, src, dims, fx, plays, mode, layers, limit]);

  const none = mode === "flat" && !fx.shine && !fx.sparkles && !fx.zoom;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-3xl overflow-y-auto border-border bg-popover p-0 text-foreground">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="ds-h4 text-left">
            GIF-баннер{dims ? ` · ${dims.w}×${dims.h}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_240px]">
          <div className="relative flex min-h-48 min-w-0 items-center justify-center rounded-xl bg-black/40 p-3">
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
            {busy ? <Loader2 className="absolute h-8 w-8 animate-spin text-accent-green" /> : null}
          </div>
          <div className="flex flex-col gap-4">
            {layers ? (
              <div>
                <div className="ds-caption mb-2 text-muted-foreground">Анимация</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={chip(mode === "scene")}
                    onClick={() => setMode("scene")}
                  >
                    Элементы
                  </button>
                  {canSlides ? (
                    <button
                      type="button"
                      className={chip(mode === "slides")}
                      onClick={() => setMode("slides")}
                    >
                      Кадры
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={chip(mode === "light")}
                    onClick={() => setMode("light")}
                  >
                    Лёгкая
                  </button>
                  <button
                    type="button"
                    className={chip(mode === "flat")}
                    onClick={() => setMode("flat")}
                  >
                    Блик поверх
                  </button>
                </div>
                {mode === "scene" ? (
                  <p className="ds-caption mt-2 text-muted-foreground">
                    Надписи влетают по словам, оффер «бьётся», кнопка выскакивает, по ней бежит
                    блик. Тяжелее 150 КБ — как у дизайнеров (230–420 КБ).
                  </p>
                ) : null}
                {mode === "slides" ? (
                  <p className="ds-caption mt-2 text-muted-foreground">
                    По очереди: {slideNames.map((n) => SLIDE_LABEL[n]).join(" → ")}. Фон и кнопка
                    стоят, меняется текст.
                  </p>
                ) : null}
                {mode === "light" ? (
                  <p className="ds-caption mt-2 text-muted-foreground">
                    Надписи стоят; кнопка выскакивает и толкается, по ней бежит блик, мерцают искры.
                    Для Google Ads (≤150 КБ).
                  </p>
                ) : null}
              </div>
            ) : null}
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
            <div>
              <div className="ds-caption mb-2 text-muted-foreground">Вес</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(limit)} onClick={() => setLimit(true)}>
                  ≤ 150 КБ
                </button>
                <button type="button" className={chip(!limit)} onClick={() => setLimit(false)}>
                  Без лимита
                </button>
              </div>
              <p className="ds-caption mt-2 text-muted-foreground">
                150 КБ — требование Google Ads; для прямых площадок качество важнее веса.
              </p>
            </div>
            <div>
              <div className="ds-caption mb-2 text-muted-foreground">Повторы</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(plays === 3)} onClick={() => setPlays(3)}>
                  3 раза
                </button>
                <button type="button" className={chip(plays === 0)} onClick={() => setPlays(0)}>
                  Бесконечно
                </button>
              </div>
              <p className="ds-caption mt-2 text-muted-foreground">
                Google Ads: анимация не дольше 30 с — «3 раза» укладывается.
              </p>
            </div>
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
            {gif ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${gif.over ? "bg-[color:var(--status-warning,#f59e0b)]/15" : "bg-accent-green/15"}`}
              >
                <b>{gif.kb.toFixed(0)} КБ</b> ·{" "}
                {gif.over
                  ? `больше лимита Google Ads (${GDN_GIF_LIMIT / 1024} КБ)`
                  : `в лимите Google Ads (${GDN_GIF_LIMIT / 1024} КБ)`}
                <div className="ds-caption text-muted-foreground">
                  {gif.fps} кадр/с · {gif.colors} цветов
                </div>
              </div>
            ) : null}
            <a
              href={gif && !none ? gif.url : undefined}
              download={dims ? `banner-${dims.w}x${dims.h}.gif` : "banner.gif"}
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
