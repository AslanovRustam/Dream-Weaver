// MVP gate — single source of truth for which tools are reachable during the
// demo. Everything else renders greyed-out "Скоро" and must not navigate.
// Used by the sidebar, the hub, and the header section switcher.
//
// sections.ts holds only data and icons and never imports this file, so the
// import below cannot close a cycle.
import { SECTION_BY_ID, type SectionId } from "./sections";

/** Section ids that are live in the MVP. */
export const MVP_ENABLED_SECTION_IDS = new Set<string>(["banner", "landing"]);

/** Routes that are reachable in the MVP (adds the hub + working History).
 *  History is a real feature (loads/edits generation_cards via /api/history), so
 *  it's live. Интеграции (/settings) stays greyed "Скоро". */
export const MVP_ENABLED_ROUTES = new Set<string>([
  "/",
  "/banner",
  "/banner/templates",
  "/landing",
  "/history",
  "/onboarding",
]);

/**
 * Sections opened for preview by NEXT_PUBLIC_PREVIEW_SECTIONS — a comma list
 * of section ids, e.g. "email,playable".
 *
 * Put it in .env.local to work on a section while it still reads «Скоро»
 * everywhere else. The variable is inlined at build time, so a production
 * build made without it behaves exactly as before: nothing to switch off
 * afterwards and nothing to leak. It is a preview of navigation only — the
 * routes themselves were never blocked, /email has always answered to anyone
 * typing it.
 */
const PREVIEW_SECTIONS = new Set(
  (process.env.NEXT_PUBLIC_PREVIEW_SECTIONS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean),
);

export function isSectionEnabled(id: string): boolean {
  return MVP_ENABLED_SECTION_IDS.has(id) || PREVIEW_SECTIONS.has(id);
}

export function isRouteEnabled(route: string): boolean {
  if (MVP_ENABLED_ROUTES.has(route)) return true;
  // A previewed section brings its own routes with it, so the sidebar entry
  // and the hub tile stop being greyed out together.
  for (const id of PREVIEW_SECTIONS) {
    const section = SECTION_BY_ID.get(id as SectionId);
    if (section && (route === section.route || route === section.entryRoute)) return true;
  }
  return false;
}
