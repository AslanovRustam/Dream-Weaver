"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

// Entry-aware "back": returns to the screen the user actually came from (real
// browser history) when there is one, and only falls back to a sensible parent
// when the page was opened directly (no in-app history — e.g. a fresh tab or a
// shared deep link). This replaces hard-coded parents like `href="/account"`,
// which sent you to Account even if you arrived from the Hub.
export function useSmartBack(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
