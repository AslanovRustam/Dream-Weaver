"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Monitor, RefreshCw, Smartphone, X } from "lucide-react";

// "На весь экран" for the landing builders: renders the REAL export HTML
// (the same string «Скачать HTML» writes) in a sandboxed iframe at true size —
// desktop full-width, or inside a phone bezel in portrait / landscape. The
// in-column preview is a React approximation; this is what the visitor gets.
type Viewport = "desktop" | "portrait" | "landscape";
const PHONE = { w: 390, h: 844 } as const;

export function FullscreenPreview({ title, buildHtml }: { title: string; buildHtml: () => string }) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [html, setHtml] = useState("");

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

  // Phone frames keep the device's real CSS pixels (so the export lays out
  // exactly as on a phone) and are scaled down as a whole when the overlay
  // is shorter/narrower than the device.
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!open || viewport === "desktop") return;
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const w = viewport === "portrait" ? PHONE.w : PHONE.h;
      const h = viewport === "portrait" ? PHONE.h : PHONE.w;
      const r = el.getBoundingClientRect();
      setScale(Math.min(1, (r.width - 32) / (w + 24), (r.height - 32) / (h + 24)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, viewport]);

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
              <div className="flex rounded-lg border border-border p-0.5">
                {(
                  [
                    ["desktop", Monitor, "Десктоп", ""],
                    ["landscape", Smartphone, "Моб. горизонталь", "rotate-90"],
                    ["portrait", Smartphone, "Моб. вертикаль", ""],
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

          <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(60%_60%_at_50%_40%,rgba(255,255,255,.04),transparent)] p-4">
            {viewport === "desktop" ? (
              <iframe
                key={html.length + ":desktop"}
                title={title}
                srcDoc={html}
                sandbox="allow-scripts"
                className="h-full w-full max-w-[1440px] rounded-xl border border-border bg-black shadow-2xl"
              />
            ) : (
              <div
                className="rounded-[44px] border-[10px] border-[#1E2128] bg-black shadow-[0_30px_80px_rgba(0,0,0,.6)]"
                style={{
                  width: (viewport === "portrait" ? PHONE.w : PHONE.h) + 4,
                  height: (viewport === "portrait" ? PHONE.h : PHONE.w) + 4,
                  transform: `scale(${scale})`,
                  transformOrigin: "center",
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
            Это ровно тот HTML, который скачивается кнопкой «Скачать HTML». Переходы по ссылке CTA в предпросмотре отключены.
          </p>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
