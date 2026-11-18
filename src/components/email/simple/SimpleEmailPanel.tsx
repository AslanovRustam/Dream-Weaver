"use client";

// Простой режим генератора писем: ТЗ в любом виде → «Создать». Движок ТЗ
// (src/lib/tz, план — plans/email.ts) решает шаблон, тему, тексты, цвета и
// картинку. Здесь — одна лента: ввод → ход работы → вопросы (если есть) →
// «Как я понял ТЗ» → итог: правки словами, выгрузка, другие инструменты.
// Оркестровка — в EmailGenApp.
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { CheckOutcome } from "@/components/simple/CheckOutcome";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import type { TzCheck, TzRunInput, TzUnderstood } from "@/lib/tz/client";
import { templateOf, type EmailPlan } from "./emailAuto";

export type EmailAutoPhase = "reading" | "gate" | "building" | "hero" | "checking" | "done" | "error";

export type EmailAutoState = {
  phase: EmailAutoPhase;
  error?: string;
  /** На каком шаге оборвалось (ошибка или перезагрузка). */
  errorAt?: EmailAutoPhase;
  /** Исходный ввод (с уточнениями и правками) — для повтора, правок и передачи дальше. */
  input?: TzRunInput;
  u?: TzUnderstood;
  plan?: EmailPlan;
  /** Живой журнал: строки движка ТЗ и свои шаги. */
  log?: string[];
  /** Нужна ли сгенерированная картинка (галочка в вводе). */
  wantHero: boolean;
  /** Картинку берём из ТЗ как есть — генерации нет. */
  heroFromTz?: boolean;
  /** Картинка не получилась — письмо всё равно готово, с шапкой-брендом. */
  heroError?: string;
  /** Что дописали в письмо сами: обязательные строки ТЗ, которых не было в текстах. */
  added?: string[];
  check?: TzCheck;
  /** «Принять как есть» в итоге проверки картинки. */
  accepted?: boolean;
};

const EXAMPLES: TzExample[] = [
  {
    label: "Приветственное письмо",
    text: "Приветственное письмо новым игрокам казино StarSpin: бонус 100% до 50 000 ₽ + 100 фриспинов, вейджер x35, минимальный депозит 500 ₽. Русский язык, кнопка «Забрать бонус», ссылка https://starspin.example/welcome. Шаги активации. 18+, играйте ответственно.",
  },
  {
    label: "Возвращение игрока",
    text: "Реактивация: игроки, которые не заходили 30 дней. 30 фриспинов в Book of Dead без депозита, действуют 3 дня. Английский язык, тёплый тон «We miss you». Египетская тема, золото и бирюза. 18+ Gamble responsibly.",
  },
  {
    label: "Турнир по слотам",
    text: "Анонс турнира в слотах Pragmatic Play: призовой фонд €20 000, 1–7 декабря, топ-100 игроков получают призы. Немецкий язык, шаги участия, кнопка «Jetzt teilnehmen». Новогодний стиль, снег и неон. 18+.",
  },
  {
    label: "Матч дня",
    text: "Беттинг-рассылка: матч дня Барселона — Реал, повышенный коэффициент 2.75 на победу Барселоны, ставка до €100. Испанский язык, кнопка «Apostar ahora». Ночной стадион, гранатово-синие цвета. 18+ Juega con responsabilidad.",
  },
];

/** Правка про картинку, а не про тексты письма. */
export const isImageEdit = (t: string) =>
  /картин|изображ|рисун|персонаж|сцен|визуал|фото|шапк|баннер|hero/i.test(t) || (/фон/i.test(t) && !/письм|текст|кнопк/i.test(t));

