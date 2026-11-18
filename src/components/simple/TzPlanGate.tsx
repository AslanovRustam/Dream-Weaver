"use client";

// План перед запуском. Показывается, когда движок задал вопросы по критичным
// пробелам ТЗ (нет оффера, непонятен язык…) или запуск дорогой: сначала —
// «вот что я сделаю и сколько это стоит», запуск — по кнопке. Ответы на вопросы
// уходят в ТЗ уточнениями: инструмент понимает его заново и запускает сразу.
import { useState, type ReactNode } from "react";
import { HelpCircle, Pencil, Play } from "lucide-react";

import { answersText, type TzUnderstood } from "@/lib/tz/client";

export function TzPlanGate({
  u,
  cost,
  costNote,
  busy,
  onRun,
  onEdit,
  children,
}: {
  u: TzUnderstood;
  /** Кредиты за запуск по плану; null — неизвестно. */
  cost: number | null;
  /** Из чего цена: «3 баннера × 30 + 6 ресайзов × 2». */
  costNote?: string;
  busy?: boolean;
  /** clarifications — ответы на вопросы текстом (пусто, если вопросов не было). */
  onRun: (clarifications: string) => void;
  /** «Поправить ТЗ» — вернуться к вводу (текст ТЗ сохранён). */
  onEdit: () => void;
  /** Что именно будет сделано — решения инструмента. */
  children?: ReactNode;
}) {
  const qs = u.job.questions;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const unanswered = qs.filter((q) => !answers[q.id]?.trim()).length;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent-green/50 bg-accent-green/5 p-4 text-sm">
      <h3 className="ds-h4">{qs.length ? "Уточню пару моментов перед запуском" : "План перед запуском"}</h3>

      {qs.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <div className="flex items-start gap-1.5">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
            <span>{q.text}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-5">
            {q.options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setAnswers((a) => ({ ...a, [q.id]: o }));
                  setCustom((c) => ({ ...c, [q.id]: false }));
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  answers[q.id] === o && !custom[q.id] ? "border-accent-green bg-accent-green/15" : "border-border hover:border-foreground/40"
                }`}
              >
                {o}
              </button>
            ))}
            {q.custom ? (
              <button
                type="button"
                onClick={() => {
                  setCustom((c) => ({ ...c, [q.id]: true }));
                  setAnswers((a) => ({ ...a, [q.id]: "" }));
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${custom[q.id] ? "border-accent-green bg-accent-green/15" : "border-border hover:border-foreground/40"}`}
              >
                Свой ответ
              </button>
            ) : null}
          </div>
          {custom[q.id] ? (
            <input
              autoFocus
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Ваш ответ"
              className="ml-5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
          ) : null}
        </div>
      ))}

      {children ? <div className="flex flex-col gap-1.5 text-xs">{children}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || unanswered > 0}
          onClick={() => onRun(answersText(qs, answers))}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent-green px-5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {qs.length ? "Учесть ответы и запустить" : "Запускаем"}
          {cost !== null ? ` · ${cost} кр.` : ""}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm transition hover:border-foreground/40 disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" /> Поправить ТЗ
        </button>
      </div>
      {costNote ? <p className="-mt-2 text-xs text-muted-foreground">{costNote}</p> : null}
      {unanswered > 0 ? <p className="-mt-2 text-xs text-muted-foreground">Ответьте на вопросы — от них зависят тексты.</p> : null}
    </div>
  );
}
