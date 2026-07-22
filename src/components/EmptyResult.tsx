"use client";

// Shared "nothing generated yet" placeholder for a section's result column, so
// the pre-generation empty state looks the same across generators: a dashed
// card with a round accent icon, a title, and a one-line hint. Pass a lucide
// icon (keep it consistent — no emoji) sized h-6 w-6.
import type { ReactNode } from "react";

export function EmptyResult({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex w-full flex-1 items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 max-lg:min-h-[360px]">
      <div className="max-w-xs text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-surface)] text-accent-green">
          {icon}
        </span>
        <h2 className="ds-h4">{title}</h2>
        <p className="mt-1 ds-caption">{hint}</p>
      </div>
    </div>
  );
}
