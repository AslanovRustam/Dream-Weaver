// Cookie / local-storage consent.
//
// What the product actually stores today (checked, not assumed):
//   • nothing in cookies at all — the one document.cookie write in the repo is
//     in an unused shadcn component, and Supabase keeps the session in
//     localStorage;
//   • localStorage: the Supabase session (sb-*), plus interface preferences and
//     unfinished drafts;
//   • no analytics, no ad pixels, no third-party trackers.
//
// Under the ePrivacy rules only the analytics/marketing kind needs opt-in
// consent; authentication and user-preference storage are exempt and need a
// notice instead. So this module records a choice, keeps the analytics gate
// ready for the day something is added, and actually enforces the functional
// one by wiping non-essential storage while it is off.

export type ConsentCategories = {
  /** Sign-in, security, and the record of this very choice. Always on. */
  necessary: true;
  /** Interface preferences and unfinished drafts. */
  functional: boolean;
  /** Nothing uses this yet — the gate exists so nothing can be added silently. */
  analytics: boolean;
};

export type Consent = ConsentCategories & { v: 1; at: string };

export const CONSENT_COOKIE = "dw_consent";
/** Fired on this window whenever the choice changes. */
export const CONSENT_EVENT = "dw:consent";
/** Ask the banner to open its settings dialog (used by the legal page). */
export const CONSENT_OPEN_EVENT = "dw:consent-open";

const MAX_AGE_DAYS = 180;

export const ALL_ON: ConsentCategories = { necessary: true, functional: true, analytics: true };
export const MINIMAL: ConsentCategories = { necessary: true, functional: false, analytics: false };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function getConsent(): Consent | null {
  const raw = readCookie(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const o = v as Partial<Consent>;
    if (o.v !== 1) return null;
    return {
      v: 1,
      necessary: true,
      functional: o.functional === true,
      analytics: o.analytics === true,
      at: typeof o.at === "string" ? o.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveConsent(c: ConsentCategories): Consent {
  const value: Consent = { ...c, necessary: true, v: 1, at: new Date().toISOString() };
  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}` +
      `; path=/; max-age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`;
    if (!value.functional) clearNonEssentialStorage();
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  }
  return value;
}

export function isAllowed(category: keyof ConsentCategories): boolean {
  if (category === "necessary") return true;
  const c = getConsent();
  return c ? c[category] === true : false;
}

/** Everything except the session and the consent record itself. A deny-list
 *  would go stale the moment someone adds a key; this cannot. */
export function clearNonEssentialStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-")) continue; // Supabase session — keeps you signed in
      window.localStorage.removeItem(key);
    }
  } catch {
    /* blocked storage — nothing to clear */
  }
}

export function openConsentSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
