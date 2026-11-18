"use client";

// Простой режим механики: ТЗ → «Создать» → ход работы → «Как я понял ТЗ» с
// решениями лендинга (тексты, призы механики, язык, бренд, графика) → скачать.
import type { ReactNode } from "react";
import { Download } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import type { AssetStepState } from "@/lib/useAssetRun";
import type { TzRunInput } from "@/lib/tz/client";
import type { MechanicAuto } from "./useMechanicAutopilot";

export function SimpleMechanicPanel({
  auto,
  busy,
  estimate,
  onRun,
  artLabel,
  rows,
  art,
  onDownload,
}: {
  auto: MechanicAuto | null;
  busy: boolean;
  estimate: string;
  onRun: (input: TzRunInput) => void;
  /** Что входит в графику механики: «фон, персонажи, иконки символов». */
  artLabel: string;
  /** Решения механики (призы, символы, команды…) строками JobRow. */
  rows?: ReactNode;
  art: { steps: AssetStepState[]; running: boolean; notEnough: string };
  onDownload: () => void;
}) {
  const plan = auto?.plan;
  const steps = [
    { id: "reading", label: auto?.handoff ? "ТЗ уже разобрано на странице лендинга" : "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: "Пишу тексты и призы под оффер, ищу бренд, подбираю сцену" },
    { id: "filling", label: "Собираю лендинг: язык, бренд, цвета, блоки" },
    ...(auto?.wantArt !== false ? [{ id: "drawing", label: `Рисую графику: ${artLabel}` }] : []),
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? (auto.failed ?? "reading") : auto.phase;
  const failedSteps = art.steps.filter((s) => s.status === "error");

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy || art.running}
        estimate={estimate}
        placeholder={
          "Опишите лендинг своими словами или вставьте ТЗ целиком: оффер, гео и язык, бренд и сайт, призы, стиль, ссылки на референсы.\nМожно перетащить сюда файл ТЗ (.docx, .pdf) и картинки — лого, референсы стиля, персонажа."
        }
        options={[{ id: "art", label: `Сгенерировать графику ИИ (${artLabel})`, default: true }]}
        onRun={onRun}
      />

      {auto ? (
        <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} />
      ) : null}
      {art.notEnough ? <p className="-mt-3 text-xs text-amber-400">{art.notEnough} Тексты и блоки уже на странице — графику можно добавить позже.</p> : null}
      {auto?.phase === "done" && failedSteps.length ? (
        <p className="-mt-3 text-xs text-amber-400">
          Не получилось: {failedSteps.map((s) => s.label).join(", ")}. Остальное готово; повторить можно в «Продвинутом» режиме.
        </p>
      ) : null}

      {auto?.u && plan ? (
        <TzJobCard
          u={auto.u}
          rows={
            <>
              {plan.why ? <JobRow label="Почему механика">{plan.why}</JobRow> : null}
              {plan.headline ? <JobRow label="Заголовок">{plan.headline}</JobRow> : null}
              {plan.cta ? <JobRow label="Кнопка">{plan.cta}</JobRow> : null}
              {plan.offer ? <JobRow label="Оффер на странице">{plan.offer}</JobRow> : null}
              {rows}
              <JobRow label="Язык страницы">{plan.pageLang}</JobRow>
              {plan.brand.logo || plan.brand.name ? (
                <JobRow label="Бренд на странице">
                  <span className="inline-flex items-center gap-2">
                    {plan.brand.logo ? <img src={plan.brand.logo} alt="" className="h-5 w-auto max-w-[80px] rounded bg-white/5 object-contain" /> : null}
                    {plan.brand.logo ? "лого" : plan.brand.name}
                    {plan.brand.site ? <span className="text-muted-foreground">· {plan.brand.site}</span> : null}
                  </span>
                </JobRow>
              ) : null}
              {plan.accent ? (
                <JobRow label="Цвет">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm border border-border" style={{ background: plan.accent }} />
                    {plan.accent}
                  </span>
                </JobRow>
              ) : null}
              {auto.wantArt ? (
                <>
                  {plan.bg ? <JobRow label="Фон">{plan.bg}</JobRow> : null}
                  {plan.chars.left || plan.chars.right ? (
                    <JobRow label="Персонажи">{[plan.chars.left, plan.chars.right].filter(Boolean).join(" / ")}</JobRow>
                  ) : null}
                  {plan.ref ? <JobRow label="Референс стиля">картинка из ТЗ — фон и персонажи рисуются от неё</JobRow> : null}
                </>
              ) : null}
            </>
          }
        >
          {plan.notes.length ? (
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {plan.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </TzJobCard>
      ) : null}

      {auto?.phase === "done" ? (
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          <Download className="h-4 w-4" /> Скачать HTML
        </button>
      ) : null}
    </div>
  );
}
