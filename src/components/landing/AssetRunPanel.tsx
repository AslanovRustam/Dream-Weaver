"use client";

import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm";
import type { AssetStepState } from "@/lib/useAssetRun";

/**
 * Кнопка «собрать всё» и список того, что сейчас происходит.
 *
 * Список важнее кнопки: сборка идёт минуту-полторы, и без перечисления шагов
 * это просто долгий спиннер, по которому не понять, работает ли что-то и что
 * уже оплачено.
 */
export function AssetRunPanel({
  steps,
  running,
  notEnough,
  credits,
  onStart,
  onCancel,
  disabled,
  title,
  plan,
}: {
  steps: AssetStepState[];
  running: boolean;
  notEnough: string;
  /** Смета: во сколько обойдётся вся сборка. */
  credits: number;
  onStart: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /** Подпись кнопки вместо «Сгенерировать все ассеты». */
  title?: string;
  /**
   * Смета по шагам: до старта видно, что войдёт и почём, а нажатие сначала
   * спрашивает подтверждение с итоговой суммой — генерация платная.
   */
  plan?: { id: string; label: string; credits: number }[];
}) {
  const failed = steps.filter((s) => s.status === "error").length;
  const confirm = useConfirm();
  const start = async () => {
    if (plan?.length) {
      const ok = await confirm({
        title: `${title ?? "Сгенерировать всё"} — ${credits} кредитов?`,
        body:
          plan.map((p) => `• ${p.label} — ${p.credits}`).join("\n") +
          "\n\nКредиты списываются по мере готовности каждой картинки; за то, что не получилось, не списываются.",
        confirmLabel: `Сгенерировать · ${credits}`,
      });
      if (!ok) return;
    }
    onStart();
  };

  return (
    <div className="rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled || running || (plan !== undefined && plan.length === 0)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {running ? "Рисуем…" : `${title ?? "Сгенерировать все ассеты"} · ${credits}`}
      </button>

      {plan?.length && !running && steps.length === 0 ? (
        <p className="mt-2 ds-caption">
          Войдёт: {plan.map((p) => p.label).join(", ")}. Одним нажатием, по теме — кредиты за каждую картинку.
        </p>
      ) : null}

      {notEnough ? <p className="mt-2 ds-caption text-amber-400">{notEnough}</p> : null}

      {steps.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 ds-caption">
              {s.status === "done" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-accent-green" />
              ) : s.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : s.status === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
              )}
              <span className={s.status === "done" ? "text-foreground" : ""}>
                {s.label}
                {s.status === "error" && s.error ? <span className="block text-amber-400/90">{s.error}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {failed > 0 && !running ? (
        <p className="mt-2 ds-caption">
          Не вышло шагов: {failed}. Кредиты за них не списаны — повторите кнопкой у самого ассета.
        </p>
      ) : null}

      {running ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Отменить оставшиеся
        </button>
      ) : null}
    </div>
  );
}
