"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapsible settings block for the landing builders — the same fold-away
 * pattern as the banner generator's "Расширенные настройки" / "Загрузить ТЗ".
 *
 * Open by default on purpose: folding is an opt-in tidy-up for the long
 * settings column, not a new hidden-by-default state, so nothing a user
 * relied on disappears after this change.
 */
export function CollapsibleSection({
  title,
  hint,
  tone = "neutral",
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  /** Small caption under the title, inside the header row. */
  hint?: ReactNode;
  /** "accent" matches the lime-tinted AI blocks (фон / иконки / ракета). */
  tone?: "neutral" | "accent";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === "accent"
          ? "border-accent-green/25 bg-accent-green/[0.05]"
          : "border-border bg-background/40"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block ds-h4">{title}</span>
          {hint ? <span className="mt-0.5 block ds-caption">{hint}</span> : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
