// Client side of the first-party analytics.
//
// The whole module is a no-op until the visitor turns analytics on in the
// cookie dialog: nothing is queued, nothing is sent, and the two identifiers
// are not even created. Revoking consent deletes them again. That is what
// makes the switch in the dialog a real control rather than decoration.

import { CONSENT_EVENT, isAllowed } from "@/lib/consent";
import type { AnalyticsEventName, AnalyticsProps } from "@/lib/analyticsEvents";
import { MAX_EVENTS_PER_BATCH } from "@/lib/analyticsEvents";

const ANON_KEY = "dw_anon_id";
const SESSION_KEY = "dw_session_id";
const ENDPOINT = "/api/analytics";
const FLUSH_MS = 4000;

type Queued = { name: string; props?: AnalyticsProps; path: string; ref?: string };

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function idFrom(store: Storage, key: string): string | null {
  try {
    const existing = store.getItem(key);
    if (existing) return existing;
    const made = randomId();
    store.setItem(key, made);
    return made;
  } catch {
    return null;
  }
}

function forgetIds() {
  try {
    window.localStorage.removeItem(ANON_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* blocked storage */
  }
}

function send(payload: string, beacon: boolean) {
  try {
    if (beacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  // Fire-and-forget: analytics must never surface an error to the user, and
  // must never block. No Authorization header is attached on purpose — the
  // route reads the session only if the browser already sends one.
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function flushAnalytics(beacon = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || !isAllowed("analytics")) {
    queue = [];
    return;
  }
  const events = queue.slice(0, MAX_EVENTS_PER_BATCH);
  queue = queue.slice(events.length);
  send(
    JSON.stringify({
      anon_id: idFrom(window.localStorage, ANON_KEY),
      session_id: idFrom(window.sessionStorage, SESSION_KEY),
      events,
    }),
    beacon,
  );
}

export function track(name: AnalyticsEventName, props?: AnalyticsProps) {
  if (typeof window === "undefined" || !isAllowed("analytics")) return;
  queue.push({
    name,
    props,
    path: window.location.pathname,
    ref: document.referrer || undefined,
  });
  if (queue.length >= MAX_EVENTS_PER_BATCH) {
    flushAnalytics();
    return;
  }
  if (!timer) timer = setTimeout(() => flushAnalytics(), FLUSH_MS);
}

/** Called once by the provider. Flushes what is pending when the tab goes
 *  away, and drops everything the moment consent is withdrawn. */
export function initAnalytics() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  const onHide = () => {
    if (document.visibilityState === "hidden") flushAnalytics(true);
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flushAnalytics(true));

  window.addEventListener(CONSENT_EVENT, () => {
    if (!isAllowed("analytics")) {
      queue = [];
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      forgetIds();
    }
  });
}
