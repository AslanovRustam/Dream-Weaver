// Onboarding hints are shown ONE AT A TIME.
//
// Two first-run hints used to fire together on a first visit to any tool: the
// header's section-switcher hint and the tool's own coachmark. They overlapped
// the very UI they explain and offered two competing "Понятно" buttons, so they
// are now queued: the switcher hint (global, shown once ever) goes first, and a
// tool coachmark (per-section, four of them) waits until it's gone.
//
// The two hints live in different component trees (AppHeader vs. each tool
// page), so they coordinate through this tiny shared store — same pattern as
// lib/unsaved-work.ts.

const SECTION_HINT_KEY = "dw:sectionHintSeen";

const listeners = new Set<() => void>();

/**
 * Has the header's section-switcher hint been dismissed?
 *
 * Fails OPEN (returns true) when storage is unavailable: a tool coachmark that
 * can never un-block is worse than showing it a little early, and in that case
 * the switcher hint can't render either, so nothing collides.
 */
export function isSectionHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SECTION_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

/** Dismiss the section hint and release any tool coachmark waiting behind it. */
export function markSectionHintSeen(): void {
  try {
    window.localStorage.setItem(SECTION_HINT_KEY, "1");
  } catch {
    /* storage blocked — still notify so the queued hint isn't stuck */
  }
  listeners.forEach((cb) => cb());
}

/** Subscribe to dismissal. Returns an unsubscribe function. */
export function onSectionHintSeen(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
