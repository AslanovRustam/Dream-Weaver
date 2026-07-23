"use client";

// Single reusable mobile overlay (scrim) shared by every dropdown / popup in the
// product. Mirrors the original profile-menu scrim: a portaled full-screen dark
// layer that fades in/out with the element it backs, sits behind the popup
// (z-40) but above page chrome, closes on tap, and is mobile-only (sm:hidden).
//
// Intensity: "strong" for large menus (section switcher, ⋯ menus, profile),
// "light" for compact ones (language selector) so they don't visually switch
// off the whole screen. Behaviour (fade + tap-to-close) is identical either way.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ScrimIntensity = "strong" | "light";

/** Where the scrim is shown. Defaults to "mobile" (the original behaviour);
 *  "all" also dims on desktop — used by full-width overlays like the Hub
 *  search dropdown, which needs separating from the content behind it on
 *  every screen size. Kept on this component on purpose: one scrim for the
 *  whole product beats another one-off overlay. */
export type ScrimScope = "mobile" | "all";

export function MobileScrim({
  open,
  onClose,
  intensity = "strong",
  scope = "mobile",
}: {
  open: boolean;
  onClose: () => void;
  intensity?: ScrimIntensity;
  scope?: ScrimScope;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const shade = intensity === "light" ? "bg-black/25" : "bg-black/60";
  const visibility = scope === "all" ? "" : "sm:hidden";
  return createPortal(
    <div
      aria-hidden
      onClick={onClose}
      className={`fixed inset-0 z-40 ${shade} transition-opacity duration-200 ${visibility} ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    />,
    document.body,
  );
}
