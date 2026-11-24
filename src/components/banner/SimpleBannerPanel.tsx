"use client";

// Простой режим баннер-генератора (и «Слоёв»): ТЗ в любом виде → «Создать».
// Остальное решает движок ТЗ (src/lib/tz). Две части:
//  - SimpleBannerInput — слева: ТЗ, примеры, «продолжить по последнему ТЗ», галочки;
//  - SimpleBannerStatus — справа над результатом: ход работы с живым журналом,
//    план и вопросы перед дорогим запуском, «Как я понял ТЗ», креативы из ТЗ,
//    итог проверки, правки словами, «дальше по этому ТЗ».
// Оркестровка — в ImageGenApp.
import { Check, Loader2 } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { CheckOutcome } from "@/components/simple/CheckOutcome";
import { ComplianceCheck } from "@/components/compliance/ComplianceCheck";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import type { TzCheck, TzImage, TzLinkInfo, TzRunInput, TzSource } from "@/lib/tz/client";
import type { TzJob } from "@/lib/tz/understand";

export type AutoPhase =
  | "reading"
  | "review"
  | "planning"
  | "generating"
  | "checking"
  | "fixing"
  | "decide"
  | "resizing"
  | "done"
  | "error";

export type AutoState = {
  phase: AutoPhase;
  error?: string;
  /** Прервано перезагрузкой — можно продолжить с сохранённого задания. */
  interrupted?: boolean;
  input?: TzRunInput;
  job?: TzJob;
  images?: TzImage[];
  links?: TzLinkInfo[];
  sources?: TzSource[];
  /** Живой журнал текущего шага. */
  log: string[];
  /** Какой баннер из задания делаем сейчас. */
  bannerIndex: number;
  /** Сделать все креативы из ТЗ по очереди. */
  queueAll: boolean;
  /** Готовые мастера по креативам. */
  results: { index: number; image: string }[];
  templateName?: string;
  ideas?: string[];
  check?: TzCheck;
  retried?: boolean;
  accepted?: boolean;
  /** Описание баннера от арт-директора — основа для исправлений и правок. */
  prompt?: string;
  /** Цена запуска по плану (кредиты) и из чего она. */
  cost?: number;
  costNote?: string;
  wantResizes: boolean;
  /** Два варианта на разных шаблонах, лучший — по проверке ТЗ. */
  twoVariants: boolean;
  /** Какой вариант генерируется сейчас. */
  variant?: "A" | "B";
  /** Готовые варианты текущего баннера и какой выбран. */
  candidates?: AutoCandidate[];
  chosen?: "A" | "B";
};

export type AutoCandidate = {
  key: "A" | "B";
  image: string;
  cardId: string | null;
  payload: import("@/lib/imageGen").GeneratePayload | null;
  prompt: string;
  template: string;
  check: TzCheck | null;
  score: number;
};

const BANNER_EXAMPLES: TzExample[] = [
  {
    label: "Бонус на депозит",
    text: "Баннеры под акцию для Узбекистана: 100% на первый депозит до 5 000 000 сум + 50 фриспинов. Форматы 1080×1080, сторис 1080×1920 и 1200×628 для Facebook. Тексты на узбекском, кнопка «O'ynash». Восточная сказка: ночь, золото, лампа джинна. 18+.",
  },
  {
    label: "Финал Лиги чемпионов",
    text: "Баннер для ставок на финал Лиги чемпионов, Реал — Боруссия, 1 июня. Фрибет 500 ₽ за первую ставку. Русский язык, стадион, вспышки, кубок. Кнопка «Сделать ставку». Форматы: пост и сторис. 18+.",
  },
  {
    label: "Хэллоуин, 2 варианта",
    text: "Два варианта баннера для A/B: хэллоуинский турнир, призовой фонд €10 000 и 200 фриспинов. Вариант А — ведьма-маскот, вариант Б — тыквы и туман. Английский, кнопка «Join now», 16:9.",
  },
  {
    label: "Новый слот",
    text: "Анонс нового слота: новогодние сладости, снег, яркие конфеты. 100 фриспинов новым игрокам. Тексты на русском, кнопка «Играть». Квадрат для соцсетей.",
  },
];

