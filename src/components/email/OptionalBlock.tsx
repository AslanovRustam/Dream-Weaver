"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Необязательный блок письма: выключатель в заголовке и сворачиваемое тело.
 *
 * Две разные вещи специально разведены. Галочка решает, попадёт ли блок в
 * письмо; стрелка — видно ли его поля прямо сейчас. Раньше состав письма
 * выводился из заполненности полей, и это мешало в обе стороны: пустой блок
 * нельзя было оставить «на потом», а заполненный — временно убрать, не стирая
 * текст.
 *
 * Выключенный блок сворачивается сам: держать открытыми поля, которые ни на
 * что не влияют, — только сбивать с толку.
 */
export function OptionalBlock({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(enabled);

  const toggleEnabled = (next: boolean) => {
    onToggle(next);
    setOpen(next);
  };

  return (
    <div
      className={`rounded-xl border transition ${
        enabled ? "border-border bg-background/40" : "border-border/60 bg-background/20"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          aria-label={`${title} — включить блок в письмо`}
          onClick={() => toggleEnabled(!enabled)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition ${
            enabled
              ? "border-accent-green bg-accent-green text-on-accent"
              : "border-border text-transparent hover:border-accent-green/50"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className={`block ds-h4 ${enabled ? "" : "text-muted-foreground"}`}>{title}</span>
            {hint ? <span className="mt-0.5 block ds-caption">{hint}</span> : null}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div className={`border-t border-border/60 p-3 ${enabled ? "" : "opacity-60"}`}>
          {children}
          {!enabled ? (
            <p className="mt-2 ds-caption">Блок выключен — в письмо не попадёт, текст сохранится.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
