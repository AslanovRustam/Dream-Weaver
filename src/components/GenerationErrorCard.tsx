"use client";

// Shared generation-error card used by every generator (banner / landing /
// playable / video) so a failed generation looks and behaves the same
// everywhere: a classified, friendly title + hint, the raw message kept but
// de-emphasised, and the most useful action (top-up for "no credits",
// otherwise retry) plus a dismiss.
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function GenerationErrorCard({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const m = (message || "").toLowerCase();
  const kind = /402|кредит|credit|balance|недостаточно|insufficient|payment/.test(m)
    ? "credits"
    : /failed to fetch|networkerror|network error|timeout|соединени|offline|интернет/.test(m)
      ? "network"
      : /content[_ ]?filter|policy|safety|moderation|отклон/.test(m)
        ? "filter"
        : "generic";
  const COPY = {
    credits: {
      title: "Закончились кредиты",
      hint: "Пополните баланс, чтобы продолжить генерацию.",
    },
    network: {
      title: "Проблема с соединением",
      hint: "Проверьте интернет и попробуйте ещё раз.",
    },
    filter: {
      title: "Запрос отклонён фильтром",
      hint: "Измените тематику или тексты и попробуйте снова.",
    },
    generic: {
      title: "Не удалось сгенерировать",
      hint: "Попробуйте ещё раз. Если повторяется — напишите в поддержку.",
    },
  } as const;
  const copy = COPY[kind];

  return (
    <div className="rounded-2xl border border-[color:var(--status-error)]/40 bg-[color:var(--status-error)]/5 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--status-error)]/15 text-[color:var(--status-error)]">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.hint}</p>
          {message ? (
            <p className="mt-2 truncate text-xs text-muted-foreground" title={message}>
              {message}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {kind === "credits" ? (
              <Link
                href="/billing"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Пополнить кредиты
              </Link>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <RefreshCw className="h-4 w-4" />
                Попробовать снова
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition hover:bg-white/5"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
