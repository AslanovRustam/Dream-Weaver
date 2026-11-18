"use client";

// Простой режим механики — один поток сверху вниз: ТЗ → ход работы (живой
// журнал) → план и цена (если нужен) → «Как я понял ТЗ» с решениями лендинга →
// правка словами, «дальше по этому ТЗ», скачать. Превью — рядом, как всегда.
import type { ReactNode } from "react";
import { Download, RotateCcw } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import type { AssetStepState } from "@/lib/useAssetRun";
import type { TzRunInput } from "@/lib/tz/client";
import type { MechanicId, MechanicPlan } from "./plan";
import type { MechanicAuto } from "./useMechanicAutopilot";

export type PlanRow = { label: string; value: ReactNode };

const ART_VERB: Record<AssetStepState["status"], string> = { done: "Готово", error: "Не вышло", queued: "В очереди", running: "Рисую" };
const ART_ORDER: Record<AssetStepState["status"], number> = { done: 0, error: 1, queued: 2, running: 3 };

/** Решения, общие для всех механик, + свои строки механики. */
function planRows(p: MechanicPlan, wantArt: boolean, own: PlanRow[]): PlanRow[] {
  return [
    ...(p.why ? [{ label: "Почему механика", value: p.why }] : []),
    ...(p.headline ? [{ label: "Заголовок", value: p.headline }] : []),
    ...(p.cta ? [{ label: "Кнопка", value: p.cta }] : []),
    ...(p.offer ? [{ label: "Оффер на странице", value: p.offer }] : []),
    ...own,
    { label: "Язык страницы", value: p.pageLang },
    ...(p.brand.logo || p.brand.name
      ? [
          {
            label: "Бренд",
            value: (
              <span className="inline-flex items-center gap-2">
                {p.brand.logo ? <img src={p.brand.logo} alt="" className="h-5 w-auto max-w-[80px] rounded bg-white/5 object-contain" /> : null}
                {p.brand.logo ? "лого" : p.brand.name}
                {p.brand.site ? <span className="text-muted-foreground">· {p.brand.site}</span> : null}
              </span>
            ),
          },
        ]
      : []),
    ...(p.accent
      ? [
          {
            label: "Цвет",
            value: (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-border" style={{ background: p.accent }} />
                {p.accent}
              </span>
            ),
          },
        ]
      : []),
    ...(wantArt
      ? [
          ...(p.bg ? [{ label: "Фон", value: p.bg }] : []),
          ...(p.chars.left || p.chars.right ? [{ label: "Персонажи", value: [p.chars.left, p.chars.right].filter(Boolean).join(" / ") }] : []),
          ...(p.ref ? [{ label: "Референс стиля", value: "картинка из ТЗ — фон и персонажи рисуются от неё" }] : []),
        ]
      : []),
  ];
}

