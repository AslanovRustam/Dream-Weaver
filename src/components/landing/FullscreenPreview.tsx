"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Monitor, RefreshCw, Smartphone, X } from "lucide-react";

// "На весь экран" for the landing builders: renders the REAL export HTML
// (the same string «Скачать HTML» writes) in a sandboxed iframe.
//
// Desktop mode is a DevTools-style responsive viewport: width × height
// inputs, device presets, and drag handles on the right / bottom edge and
// the corner. The frame keeps real CSS pixels and is scaled down as a whole
// when it doesn't fit the stage. Portrait / landscape show a phone bezel.
type Viewport = "desktop" | "portrait" | "landscape";
const PHONE = { w: 390, h: 844 } as const;
const MIN = 320;
const MAX_W = 3840;
const MAX_H = 2400;

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1920 × 1080 · Full HD", w: 1920, h: 1080 },
  { label: "1536 × 864 · ноутбук", w: 1536, h: 864 },
  { label: "1440 × 900 · MacBook", w: 1440, h: 900 },
  { label: "1366 × 768 · ноутбук", w: 1366, h: 768 },
  { label: "1280 × 800", w: 1280, h: 800 },
  { label: "1024 × 768 · планшет", w: 1024, h: 768 },
  { label: "820 × 1180 · iPad", w: 820, h: 1180 },
  { label: "768 × 1024 · iPad mini", w: 768, h: 1024 },
  { label: "430 × 932 · iPhone Pro Max", w: 430, h: 932 },
  { label: "412 × 915 · Android", w: 412, h: 915 },
  { label: "390 × 844 · iPhone", w: 390, h: 844 },
  { label: "360 × 800 · Android компакт", w: 360, h: 800 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export function FullscreenPreview({ title, buildHtml }: { title: string; buildHtml: () => string }) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [html, setHtml] = useState("");
  // Responsive frame size (CSS px of the simulated viewport).
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [fitToStage, setFitToStage] = useState(true);
  const [scale, setScale] = useState(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | "e" | "s" | "se">(null);

  const show = () => {
    setHtml(buildHtml());
    setOpen(true);
  };
  const refresh = () => setHtml(buildHtml());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Track the stage size; "Авто" follows it, fixed sizes scale to fit.
  useLayoutEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStage({ w: Math.max(0, r.width - 40), h: Math.max(0, r.height - 40) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || viewport !== "desktop" || !fitToStage || !stage.w) return;
    setSize({ w: clamp(stage.w, MIN, MAX_W), h: clamp(stage.h, MIN, MAX_H) });
  }, [open, viewport, fitToStage, stage]);

  useEffect(() => {
    if (!stage.w) return;
    if (viewport === "desktop") {
      setScale(Math.min(1, stage.w / size.w, stage.h / size.h));
    } else {
      const w = viewport === "portrait" ? PHONE.w : PHONE.h;
      const h = viewport === "portrait" ? PHONE.h : PHONE.w;
      setScale(Math.min(1, stage.w / (w + 24), stage.h / (h + 24)));
    }
  }, [stage, size, viewport]);

  // Drag handles (DevTools style): the frame is centered, so a pointer delta
  // on the right edge changes the width by 2×delta/scale; the bottom edge
  // changes only the height (frame is top-aligned when it fits).
  useEffect(() => {
    if (!dragging) return;
    let last: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (!last) {
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = (e.clientX - last.x) / scale;
      const dy = (e.clientY - last.y) / scale;
      last = { x: e.clientX, y: e.clientY };
      setFitToStage(false);
      setSize((s) => ({
        w: dragging === "s" ? s.w : clamp(s.w + dx * 2, MIN, MAX_W),
        h: dragging === "e" ? s.h : clamp(s.h + dy, MIN, MAX_H),
      }));
    };
    const onUp = () => setDragging(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = dragging === "e" ? "ew-resize" : dragging === "s" ? "ns-resize" : "nwse-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, scale]);

  const applyPreset = (v: string) => {
    if (v === "fit") {
      setFitToStage(true);
      return;
    }
    const p = PRESETS.find((x) => `${x.w}x${x.h}` === v);
    if (!p) return;
    setFitToStage(false);
    setSize({ w: p.w, h: p.h });
  };
  const presetValue = fitToStage ? "fit" : PRESETS.some((p) => p.w === size.w && p.h === size.h) ? `${size.w}x${size.h}` : "custom";

  const numInput = (key: "w" | "h", max: number) => (
    <input
      type="number"
      min={MIN}
      max={max}
      value={size[key]}
      onChange={(e) => {
        setFitToStage(false);
        setSize((s) => ({ ...s, [key]: clamp(Number(e.target.value) || MIN, MIN, max) }));
      }}
      className="h-8 w-[76px] rounded-md border border-border bg-elevated px-2 text-center text-xs tabular-nums outline-none focus:border-accent-green"
      aria-label={key === "w" ? "Ширина" : "Высота"}
    />
  );

  const handleCls = "absolute z-10 flex items-center justify-center bg-transparent";
  const gripCls = "rounded-full bg-white/25 transition group-hover/frame:bg-accent-green/70";

  return (
    <>
      <button
        type="button"
        onClick={show}
        title="Открыть предпросмотр на весь экран"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
      >
        <Maximize2 className="h-3.5 w-3.5" /> На весь экран
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex flex-col bg-[#0B0D12]" role="dialog" aria-modal="true" aria-label={`Предпросмотр: ${title}`}>
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
                <div className="min-w-0">
                  <p className="ds-overline text-accent-green">Предпросмотр лендинга</p>
                  <p className="truncate text-sm font-semibold">{title}</p>
                </div>
                <div className="flex items-center gap-2">
                  {viewport === "desktop" ? (
                    <div className="hidden items-center gap-1.5 md:flex">
                      <select
                        value={presetValue}
                        onChange={(e) => applyPreset(e.target.value)}
                        className="h-8 rounded-md border border-border bg-elevated px-2 text-xs outline-none focus:border-accent-green"
                        aria-label="Размер экрана"
                      >
                        <option value="fit">Авто (по окну)</option>
                        {PRESETS.map((p) => (
                          <option key={p.label} value={`${p.w}x${p.h}`}>
                            {p.label}
                          </option>
                        ))}
                        {presetValue === "custom" ? <option value="custom">Свой размер</option> : null}
                      </select>
                      {numInput("w", MAX_W)}
                      <span className="text-xs text-muted-foreground">×</span>
                      {numInput("h", MAX_H)}
                      {scale < 1 ? <span className="ds-caption tabular-nums">{Math.round(scale * 100)}%</span> : null}
                    </div>
                  ) : null}
                  <div className="flex rounded-lg border border-border p-0.5">
                    {(
                      [
                        ["desktop", Monitor, "Responsive / десктоп", ""],
                        ["landscape", Smartphone, "Телефон горизонтально", "rotate-90"],
                        ["portrait", Smartphone, "Телефон вертикально", ""],
                      ] as const
                    ).map(([v, Icon, label, rot]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setViewport(v)}
                        title={label}
                        aria-label={label}
                        aria-pressed={viewport === v}
                        className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                          viewport === v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${rot}`} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={refresh}
                    title="Пересобрать по текущим настройкам"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Обновить
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Закрыть"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                ref={stageRef}
                className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden bg-[radial-gradient(60%_60%_at_50%_40%,rgba(255,255,255,.04),transparent)] p-5"
              >
                {viewport === "desktop" ? (
                  <div
                    className="group/frame relative shrink-0"
                    style={{
                      width: size.w,
                      height: size.h,
                      transform: `scale(${scale})`,
                      transformOrigin: "top center",
                    }}
                  >
                    <iframe
                      key={html.length + ":desktop"}
                      title={title}
                      srcDoc={html}
                      sandbox="allow-scripts"
                      className={`h-full w-full rounded-lg border border-border bg-black shadow-2xl ${dragging ? "pointer-events-none" : ""}`}
                    />
                    {/* Size badge, DevTools-style */}
                    <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/90">
                      {size.w} × {size.h}
                    </span>
                    {/* Drag handles: right edge, bottom edge, corner. Sized in
                        stage pixels by dividing by scale so they stay grabbable
                        when the frame is scaled down. */}
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setDragging("e");
                      }}
                      className={`${handleCls} top-0 h-full cursor-ew-resize`}
                      style={{ right: -14 / scale, width: 14 / scale }}
                      title="Тянуть: ширина"
                    >
                      <span className={gripCls} style={{ width: 4 / scale, height: 44 / scale }} />
                    </div>
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setDragging("s");
                      }}
                      className={`${handleCls} left-0 w-full cursor-ns-resize`}
                      style={{ bottom: -14 / scale, height: 14 / scale }}
                      title="Тянуть: высота"
                    >
                      <span className={gripCls} style={{ height: 4 / scale, width: 44 / scale }} />
                    </div>
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setDragging("se");
                      }}
                      className={`${handleCls} cursor-nwse-resize`}
                      style={{ right: -14 / scale, bottom: -14 / scale, width: 14 / scale, height: 14 / scale }}
                      title="Тянуть: ширина и высота"
                    >
                      <span className={gripCls} style={{ width: 8 / scale, height: 8 / scale }} />
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-[44px] border-[10px] border-[#1E2128] bg-black shadow-[0_30px_80px_rgba(0,0,0,.6)]"
                    style={{
                      width: (viewport === "portrait" ? PHONE.w : PHONE.h) + 4,
                      height: (viewport === "portrait" ? PHONE.h : PHONE.w) + 4,
                      transform: `scale(${scale})`,
                      transformOrigin: "top center",
                    }}
                  >
                    <iframe
                      key={html.length + ":" + viewport}
                      title={title}
                      srcDoc={html}
                      sandbox="allow-scripts"
                      className="h-full w-full rounded-[34px] bg-black"
                    />
                  </div>
                )}
              </div>
              <p className="shrink-0 border-t border-border px-4 py-2 text-center ds-caption">
                Это ровно тот HTML, который скачивается кнопкой «Скачать HTML». В режиме Responsive тяните за правый и нижний край или введите размер. Переходы по ссылке CTA отключены.
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
