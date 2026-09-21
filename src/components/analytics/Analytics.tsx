"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { initAnalytics, track } from "@/lib/analytics";

// Page views for the App Router. Mounted once in the provider tree; sends
// nothing at all until analytics consent is on (see lib/analytics.ts).
export function Analytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    track("page_view");
  }, [pathname]);

  return null;
}
