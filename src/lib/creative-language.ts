"use client";

// Global "creative language" — the account/session-level default language for
// generated creatives, shown in the header and used as the default for every
// section's own "Язык" field. Persisted to localStorage so it survives section
// switches and reloads. A local per-project override (the section's own field)
// does NOT change this global value.
import { useSyncExternalStore } from "react";

const KEY = "dw:creativeLang";
const DEFAULT = "auto";
const listeners = new Set<() => void>();

function read(): string {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return window.localStorage.getItem(KEY) || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function getCreativeLanguage(): string {
  return read();
}

export function setCreativeLanguage(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* quota — ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCreativeLanguage(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

export const CREATIVE_LANGUAGES: { value: string; label: string; short: string }[] = [
  { value: "auto", label: "Авто (по бренду)", short: "Авто" },
  { value: "ru", label: "Русский", short: "RU" },
  { value: "uk", label: "Українська", short: "UA" },
  { value: "en", label: "English", short: "EN" },
  { value: "es", label: "Español", short: "ES" },
  { value: "de", label: "Deutsch", short: "DE" },
  { value: "fr", label: "Français", short: "FR" },
  { value: "pl", label: "Polski", short: "PL" },
];

export function creativeLangShort(value: string): string {
  return CREATIVE_LANGUAGES.find((l) => l.value === value)?.short ?? "Авто";
}
