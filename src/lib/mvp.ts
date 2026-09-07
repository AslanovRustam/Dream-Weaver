// MVP gate — single source of truth for which tools are reachable during the
// demo. Everything else renders greyed-out "Скоро" and must not navigate.
// Used by the sidebar, the hub, and the header section switcher.

/** Section ids that are live in the MVP. */
export const MVP_ENABLED_SECTION_IDS = new Set<string>(["banner", "landing"]);

/** Routes that are reachable in the MVP (adds the hub itself). */
export const MVP_ENABLED_ROUTES = new Set<string>(["/", "/banner", "/landing"]);

export function isSectionEnabled(id: string): boolean {
  return MVP_ENABLED_SECTION_IDS.has(id);
}

export function isRouteEnabled(route: string): boolean {
  return MVP_ENABLED_ROUTES.has(route);
}
