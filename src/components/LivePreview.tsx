"use client";

// Превью шаблона, которое оживает: в покое — кадр, при наведении на плитку
// (или когда плитка на экране у телефона) — анимированный WebP на ~4 с,
// снятый scripts/live-previews.mts. Пока анимация грузится, под ней виден
// кадр — второй слой фона. reduce-motion — только кадр.
import { useEffect, useRef, useState, type CSSProperties } from "react";

const SCENE_STILL = /^\/playable\/previews\/(scene-[a-z0-9]+)\.webp$/;
const LANDING_ANIM = new Set(["gambling-wheel", "gambling-slot-machine", "gambling-crash", "betting-match"]);
const LANDING_STILL = /^\/landing-previews\/([a-z-]+)\.jpg$/;

/** Анимированная пара к кадру, если она снята. */
export function livePreviewSrc(still?: string): string | null {
  if (!still) return null;
  const s = still.match(SCENE_STILL);
  if (s) return `/playable/previews/${s[1]}.anim.webp`;
  const l = still.match(LANDING_STILL);
  if (l && LANDING_ANIM.has(l[1])) return `/landing-previews/${l[1]}.anim.webp`;
  return null;
}

export function LivePreview({ still, className, fallback }: { still?: string; className: string; fallback?: CSSProperties }) {
  const anim = livePreviewSrc(still);
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!anim || !el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(hover: hover)").matches) {
      const tile = (el.closest("button, a") as HTMLElement | null) ?? el;
      const on = () => setLive(true);
      const off = () => setLive(false);
      tile.addEventListener("mouseenter", on);
      tile.addEventListener("mouseleave", off);
      tile.addEventListener("focus", on);
      tile.addEventListener("blur", off);
      return () => {
        tile.removeEventListener("mouseenter", on);
        tile.removeEventListener("mouseleave", off);
        tile.removeEventListener("focus", on);
        tile.removeEventListener("blur", off);
      };
    }
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setLive(e.intersectionRatio >= 0.6), { threshold: [0, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, [anim]);

  const style: CSSProperties | undefined = still
    ? { backgroundImage: live && anim ? `url(${anim}), url(${still})` : `url(${still})` }
    : fallback;
  return <div ref={ref} className={className} style={style} data-live={live ? "" : undefined} />;
}
