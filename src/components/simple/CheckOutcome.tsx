"use client";

// Итог проверки по ТЗ, когда даже после автоматического исправления что-то не
// прошло: что именно не вышло — и выбор «Попробовать ещё» (с ценой) или
// «Принять как есть». Молча оставлять красные пункты нельзя: человек должен
// решить, тратить ли кредиты ещё раз.
import { AlertTriangle, Check, RotateCcw } from "lucide-react";

import type { TzCheck, TzRequirement } from "@/lib/tz/client";

export function CheckOutcome({
  check,
  requirements,
  retryCost,
  busy,
  accepted,
  onRetry,
  onAccept,
}: {
  check: TzCheck;
  requirements: TzRequirement[];
  /** Кредиты за ещё одну попытку. */
  retryCost: number;
  busy?: boolean;
  accepted?: boolean;
  onRetry: () => void;
  onAccept: () => void;
}) {
  const failed = check.results.filter((r) => !r.ok);
  if (!failed.length && !check.faceCovered) return null;
  if (accepted)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" /> Принято как есть.
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-4 w-4 text-destructive" /> Не всё по ТЗ — даже после исправления
      </div>
      <ul className="list-disc pl-5 text-xs">
        {failed.map((r) => (
          <li key={r.id}>
            {requirements.find((q) => q.id === r.id)?.text ?? r.id}
            {r.note ? <span className="text-muted-foreground"> — {r.note}</span> : null}
          </li>
        ))}
        {check.faceCovered ? <li>Надпись или кнопка закрывает лицо персонажа</li> : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg bg-accent-green px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Попробовать ещё · {retryCost} кр.
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:border-foreground/40 disabled:opacity-50"
        >
          Принять как есть
        </button>
      </div>
    </div>
  );
}
