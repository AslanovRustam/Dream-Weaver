// BYO (bring-your-own) credentials: each user connects THEIR OWN advertising
// cabinets (and optionally their own ESP for sending). LLM keys are system-side,
// not stored here.
//
// Kept in localStorage today (per-browser). NOTE for production: move these to
// encrypted per-user storage (Supabase) behind server routes — the shape here is
// designed so that swap is transparent to callers.
import type { AdPlatformId } from "@/lib/ads";

export type EspProvider = "" | "sendgrid" | "mailgun" | "smtp";

export interface PlatformCreds {
  token: string;
  accountId: string;
}

export interface Credentials {
  meta: PlatformCreds;
  google: PlatformCreds;
  tiktok: PlatformCreds;
  esp: { provider: EspProvider; apiKey: string; sender: string };
}

const KEY = "dw_credentials";

function empty(): Credentials {
  return {
    meta: { token: "", accountId: "" },
    google: { token: "", accountId: "" },
    tiktok: { token: "", accountId: "" },
    esp: { provider: "", apiKey: "", sender: "" },
  };
}

export function getCredentials(): Credentials {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Credentials>) } : empty();
  } catch {
    return empty();
  }
}

export function saveCredentials(c: Credentials): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Whether the user has entered credentials for a given ad platform. */
export function hasPlatformCreds(id: AdPlatformId): boolean {
  const p = getCredentials()[id];
  return !!(p.token.trim() && p.accountId.trim());
}
