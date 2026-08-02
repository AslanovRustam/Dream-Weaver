"use client";

import { useEffect, useState } from "react";

// Client-only breakpoint check (sm = 640px). Defaults to desktop on SSR / first
// paint to avoid a hydration mismatch; components that branch on it should render
// their mobile/desktop variants only after mount (or accept the desktop default
// for a frame). Shared so every overflow menu / responsive control agrees on the
// same breakpoint.
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}
