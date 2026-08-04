// Onboarding hints are shown ONE AT A TIME, and tracked PER ACCOUNT.
//
// Two first-run hints used to fire together on a first visit to any tool: the
// header's section-switcher hint and the tool's own coachmark. They overlapped
// the very UI they explain and offered two competing "Понятно" buttons, so they
// are now queued: the switcher hint (global, shown once per account) goes first,
// and a tool coachmark (per-section) waits until it's gone.
//
// PER-ACCOUNT tracking: the "seen" flag is keyed by the signed-in user's id, not
// a single device-global key. A device-global key meant a SECOND account on the
// same browser never saw onboarding — the exact bug reported. Ideally this flag
// lives in the user's account data (a backend field); until that exists, scoping
// the localStorage key by user id already gives the correct per-account behavior
// on a device. Pass `null` for guests / unknown user (uses an "anon" bucket).
//
// The two hints live in different component trees (AppHeader vs. each tool
// page), so they coordinate through this tiny shared store — same pattern as
// lib/unsaved-work.ts.

const listeners = new Set<() => void>();

function sectionHintKey(userKey: string | null): string {
  return `dw:sectionHintSeen:${userKey || "anon"}`;
}

/**
 * Has the header's section-switcher hint been dismissed FOR THIS ACCOUNT?
 *
 * Fails OPEN (returns true) when storage is unavailable: a tool coachmark that
 * can never un-block is worse than showing it a little early, and in that case
 * the switcher hint can't render either, so nothing collides.
 */
export function isSectionHintSeen(userKey: string | null): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(sectionHintKey(userKey)) === "1";
  } catch {
    return true;
  }
}

/** Dismiss the section hint (for this account) and release any queued coachmark. */
export function markSectionHintSeen(userKey: string | null): void {
  try {
    window.localStorage.setItem(sectionHintKey(userKey), "1");
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

/** Per-account key for a tool's first-visit coachmark. */
export function toolHintKey(section: string, userKey: string | null): string {
  return `dw:toolHint:${section}:${userKey || "anon"}`;
}
