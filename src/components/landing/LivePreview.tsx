"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Превью лендинга в редакторе — настоящий экспорт (тот же HTML, что «Скачать HTML»),
// а не React-макет: что видно в редакторе, то и скачают. Рамка держит реальные CSS-пиксели
// устройства и целиком масштабируется под колонку. Пересборка — с паузой после правок.
export type PreviewViewport = "portrait" | "landscape" | "desktop";

const SIZES: Record<PreviewViewport, { w: number; h: number }> = {
  portrait: { w: 390, h: 844 },
  landscape: { w: 844, h: 390 },
  desktop: { w: 1280, h: 860 },
};

export function LivePreview({
  build,
  deps,
  viewport,
  overlay,
}: {
  /** Собирает HTML лендинга (тот же вызов, что в «Скачать HTML»). */
  build: () => string;
  /** Значения, при смене которых превью пересобирается. */
  deps: unknown[];
  viewport: PreviewViewport;
  /** Поверх рамки: шаги генерации и т. п. */
  overlay?: ReactNode;
}) {
  const [html, setHtml] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const size = SIZES[viewport];
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const t = window.setTimeout(() => setHtml(buildRef.current()), html ? 450 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / size.w);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w]);

  return (
    <div
      ref={boxRef}
      className={`relative w-full overflow-hidden rounded-2xl border border-border bg-[#0b0815] ${viewport === "portrait" ? "mx-auto max-w-[340px]" : ""}`}
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
    >
      {html && scale ? (
        <iframe
          title="Превью лендинга"
          srcDoc={html}
          sandbox="allow-scripts"
          className="absolute left-0 top-0 block border-0"
          style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      ) : null}
      {overlay}
    </div>
  );
}
