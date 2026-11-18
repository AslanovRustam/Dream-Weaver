"use client";

// Простой режим плейбла и лендинга на сцене: ТЗ в любом виде → «Создать».
// Движок ТЗ решает сцену, тексты, сумму, цвета и тему графики; студия
// раскладывает это в черновик и запускает ИИ-графику. Здесь — ввод, ход работы,
// карточка «Как я понял ТЗ» с решениями по сцене и ссылка по кнопке.
// Оркестровка — в SceneStudio.
import type { ReactNode } from "react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import type { TzRunInput, TzUnderstood } from "@/lib/tz/client";
import { NETWORK_BY_ID } from "@/lib/scenes/networks";
import { sceneMeta } from "@/lib/scenes/presets";
import type { PlayablePlan } from "./scenePlan";

export type SceneAutoPhase = "reading" | "planning" | "art" | "done" | "error";

export type SceneAutoState = {
  phase: SceneAutoPhase;
  error?: string;
  u?: TzUnderstood;
  plan?: PlayablePlan;
  /** Рисовать ли графику ИИ (галочка). */
  art: boolean;
  /** ТЗ пришло из лендинг-хаба уже понятым. */
  fromHub?: boolean;
};

export function SimpleScenePanel({
  auto,
  busy,
  landing,
  estimate,
  onRun,
  artPanel,
  clickUrl,
  onClickUrl,
  urlRequired,
}: {
  auto: SceneAutoState | null;
  busy: boolean;
  landing: boolean;
  estimate: string;
  onRun: (input: TzRunInput) => void;
  /** Ход сборки графики (AssetRunPanel студии) — после того как сцена разложена. */
  artPanel?: ReactNode;
  clickUrl: string;
  onClickUrl: (v: string) => void;
  urlRequired: boolean;
}) {
  const plan = auto?.plan;
  const steps = [
    { id: "reading", label: auto?.fromHub ? "Беру ТЗ, понятое на странице лендинга" : "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: "Выбираю сцену, пишу тексты, ставлю бренд и цвета" },
    ...((auto?.art ?? true)
      ? [{ id: "art", label: landing ? "Рисую графику сцены и блоков под тему" : "Рисую графику сцены под тему" }]
      : []),
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? (plan ? "art" : "reading") : auto.phase;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy}
        estimate={estimate}
        placeholder={
          "Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, игра или механика, тексты, площадки, ссылка.\nМожно перетащить сюда файл ТЗ (.docx, .pdf), логотип и референсы."
        }
        options={[
          {
            id: "art",
            label: landing ? "Нарисовать графику сцены и блоков лендинга под тему (ИИ)" : "Нарисовать графику сцены под тему (ИИ)",
            default: true,
          },
        ]}
        onRun={onRun}
      />

      {auto ? (
        <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} />
      ) : null}

      {auto?.u ? (
        <TzJobCard
          u={auto.u}
          rows={
            plan ? (
              <>
                <JobRow label="Сцена">
                  {sceneMeta(plan.scene).label}
                  {plan.why ? ` — ${plan.why}` : ""}
                </JobRow>
                {plan.headline ? <JobRow label="Заголовок">{plan.headline.replace(/\n/g, " ")}</JobRow> : null}
                {plan.cta ? <JobRow label="Кнопка">{plan.cta}</JobRow> : null}
                {plan.amount ? (
                  <JobRow label="Выигрыш">
                    {plan.bonusLabel ? `${plan.bonusLabel} ` : ""}
                    {plan.amount.toLocaleString("ru-RU")} {plan.unit}
                  </JobRow>
                ) : null}
                {plan.prizes.length ? (
                  <JobRow label="Сектора">
                    {plan.prizes.map((p, i) => (i === plan.winPrize ? `[${p}]` : p)).join(" · ")}
                  </JobRow>
                ) : null}
                {plan.theme ? <JobRow label="Тема графики">{plan.theme}</JobRow> : null}
                {!landing && plan.networks.length ? (
                  <JobRow label="Площадки">{plan.networks.map((n) => NETWORK_BY_ID.get(n)?.label ?? n).join(", ")}</JobRow>
                ) : null}
              </>
            ) : null
          }
        />
      ) : null}

      {plan && auto?.art ? artPanel : null}

      {plan ? (
        <div className="flex flex-col gap-1.5">
          <label className="ds-caption">Ссылка по кнопке{urlRequired ? " *" : ""}</label>
          <input
            type="url"
            value={clickUrl}
            onChange={(e) => onClickUrl(e.target.value)}
            placeholder="https://… — оффер или трекинговая ссылка"
            className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
          />
          <p className="ds-caption">
            {auto?.phase === "done"
              ? `Готово — превью справа играется. Скачайте ${landing ? "лендинг" : "файлы"} кнопкой под превью; поправить детали можно в «Продвинутом».`
              : "Пока рисуется графика, превью обновляется само."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
