"use client";

// Ход работы автопилота: шаги инструмента по порядку — готово / идёт / ждёт.
import { Check, Loader2, RotateCcw } from "lucide-react";

export type AutoStep = { id: string; label: string };

export function AutoSteps({
  steps,
  current,
  done,
  error,
  log = [],
  onRetry,
  retryLabel = "Запустить снова",
}: {
  steps: AutoStep[];
  /** id шага, который идёт сейчас; null — всё закончено. */
  current: string | null;
  /** Всё готово (все шаги отмечены). */
  done?: boolean;
  error?: string;
  /** Живой журнал текущего шага («Открыл olymp-csn.com…») — последние строки под шагом. */
  log?: string[];
  /** Кнопка при ошибке или прерывании (перезагрузка). */
  onRetry?: () => void;
  retryLabel?: string;
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
      {!done && !error && log.length ? (
        <ul className="ml-6 flex flex-col gap-0.5 border-l border-border pl-3 text-xs text-muted-foreground">
          {log.slice(-5).map((l, i, a) => (
            <li key={a.length - i + l} className={i === a.length - 1 ? "text-foreground/80" : ""}>
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {error && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:border-foreground/40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