export function SimpleBannerInput({ tool, busy, estimate, onRun }: { tool: string; busy: boolean; estimate: string; onRun: (input: TzRunInput) => void }) {
  return (
    <TzInputBox
      tool={tool}
      examples={BANNER_EXAMPLES}
      busy={busy}
      estimate={estimate}
      options={[
        { id: "resizes", label: "Сразу сделать ресайзы под площадки из ТЗ", default: true },
        { id: "all", label: "Если в ТЗ несколько разных баннеров — сделать все", default: true },
        { id: "two", label: "Два варианта на разных шаблонах — выберу лучший по ТЗ (×2 к цене баннера)", default: false },
      ]}
      onRun={onRun}
    />
  );
}

export function SimpleBannerStatus({
  auto,
  busy,
  from,
  image,
  editCost,
  onGateRun,
  onGateEdit,
  onResume,
  onOutcomeRetry,
  onOutcomeAccept,
  onEdit,
  onMakeBanner,
  onShowResult,
}: {
  auto: AutoState;
  busy: boolean;
  from: "banner" | "bannerLayers";
  /** Текущий мастер — для «дальше по этому ТЗ». */
  image: string | null;
  editCost: number;
  onGateRun: (clarifications: string) => void;
  onGateEdit: () => void;
  onResume: () => void;
  onOutcomeRetry: () => void;
  onOutcomeAccept: () => void;
  onEdit: (text: string) => void;
  onMakeBanner: (index: number) => void;
  onShowResult: (image: string) => void;
}) {
  const job = auto.job;
  const u = job ? { job, images: auto.images ?? [], links: auto.links ?? [], sources: auto.sources ?? [] } : null;
  const many = (job?.banners.length ?? 0) > 1;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: "Выбираю шаблон и пишу описание баннера" },
    {
      id: "generating",
      label: `${many ? `Генерирую баннер ${auto.bannerIndex + 1} из ${job!.banners.length}` : "Генерирую баннер"}${auto.twoVariants && auto.variant ? ` · вариант ${auto.variant === "A" ? "А" : "Б"}` : ""}`,
    },
    { id: "checking", label: auto.phase === "fixing" ? "Исправляю то, что не прошло проверку" : "Проверяю баннер по требованиям ТЗ" },
    ...(auto.wantResizes ? [{ id: "resizing", label: "Запускаю ресайзы под площадки" }] : []),
  ];
  const current =
    auto.phase === "done"
      ? null
      : auto.phase === "fixing" || auto.phase === "decide"
        ? "checking"
        : auto.phase === "review"
          ? "planning"
          : auto.phase === "error"
            ? auto.job
              ? "generating"
              : "reading"
            : auto.phase;
  const banner = job?.banners[auto.bannerIndex];
  const reqs = job ? job.requirements.filter((r) => r.kind !== "format" && (!banner?.requirementIds.length || banner.requirementIds.includes(r.id))) : [];

  return (
    <div className="flex flex-col gap-4">
      {auto.phase !== "review" ? (
        <AutoSteps
          steps={steps}
          current={current}
          done={auto.phase === "done"}
          error={auto.phase === "error" ? auto.error : undefined}
          log={auto.log}
          onRetry={auto.interrupted || auto.job ? onResume : undefined}
          retryLabel={auto.interrupted ? "Продолжить с того же места" : "Запустить снова"}
        />
      ) : null}

      {auto.phase === "review" && u ? (
        <TzPlanGate u={u} cost={auto.cost ?? null} costNote={auto.costNote} busy={busy} onRun={onGateRun} onEdit={onGateEdit}>
          {job!.banners.map((b, i) => (
            <div key={i}>
              <span className="font-medium">
                {job!.banners.length > 1 ? `${i + 1}. ` : ""}
                {b.name} · {b.aspect}
              </span>
              <span className="text-muted-foreground">
                {" — "}«{b.headline}»{b.cta ? ` / «${b.cta}»` : ""}
              </span>
            </div>
          ))}
          {auto.wantResizes && job!.sizes.length ? (
            <div className="text-muted-foreground">Ресайзы: {job!.sizes.map((s) => `${s.w}×${s.h}`).join(", ")}</div>
          ) : null}
        </TzPlanGate>
      ) : null}

      {auto.phase === "decide" && auto.check && job ? (
        <CheckOutcome
          check={auto.check}
          requirements={reqs}
          retryCost={editCost}
          busy={busy}
          accepted={auto.accepted}
          onRetry={onOutcomeRetry}
          onAccept={onOutcomeAccept}
        />
      ) : null}

      {auto.phase === "done" && job && auto.input ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3">
          <div className="text-xs text-muted-foreground">Поправить словами — перегенерирую и проверю по ТЗ</div>
          <TzEditBox onEdit={onEdit} busy={busy} costLabel={`≈ ${editCost} кр. за правку`} />
          {image ? <ComplianceCheck image={image} geoHint={u?.job.geo} /> : null}
          {u ? <NextTools from={from === "bannerLayers" ? "bannerLayers" : "banner"} understood={u} input={auto.input} image={image ?? undefined} /> : null}
        </div>
      ) : null}

      {u ? (
        <TzJobCard
          u={u}
          check={auto.check}
          rows={
            <>
              {auto.templateName ? (
                <JobRow label="Шаблон">
                  {auto.templateName}
                  {banner?.presetWhy ? ` — ${banner.presetWhy}` : ""}
                </JobRow>
              ) : null}
              {job!.sizes.length ? (
                <JobRow label="Размеры">{job!.sizes.map((s) => `${s.w}×${s.h}${s.label ? ` (${s.label})` : ""}`).join(", ")}</JobRow>
              ) : null}
            </>
          }
        >
          {auto.candidates?.length ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Варианты на разных шаблонах</div>
              <div className="flex flex-wrap gap-3">
                {auto.candidates.map((c) => (
                  <button key={c.key} type="button" onClick={() => onShowResult(c.image)} className="w-28 text-left" title="Показать">
                    <img
                      src={c.image}
                      alt=""
                      className={`h-20 w-28 rounded-md object-cover ${auto.chosen === c.key ? "ring-2 ring-accent-green" : "opacity-80"}`}
                    />
                    <div className="mt-1 text-[11px] leading-tight">
                      {c.key === "A" ? "А" : "Б"} · {c.template}
                      <br />
                      <span className="text-muted-foreground">
                        {c.check ? `по ТЗ: ${c.check.results.filter((r) => r.ok).length}/${c.check.results.length}` : "без проверки"}
                      </span>
                      {auto.chosen === c.key ? <span className="text-accent-green"> · выбран</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {many ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Креативы в ТЗ: {job!.banners.length}</div>
              <div className="flex flex-col gap-1.5">
                {job!.banners.map((b, i) => {
                  const res = auto.results.find((r) => r.index === i);
                  const now = i === auto.bannerIndex && auto.phase !== "done";
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        {res ? (
                          <button type="button" onClick={() => onShowResult(res.image)} title="Показать">
                            <img src={res.image} alt="" className="h-8 w-8 rounded object-cover" />
                          </button>
                        ) : (
                          <span className="h-8 w-8 shrink-0 rounded bg-white/5" />
                        )}
                        <span className={`truncate ${i === auto.bannerIndex ? "font-medium" : ""}`}>
                          {i + 1}. {b.name} · {b.aspect}
                        </span>
                      </span>
                      {res ? (
                        <Check className="h-4 w-4 shrink-0 text-accent-green" />
                      ) : now && busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-green" />
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onMakeBanner(i)}
                          className="shrink-0 rounded-md border border-border px-2 py-0.5 hover:border-foreground/40 disabled:opacity-50"
                        >
                          Сделать
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </TzJobCard>
      ) : null}
    </div>
  );
}
