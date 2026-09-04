"use client";

// Tiny shared store for the header notifications, so the desktop bell and the
// mobile menu render the same live state (fetch once, mark-read reflected in
// both). Backed by useSyncExternalStore.
import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { apiFetch, apiJson } from "./api-client";

export type NotificationType = "credit_grant" | "low_balance" | "creative_ready" | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  meta: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type State = { items: AppNotification[]; unread: number; loaded: boolean };

let state: State = { items: [], unread: 0, loaded: false };
const subs = new Set<() => void>();
let inFlight = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}
const getSnapshot = () => state;

export async function fetchNotifications(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const data = await apiJson<{ items: AppNotification[]; unread: number }>("/api/notifications");
    set({ items: data.items ?? [], unread: data.unread ?? 0, loaded: true });
  } catch {
    // Signed-out / transient — keep whatever we had, just mark loaded so the UI
    // shows the empty state instead of a perpetual spinner.
    set({ loaded: true });
  } finally {
    inFlight = false;
  }
}

/** Optimistically mark everything read, then persist. */
export async function markAllRead(): Promise<void> {
  if (state.unread === 0) return;
  const nowIso = new Date().toISOString();
  set({
    unread: 0,
    items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
  });
  try {
    await apiFetch("/api/notifications", { method: "POST", json: { all: true } });
  } catch {
    // Best-effort; a later fetch will reconcile.
  }
}

export function useNotifications(): State & { markAllRead: typeof markAllRead } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!state.loaded) void fetchNotifications();
  }, []);
  return { ...snap, markAllRead };
}

/** "только что" / "5 мин" / "3 ч" / "2 дн" / date. */
export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} дн`;
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