export function SimpleEmailPanel({
  auto,
  busy,
  estimate,
  heroPrice,
  heroImage,
  result,
  onRun,
  onRetry,
  onGateRun,
  onGateEdit,
  onEdit,
  onRegenHero,
  onAccept,
}: {
  auto: EmailAutoState | null;
  busy: boolean;
  estimate: string;
  heroPrice: number;
  /** Картинка готового письма — уходит в другие инструменты. */
  heroImage?: string;
  /** Выгрузка готового письма. */
  result?: ReactNode;
  onRun: (input: TzRunInput) => void;
  onRetry: () => void;
  onGateRun: (clarifications: string) => void;
  onGateEdit: () => void;
  onEdit: (text: string) => void;
  onRegenHero: () => void;
  onAccept: () => void;
}) {
  const plan = auto?.plan;
  const u = auto?.u;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки — выбираю шаблон и пишу тексты" },
    { id: "building", label: "Собираю письмо: бренд, лого, цвета, ссылки" },
    ...(auto?.heroFromTz
      ? [{ id: "hero", label: "Ставлю картинку из ТЗ" }]
      : auto?.wantHero && (!plan || plan.heroPrompt)
        ? [{ id: "hero", label: "Рисую картинку письма" }]
        : []),
    { id: "checking", label: "Проверяю письмо по требованиям ТЗ" },
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? (auto.errorAt ?? "reading") : auto.phase;
  const tpl = plan ? templateOf(plan) : null;
  const done = auto?.phase === "done";
  const heroIds = plan?.heroRequirementIds ?? [];
  const heroCheck: TzCheck | null =
    auto?.check && heroIds.length
      ? { results: auto.check.results.filter((r) => heroIds.includes(r.id)), faceCovered: auto.check.faceCovered }
      : null;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        tool="email"
        examples={EXAMPLES}
        busy={busy}
        estimate={estimate}
        placeholder={
          "Напишите, какое письмо нужно, или вставьте ТЗ целиком: повод, оффер, гео и язык, тексты, ссылка на сайт и лендинг, юридические строки.\nМожно перетащить сюда файл ТЗ (.docx, .pdf), лого и референсы."
        }
        options={[{ id: "hero", label: "Сгенерировать картинку письма ИИ", default: true }]}
        onRun={onRun}
      />

      {auto && auto.phase !== "gate" ? (
        <AutoSteps
          steps={steps}
          current={current}
          done={done}
          error={auto.phase === "error" ? auto.error : undefined}
          log={auto.log}
          onRetry={auto.input || auto.u ? onRetry : undefined}
        />
      ) : null}

      {auto?.phase === "gate" && u && plan ? (
        <TzPlanGate
          u={u}
          cost={auto.wantHero && plan.heroPrompt && !plan.heroFromImageId ? heroPrice : null}
          costNote={auto.wantHero && plan.heroPrompt ? "Кредиты — только за картинку письма; тексты бесплатно." : undefined}
          busy={busy}
          onRun={onGateRun}
          onEdit={onGateEdit}
        >
          {tpl ? (
            <div>
              <span className="text-muted-foreground">Шаблон: </span>
              {tpl.name}
              {plan.templateWhy ? ` — ${plan.templateWhy}` : ""}
            </div>
          ) : null}
          {plan.subject ? (
            <div>
              <span className="text-muted-foreground">Тема: </span>
              {plan.subject}
            </div>
          ) : null}
          {plan.preheader ? (
            <div>
              <span className="text-muted-foreground">Прехедер: </span>
              {plan.preheader}
            </div>
          ) : null}
        </TzPlanGate>
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
                      ? "рисует ИИ, без текста на картинке"
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
          {auto?.heroError ? (
            <p className="text-xs text-destructive">Картинка не получилась: {auto.heroError}. Письмо готово и без неё — картинку можно нарисовать ещё раз.</p>
          ) : null}
        </TzJobCard>
      ) : null}

      {done && u && heroCheck ? (
        <CheckOutcome
          check={heroCheck}
          requirements={u.job.requirements}
          retryCost={heroPrice}
          busy={busy}
          accepted={auto?.accepted}
          onRetry={onRegenHero}
          onAccept={onAccept}
        />
      ) : null}

      {done && u && plan ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-background/40 p-3">
          <div className="ds-h4">Письмо готово</div>
          <TzEditBox
            busy={busy}
            onEdit={onEdit}
            placeholder="Что поправить? Например: тема короче, кнопка «Играть», картинку светлее"
            examples={["Тема короче", "Тон дружелюбнее", "Картинку светлее", "Другой персонаж на картинке"]}
            costLabel={`тексты — бесплатно, картинка ≈ ${heroPrice} кр.`}
          />
          {plan.heroPrompt && !auto?.heroFromTz ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRegenHero}
              className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:border-white/25 hover:bg-white/10 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-accent-green" />}
              {auto?.wantHero && !auto.heroError ? "Другая картинка" : "Нарисовать картинку"} · {heroPrice} кр.
            </button>
          ) : null}
          {result}
          {auto?.input ? <NextTools from="email" understood={u} input={auto.input} image={heroImage || undefined} only={["banner", "landing", "campaign"]} /> : null}
        </div>
      ) : null}
    </div>
  );
}