export function SimpleMechanicPanel({
  tool,
  auto,
  busy,
  estimate,
  examples,
  artLabel,
  rows,
  art,
  image,
  editCost,
  onRun,
  onApprove,
  onBack,
  onRetry,
  onEdit,
  onDownload,
}: {
  tool: MechanicId;
  auto: MechanicAuto | null;
  busy: boolean;
  estimate: string;
  examples: TzExample[];
  /** Что входит в графику механики: «фон, персонажи, иконки символов». */
  artLabel: string;
  /** Решения механики по плану (призы, символы, команды…). */
  rows: (p: MechanicPlan) => PlanRow[];
  art: { steps: AssetStepState[]; running: boolean; notEnough: string };
  /** Готовая картинка (фон) — для «дальше по этому ТЗ». */
  image?: string;
  editCost: string;
  onRun: (input: TzRunInput) => void;
  onApprove: (clarifications: string) => void;
  onBack: () => void;
  onRetry: () => void;
  onEdit: (text: string) => void;
  onDownload: () => void;
}) {
  const plan = auto?.plan;
  const work = busy || art.running;

  if (!auto) {
    return (
      <TzInputBox
        tool={tool}
        examples={examples}
        busy={work}
        estimate={estimate}
        placeholder={
          "Опишите лендинг своими словами или вставьте ТЗ целиком: оффер, гео и язык, бренд и сайт, призы, стиль, ссылки на референсы.\nМожно перетащить сюда файл ТЗ (.docx, .pdf) и картинки — лого, референсы стиля, персонажа."
        }
        options={[{ id: "art", label: `Сгенерировать графику ИИ (${artLabel})`, default: true }]}
        onRun={onRun}
      />
    );
  }

  const steps = [
    { id: "reading", label: auto.handoff ? "ТЗ уже разобрано на странице лендинга" : "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: auto.editing ? `Вношу правку: «${auto.editing}»` : "Пишу тексты и призы, ищу бренд, подбираю сцену" },
    { id: "filling", label: "Собираю лендинг: язык, бренд, цвета, блоки" },
    ...(auto.wantArt || auto.editing ? [{ id: "drawing", label: auto.editing ? "Перерисовываю то, что задела правка" : `Рисую графику: ${artLabel}` }] : []),
  ];
  const current = auto.phase === "done" ? null : auto.phase === "error" ? (auto.failed ?? "reading") : auto.phase;
  const artLog = [...art.steps].sort((a, b) => ART_ORDER[a.status] - ART_ORDER[b.status]).map((s) => `${ART_VERB[s.status]}: ${s.label}${s.error ? ` — ${s.error}` : ""}`);
  const log = auto.phase === "drawing" ? artLog : auto.log;
  const failedArt = art.steps.filter((s) => s.status === "error");
  const own = plan ? rows(plan) : [];

  return (
    <div className="flex flex-col gap-4">
      {auto.phase !== "review" ? (
        <AutoSteps
          steps={steps}
          current={current}
          done={auto.phase === "done"}
          error={auto.phase === "error" ? auto.error : undefined}
          log={log}
          onRetry={auto.phase === "error" ? onRetry : undefined}
          retryLabel={auto.interrupted ? "Продолжить" : "Запустить снова"}
        />
      ) : null}
      {art.notEnough ? <p className="-mt-2 text-xs text-amber-400">{art.notEnough} Тексты и блоки уже на странице — графику можно добавить позже.</p> : null}
      {auto.phase === "done" && failedArt.length ? (
        <p className="-mt-2 text-xs text-amber-400">Не получилось: {failedArt.map((s) => s.label).join(", ")}. Попробуйте правкой словами ниже.</p>
      ) : null}

      {auto.phase === "review" && auto.u && plan ? (
        <TzPlanGate
          u={auto.u}
          cost={auto.wantArt ? (auto.cost?.credits ?? null) : 0}
          costNote={auto.wantArt && auto.cost ? `Графика: ${auto.cost.note}. Кредиты списываются за каждую готовую картинку.` : "Без графики ИИ — только тексты и блоки, бесплатно."}
          busy={busy}
          onRun={onApprove}
          onEdit={onBack}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {planRows(plan, auto.wantArt, own).map((r) => (
              <JobRow key={r.label} label={r.label}>
                {r.value}
              </JobRow>
            ))}
          </dl>
        </TzPlanGate>
      ) : null}

      {auto.u && plan && auto.phase !== "review" ? (
        <TzJobCard
          u={auto.u}
          rows={planRows(plan, auto.wantArt, own).map((r) => (
            <JobRow key={r.label} label={r.label}>
              {r.value}
            </JobRow>
          ))}
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

      {auto.phase === "done" && auto.u ? (
        <>
          <TzEditBox
            busy={work}
            onEdit={onEdit}
            costLabel={editCost}
            placeholder="Что поправить? Например: фон темнее, персонаж — девушка, заголовок короче"
            examples={tool === "match" ? ["Стадион ночью", "Другие эмблемы", "Заголовок короче"] : ["Фон темнее", "Другой персонаж", "Заголовок короче"]}
          />
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            <Download className="h-4 w-4" /> Скачать HTML
          </button>
          <NextTools from={tool} understood={auto.u} input={auto.input ?? { text: "", files: [], images: [], options: {} }} image={image || undefined} only={["banner", "email", "playable", "campaign"]} />
        </>
      ) : null}

      {auto.phase === "done" || auto.phase === "error" ? (
        <button
          type="button"
          disabled={work}
          onClick={onBack}
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Новое ТЗ
        </button>
      ) : null}
    </div>
  );
}
