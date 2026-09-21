"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from "./config";
import { MESSAGES, SOURCE } from "./messages";

export { UI_LOCALES, type Locale } from "./config";

type Vars = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** The dictionary for the active locale. Partial by design — read it
   *  through t(), which falls back to Russian key by key. */
  messages: unknown;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolve(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(stored) && stored !== locale) setLocaleState(stored);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      /* ignore quota / private-mode */
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, messages: MESSAGES[locale] ?? SOURCE }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale/useT must be used inside <LocaleProvider>");
  return ctx;
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

// String lookup by dot-path with {var} interpolation. Falls back to the RU
// string, then to the key itself, so a missing translation never renders blank.
/** Like useT, but for copy that still lives in code (section metadata,
 *  step definitions): pass the original string as the fallback, and it is
 *  used verbatim until the key exists in the dictionary. */
export function useTx(): (path: string, fallback: string, vars?: Vars) => string {
  const t = useT();
  return useCallback(
    (path: string, fallback: string, vars?: Vars) => {
      const hit = t(path, vars);
      return hit === path ? interpolate(fallback, vars) : hit;
    },
    [t],
  );
}

export function useT(): (path: string, vars?: Vars) => string {
  const { messages } = useLocaleContext();
  return useCallback(
    (path: string, vars?: Vars) => {
      const hit = resolve(messages, path);
      const raw =
        typeof hit === "string" ? hit : (resolve(SOURCE, path) as string | undefined);
      return interpolate(typeof raw === "string" ? raw : path, vars);
    },
    [messages],
  );
}
