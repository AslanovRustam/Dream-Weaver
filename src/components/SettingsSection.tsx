"use client";

// Shared collapsible settings section + step-dots indicator, so every generator
// groups its settings the same way (accordion with a "filled" check) instead of
// one long wall of fields, and shows the same mobile progress dots. Extracted
// from the video constructor, which pioneered the pattern.
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export function SettingsSection({
  title,
  icon,
  required,
  done,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  required?: boolean;
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-3 text-left transition hover:bg-white/5"
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="flex-1 ds-h4">
          {title}
          {required ? <span className="text-[color:var(--status-error)]"> *</span> : null}
        </span>
        {done ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-green/20 text-accent-green">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-border p-3">{children}</div> : null}
    </div>
  );
}

/** Mobile progress indicator: one dot per visible section, wide+green when done. */
export function SectionDots({
  sections,
}: {
  sections: { id: string; title?: string; done: boolean }[];
}) {
  return (
    <div className="flex flex-1 items-center justify-end gap-1.5">
      {sections.map((s) => (
        <span
          key={s.id}
          title={s.title}
          className={`h-1.5 rounded-full transition-all ${
            s.done ? "w-5 bg-accent-green" : "w-2.5 bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}
