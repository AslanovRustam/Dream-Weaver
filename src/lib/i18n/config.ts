// UI (interface) language — distinct from the per-section generation language
// (see src/lib/creative-language.ts). This drives the product chrome: header,
// menus, and (rolled out incrementally) page copy. Switching is instant, no
// reload — a React context re-renders every consumer.

export type Locale = "ru" | "en" | "uk";

export const UI_LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
  { code: "uk", label: "Українська", short: "UA" },
];

export const DEFAULT_LOCALE: Locale = "ru";

// localStorage key holding the chosen interface language.
export const LOCALE_STORAGE_KEY = "dw:uiLang";

export function isLocale(v: unknown): v is Locale {
  return v === "ru" || v === "en" || v === "uk";
}
