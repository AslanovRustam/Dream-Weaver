"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";

import { UI_LOCALES, useLocale, useT } from "@/lib/i18n";

// Compact interface-language control for the header.
//
// The segmented RU / EN / UA control lives in the profile menu, which only
// exists once you are signed in — so a logged-out visitor, the person most
// likely to want another language, had no way to switch at all. This is the
// same setting, reachable before sign-in and narrow enough for a phone bar.
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = UI_LOCALES.find((l) => l.code === locale) ?? UI_LOCALES[0];

  return (
    <div ref={boxRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("header.language.aria")}
        title={t("header.language.title")}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:min-h-11"
      >
        <Globe className="h-4 w-4" />
        <span className="font-semibold">{current.short}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl"
        >
          {UI_LOCALES.map((l) => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  active ? "text-accent-green" : "text-foreground hover:bg-white/5"
                }`}
              >
                <span className="w-7 shrink-0 font-semibold">{l.short}</span>
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                {active ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
