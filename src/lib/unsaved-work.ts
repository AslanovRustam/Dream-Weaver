// Tiny cross-component signal for "there is a freshly generated result that
// isn't persisted anywhere yet". Sections whose result lives only in component
// state (playable / video) set this while a result is on screen, so the header
// (section-switcher) and a beforeunload guard can warn before the user navigates
// away and loses it. Kept deliberately minimal — one value, plain listeners.

let currentSection: string | null = null;
const listeners = new Set<() => void>();

/** Mark `sectionId` as having unsaved work, or clear with `null`. */
export function setUnsavedWork(sectionId: string | null): void {
  if (currentSection === sectionId) return;
  currentSection = sectionId;
  listeners.forEach((l) => l());
}

/** The section id with unsaved work, or null. */
export function getUnsavedWork(): string | null {
  return currentSection;
}

export function subscribeUnsavedWork(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
