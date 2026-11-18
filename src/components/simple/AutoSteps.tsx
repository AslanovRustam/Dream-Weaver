"use client";

// Ход работы автопилота: шаги инструмента по порядку — готово / идёт / ждёт.
import { Check, Loader2 } from "lucide-react";

export type AutoStep = { id: string; label: string };

export function AutoSteps({
  steps,
  current,
  done,
  error,
}: {
  steps: AutoStep[];
  /** id шага, который идёт сейчас; null — всё закончено. */
  current: string | null;
  /** Всё готово (все шаги отмечены). */
  done?: boolean;
  error?: string;
}) {
  const at = current ? steps.findIndex((s) => s.id === current) : steps.length;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm">
      {steps.map((st, i) => {
        const isDone = done || i < at;
        const isNow = !isDone && i === at;
        return (
          <div key={st.id} className={`flex items-center gap-2 ${isDone || isNow ? "" : "text-muted-foreground"}`}>
            {isDone ? (
              <Check className="h-4 w-4 text-accent-green" />
            ) : isNow && !error ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
            ) : (
              <span className="h-4 w-4 rounded-full border border-border" />
            )}
            {st.label}
          </div>
        );
      })}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
