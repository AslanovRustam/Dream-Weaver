"use client";

// Shared generation loader used by every generator so a running generation
// looks the same everywhere. Two modes, same visual language:
//   • staged  — pass `stages` (+ `progress`/`etaSec`): bar, %, ETA, checklist.
//   • simple  — pass just `subtitle`: spinner + hint (for near-instant builds).
// `onCancel` (optional) always renders the same "Отменить" button; `footer` an
// optional muted note under it.
import { Check, Loader2 } from "lucide-react";

export type ProgressStage = { id: string; label: string };

export function GenerationProgress({
  title,
  subtitle,
  stages,
  stageIndex = 0,
  progress,
  etaSec,
  onCancel,
  footer,
}: {
  title: string;
  subtitle?: string;
  stages?: ProgressStage[];
  stageIndex?: number;
  progress?: number; // 0..1
  etaSec?: number;
  onCancel?: () => void;
  footer?: string;
}) {
  const hasBar = typeof progress === "number";
  const pct = hasBar ? Math.round((progress as number) * 100) : 0;
  return (
    <div className="flex min-h-[420px] w-full flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-muted p-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-center gap-2 text-accent-green">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ds-h2">{title}</span>
        </div>

        {hasBar ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent-green transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between ds-caption">
              <span className="tabular-nums text-foreground">{pct}%</span>
              {typeof etaSec === "number" ? (
                <span className="tabular-nums">≈ {etaSec} сек осталось</span>
              ) : null}
            </div>
          </>
        ) : subtitle ? (
          <p className="text-center ds-caption">{subtitle}</p>
        ) : null}

        {stages && stages.length ? (
          <ul className="mt-4 flex flex-col gap-2">
            {stages.map((s, i) => {
              const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "todo";
              return (
                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      state === "done"
                        ? "border-accent-green bg-accent-green text-black"
                        : state === "active"
                          ? "border-accent-green text-accent-green"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {state === "done" ? (
                      <Check className="h-3 w-3" />
                    ) : state === "active" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="text-[10px] tabular-nums">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className={
                      state === "todo" ? "text-muted-foreground" : "font-medium text-foreground"
                    }
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="mx-auto mt-5 block rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            Отменить
          </button>
        ) : null}
        {footer ? <p className="mt-2 text-center ds-caption">{footer}</p> : null}
      </div>
    </div>
  );
}
