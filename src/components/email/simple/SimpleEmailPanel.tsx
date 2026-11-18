"use client";

// Простой режим генератора писем: ТЗ в любом виде → «Создать». Движок ТЗ
// (src/lib/tz, план — plans/email.ts) решает шаблон, тему, тексты, цвета и
// картинку; здесь — общий ввод, ход работы и карточка «Как я понял ТЗ» с
// решениями письма. Оркестровка — в EmailGenApp.
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import type { TzCheck, TzRunInput, TzUnderstood } from "@/lib/tz/client";
import { templateOf, type EmailPlan } from "./emailAuto";

export type EmailAutoPhase = "reading" | "building" | "hero" | "checking" | "done" | "error";

export type EmailAutoState = {
  phase: EmailAutoPhase;
  error?: string;
  u?: TzUnderstood;
  plan?: EmailPlan;
  /** Нужна ли сгенерированная картинка (галочка в вводе). */
  wantHero: boolean;
  /** Картинку берём из ТЗ как есть — генерации нет. */
  heroFromTz?: boolean;
  /** Картинка не получилась — письмо всё равно готово, с шапкой-брендом. */
  heroError?: string;
  /** Что дописали в письмо сами: обязательные строки ТЗ, которых не было в текстах. */
  added?: string[];
  check?: TzCheck;
};

export function SimpleEmailPanel({
  auto,
  busy,
  estimate,
  heroPrice,
  onRun,
  onRegenHero,
  onAdvanced,
}: {
  auto: EmailAutoState | null;
  busy: boolean;
  estimate: string;
  heroPrice: number;
  onRun: (input: TzRunInput) => void;
  onRegenHero: () => void;
  onAdvanced: () => void;
}) {
  const plan = auto?.plan;
  const u = auto?.u;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки — выбираю шаблон и пишу тексты" },
    { id: "building", label: "Собираю письмо: бренд, лого, цвета, ссылки" },
    ...(auto?.heroFromTz
      ? [{ id: "hero", label: "Ставлю картинку из ТЗ" }]
      : auto?.wantHero && (!plan || plan.heroPrompt)
        ? [{ id: "hero", label: "Генерирую картинку письма" }]
        : []),
    { id: "checking", label: "Проверяю письмо по требованиям ТЗ" },
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? "reading" : auto.phase;
  const tpl = plan ? templateOf(plan) : null;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy}
        estimate={estimate}
        placeholder={
          "Напишите, какое письмо нужно, или вставьте ТЗ целиком: повод, оффер, гео и язык, тексты, ссылка на сайт и лендинг, юридические строки.\nМожно перетащить сюда файл ТЗ (.docx, .pdf), лого и референсы."
        }
        options={[{ id: "hero", label: "Сгенерировать картинку письма ИИ", default: true }]}
        onRun={onRun}
      />

      {auto ? (
        <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} />
      ) : null}

      {u && plan ? (
        <TzJobCard
          u={u}
          check={auto?.check}
          rows={
            <>
              {tpl ? (
                <JobRow label="Шаблон">
                  {tpl.name}
                  {plan.templateWhy ? ` — ${plan.templateWhy}` : ""}
                </JobRow>
              ) : null}
              {plan.subject ? <JobRow label="Тема">{plan.subject}</JobRow> : null}
              {plan.preheader ? <JobRow label="Прехедер">{plan.preheader}</JobRow> : null}
              {plan.offerLine ? <JobRow label="Оффер в письме">{plan.offerLine}</JobRow> : null}
              {plan.ctaText ? (
                <JobRow label="Кнопка">
                  {plan.ctaText}
                  {plan.ctaUrl ? <span className="break-all text-muted-foreground"> → {plan.ctaUrl}</span> : null}
                </JobRow>
              ) : null}
              <JobRow label="Картинка">
                {auto?.heroFromTz
                  ? "из ТЗ, как есть"
                  : !auto?.wantHero
                    ? "без картинки — в шапке бренд"
                    : plan.heroPrompt
                      ? "генерирую ИИ, без текста на картинке"
                      : "не нужна этому письму"}
              </JobRow>
            </>
          }
        >
          {auto?.added?.length ? (
            <div className="text-xs">
              <div className="mb-1 text-muted-foreground">Дописал в письмо обязательные строки из ТЗ</div>
              <ul className="list-disc pl-4">
                {auto.added.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {auto?.heroError ? <p className="text-xs text-destructive">Картинка не получилась: {auto.heroError}. Письмо готово и без неё — попробуйте ещё раз или загрузите свою в «Поправить вручную».</p> : null}
        </TzJobCard>
      ) : null}

      {auto?.phase === "done" ? (
        <div className="flex flex-wrap gap-2">
          {plan?.heroPrompt && !auto.heroFromTz ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRegenHero}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:border-white/25 hover:bg-white/10 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-accent-green" />}
              {auto.wantHero && !auto.heroError ? "Другая картинка" : "Добавить картинку"} · {heroPrice} кр.
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdvanced}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
          >
            <SlidersHorizontal className="h-4 w-4 text-accent-green" />
            Поправить вручную
          </button>
        </div>
      ) : null}
    </div>
  );
}
