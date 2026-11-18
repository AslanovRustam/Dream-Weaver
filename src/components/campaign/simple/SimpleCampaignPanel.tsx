"use client";

// Простой режим кампании: ТЗ в любом виде, галочки частей → «Создать».
// Один поток сверху вниз: ввод → ход работы (с живым журналом) → план с ценой
// и решением по каждой части («Запускаем») → тексты и графика → итог: архив,
// проверка баннеров по ТЗ, правка словами, «дальше по этому ТЗ» → карточка
// «Как я понял ТЗ». Оркестровка — в CampaignApp.
import Link from "next/link";
import { AlertTriangle, Check, Download, Loader2, X } from "lucide-react";

import { PRESETS } from "@/components/PresetSidebar";
import { AutoSteps } from "@/components/simple/AutoSteps";
import { CheckOutcome } from "@/components/simple/CheckOutcome";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import { EMAIL_TEMPLATES } from "@/lib/emailTemplates";
import { SCENES } from "@/lib/scenes/presets";
import type { TzCheck, TzRequirement, TzRunInput, TzUnderstood } from "@/lib/tz/client";
import type { AssetStepState } from "@/lib/useAssetRun";
import { briefHeadline, type CampaignBrief, type CampaignPart } from "@/lib/campaign";
import type { CampaignDecisions, JobImages, SimpleBannerSpec } from "./fromJob";

export type CampaignAutoPhase = "reading" | "planning" | "review" | "copy" | "generating" | "checking" | "fixing" | "done" | "error";

/** Проверка одного баннера по ТЗ. */
export type BannerCheck = { check: TzCheck; fixed: boolean; accepted?: boolean; busy?: boolean };

export type CampaignAuto = {
  phase: CampaignAutoPhase;
  /** На каком шаге остановились с ошибкой (или перезагрузкой). */
  failedAt?: CampaignAutoPhase;
  error?: string;
  /** Живой журнал: строки разбора ТЗ и свои. */
  log?: string[];
  /** Исходный ввод — для повтора и «дальше по этому ТЗ». */
  input?: TzRunInput;
  u?: TzUnderstood;
  d?: CampaignDecisions;
  img?: JobImages;
  /** Сколько картинок и кредитов ушло в графику. */
  count?: number;
  credits?: number;
  /** Проверка баннеров: индекс баннера → итог. */
  checks?: Record<number, BannerCheck>;
};

const EXAMPLES: TzExample[] = [
  {
    label: "Хэллоуин в казино",
    text: "Кампания к Хэллоуину для казино: лендинг с игрой, плейбл, письмо и баннеры 1200×628 и 1080×1920. Оффер: 150% на депозит + 100 фриспинов. Английский язык. Тыквы, туман, фиолетово-оранжевый неон. Кнопка «Claim bonus». 18+.",
  },
  {
    label: "Plinko для Казахстана",
    text: "Промо игры Plinko для Казахстана: имитация игры (плейбл) и лендинг, где шарик падает на множители. Оффер: до 500 000 ₸ на первый депозит. Тексты на русском. Ссылка https://example.com/go. Бренд — по сайту example.com.",
  },
  {
    label: "Финал ЛЧ — ставки",
    text: "Кампания ставок на финал Лиги чемпионов: лендинг с прогнозом на матч, письмо игрокам и баннер 16:9. Фрибет 1000 ₽ за первую ставку. Русский язык, ночной стадион, золото кубка. Кнопка «Сделать ставку».",
  },
  {
    label: "Возврат игроков",
    text: "Реактивация неактивных игроков казино: письмо и баннер 1:1. 50 фриспинов без депозита в слоте с египетской тематикой. Немецкий язык. Кнопка «Jetzt spielen». 18+, правила акции на сайте.",
  },
];

const PART_LABEL: Record<CampaignPart, string> = { landing: "Лендинг", playable: "Плейбл", email: "Письмо", banner: "Баннеры" };
const MECH_LABEL: Record<string, string> = { wheel: "колесо фортуны", slot: "слот", crash: "crash-игра", match: "прогноз на матч" };
const OFF_LABEL = { tick: "не делаем — снята галочка", brief: "не делаем — по ТЗ не нужно", section: "не делаем — раздел закрыт" };
const sceneLabel = (id: string) => SCENES.find((s) => s.id === id)?.label ?? id;

/** Строки «часть — решение — почему» (план перед запуском и карточка). */
function PartRows({ d, brief, u }: { d: CampaignDecisions; brief: CampaignBrief; u: TzUnderstood }) {
  const specs = (brief.banners ?? []) as SimpleBannerSpec[];
  const what = (id: CampaignPart): string => {
    if (id === "landing") return brief.landing === "scene" ? `игра «${sceneLabel(brief.scene)}»` : MECH_LABEL[brief.landing] ?? brief.landing;
    if (id === "playable") return `«${sceneLabel(brief.scene)}»`;
    if (id === "email") return EMAIL_TEMPLATES.find((t) => t.id === brief.emailTemplate)?.name ?? brief.emailTemplate ?? "";
    return (specs.length ? specs : [{ name: "Баннер", aspect: "16:9" }]).map((s) => `${s.name} · ${s.aspect}`).join("; ");
  };
  const tplName = PRESETS.find((p) => p.id === specs[0]?.presetId)?.name;
  const tplWhy = u.job.banners[0]?.presetWhy;
  const on = (id: CampaignPart) => !!d.parts.find((p) => p.id === id)?.on;
  return (
    <>
      {d.parts.map((p) => (
        <JobRow key={p.id} label={PART_LABEL[p.id]}>
          {p.on ? (
            <>
              <b className="font-medium">{what(p.id)}</b>
              {p.why ? ` — ${p.why}` : ""}
              {p.id === "banner" && tplName ? (
                <span className="block text-muted-foreground">
                  Шаблон «{tplName}»{tplWhy ? ` — ${tplWhy}` : ""}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">
              {p.off ? OFF_LABEL[p.off] : "не делаем"}
              {p.off === "brief" && p.why ? ` (${p.why})` : ""}
            </span>
          )}
        </JobRow>
      ))}
      {on("email") && !on("banner") ? <JobRow label="Шапка письма">первый баннер без текстов — рисуем только как основу</JobRow> : null}
    </>
  );
}

export function SimpleCampaignPanel({
  auto,
  busy,
  estimate,
  showPlayable,
  brief,
  run,
  cost,
  costNote,
  bannerImages,
  bannerCost,
  editCost,
  onRun,
  onConfirm,
  onEditTz,
  onRetry,
  onCancel,
  onDownload,
  onRetryBanner,
  onAcceptBanner,
  onEditStyle,
  reqsFor,
  zipping,
}: {
  auto: CampaignAuto | null;
  busy: boolean;
  estimate: string;
  showPlayable: boolean;
  /** Текущий бриф — что в итоге ушло в части (заголовок, кнопка, ссылка, баннеры). */
  brief: CampaignBrief;
  run: { steps: AssetStepState[]; running: boolean; notEnough: string };
  /** Цена запуска по плану (отмеченные части) и из чего она. */
  cost: number;
  costNote: string;
  /** Готовые баннеры — по порядку заданий. */
  bannerImages: (string | undefined)[];
  bannerCost: number;
  /** Цена правки стиля — перерисовка всей графики. */
  editCost: number;
  onRun: (input: TzRunInput) => void;
  onConfirm: (clarifications: string) => void;
  onEditTz: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onRetryBanner: (i: number) => void;
  onAcceptBanner: (i: number) => void;
  onEditStyle: (text: string) => void;
  reqsFor: (i: number) => TzRequirement[];
  zipping: boolean;
}) {
  const d = auto?.d;
  const u = auto?.u;
  const wantBanner = !!d?.parts.find((p) => p.id === "banner")?.on;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы, ссылки и картинки" },
    { id: "planning", label: "Решаю, что и как делать: части, игра, письмо, баннеры, стиль" },
    { id: "copy", label: "Пишу тексты для всех частей" },
    {
      id: "generating",
      label: auto?.credits ? `Рисую графику в одной теме: ${auto.count} шт. · ${auto.credits} кр.` : "Рисую графику в одной теме",
    },
    ...(wantBanner || !d ? [{ id: "checking", label: auto?.phase === "fixing" ? "Исправляю баннер, не прошедший проверку" : "Проверяю баннеры по ТЗ" }] : []),
  ];
  const review = auto?.phase === "review";
  const current =
    !auto || auto.phase === "done" ? null : auto.phase === "error" ? (auto.failedAt ?? "reading") : auto.phase === "fixing" ? "checking" : auto.phase;
  // Пока рисуем — в журнале то, что рисуется сейчас.
  const log =
    auto?.phase === "generating"
      ? [
          ...run.steps.filter((s) => s.status === "done").slice(-2).map((s) => `Готово: ${s.label}`),
          ...run.steps.filter((s) => s.status === "running").map((s) => `Рисую: ${s.label}`),
        ]
      : (auto?.log ?? []);
  const failed = run.steps.filter((s) => s.status === "error").length;
  const doneSteps = run.steps.filter((s) => s.status === "done").length;
  const specs = (brief.banners ?? []) as SimpleBannerSpec[];
  const showRun = run.steps.length > 0 && (auto ? ["generating", "checking", "fixing", "done"].includes(auto.phase) : run.running);

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        tool="campaign"
        examples={EXAMPLES}
        busy={busy}
        estimate={estimate}
        options={[
          { id: "landing", label: "Лендинг с мини-игрой", default: true },
          ...(showPlayable ? [{ id: "playable", label: "Плейбл", default: true }] : []),
          { id: "email", label: "Письмо", default: true },
          { id: "banner", label: "Баннеры (размеры — из ТЗ)", default: true },
        ]}
        onRun={onRun}
      />

      {auto ? (
        review ? (
          <AutoSteps steps={steps.slice(0, 2)} current={null} done />
        ) : (
          <AutoSteps
            steps={steps}
            current={current}
            done={auto.phase === "done"}
            error={auto.phase === "error" ? auto.error : undefined}
            log={log}
            onRetry={auto.phase === "error" ? onRetry : undefined}
            retryLabel={auto.error === "Прервано перезагрузкой" ? "Продолжить" : "Запустить снова"}
          />
        )
      ) : null}

      {review && u && d ? (
        <TzPlanGate u={u} cost={cost} costNote={costNote} busy={busy} onRun={onConfirm} onEdit={onEditTz}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <JobRow label="Тема">
              {d.roll.themeName}
              {d.plan.visualWhy ? ` — ${d.plan.visualWhy}` : ""}
            </JobRow>
            <PartRows d={d} brief={brief} u={u} />
          </dl>
        </TzPlanGate>
      ) : null}

      {showRun ? (
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Графика: готово {doneSteps} из {run.steps.length}
              {failed ? ` · не вышло ${failed} (кредиты за них не списаны)` : ""}
            </span>
            {run.running ? (
              <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Отменить оставшиеся
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1">
            {run.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                {s.status === "done" ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent-green" />
                ) : s.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : s.status === "error" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span className={s.status === "done" ? "" : "text-muted-foreground"}>
                  {s.label}
                  {s.status === "error" && s.error ? <span className="block text-amber-400/90">{s.error}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {auto?.phase === "done" ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onDownload}
            disabled={zipping}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {zipping ? "Собираем…" : "Скачать всё — ZIP"}
          </button>
          <p className="-mt-2 text-center ds-caption">
            Превью каждой части — справа.{" "}
            <Link href="/campaign/view" className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline">
              Страница кампании — все материалы
            </Link>
          </p>

          {Object.entries(auto.checks ?? {}).map(([k, c]) => {
            const i = Number(k);
            const img = bannerImages[i];
            if (!c.check.results.some((r) => !r.ok) && !c.check.faceCovered) return null;
            return (
              <div key={k} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? <img src={img} alt="" className="h-10 w-auto rounded-md border border-border" /> : null}
                  {specs[i] ? `${specs[i].name} · ${specs[i].aspect}` : `Баннер ${i + 1}`}
                </div>
                <CheckOutcome
                  check={c.check}
                  requirements={reqsFor(i)}
                  retryCost={bannerCost}
                  busy={c.busy || busy}
                  accepted={c.accepted}
                  onRetry={() => onRetryBanner(i)}
                  onAccept={() => onAcceptBanner(i)}
                />
              </div>
            );
          })}

          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">Поправить стиль всей кампании</div>
            <TzEditBox
              busy={busy}
              onEdit={onEditStyle}
              costLabel={`≈ ${editCost} кр. — перерисуем всю графику кампании, тексты останутся`}
              placeholder="Например: темнее и дороже, больше золота, без персонажей"
              examples={["Темнее и дороже", "Больше золота", "Ярче и праздничнее"]}
            />
          </div>

          {u && auto.input ? <NextTools from="campaign" understood={u} input={auto.input} image={bannerImages[0]} /> : null}
        </div>
      ) : null}

      {u && d ? (
        <TzJobCard
          u={u}
          rows={
            <>
              <JobRow label="Тип трафика">
                {d.plan.kind === "sport" ? "Ставки на спорт" : "Казино"}
                {d.plan.kindWhy ? ` — ${d.plan.kindWhy}` : ""}
              </JobRow>
              {!review ? (
                <>
                  <JobRow label="Тема">
                    {d.roll.themeName}
                    {d.plan.visualWhy ? ` — ${d.plan.visualWhy}` : ""}
                  </JobRow>
                  <PartRows d={d} brief={brief} u={u} />
                </>
              ) : null}
              {d.langNote ? <JobRow label="Язык">{d.langNote}</JobRow> : null}
              <JobRow label="Заголовок">
                {briefHeadline(brief)}
                {d.plan.headlineFromBrief ? " (из ТЗ)" : ""}
              </JobRow>
              <JobRow label="Кнопка">{brief.cta}</JobRow>
              <JobRow label="Ссылка">{brief.link ? `${brief.link}${d.linkFrom === "site" ? " (сайт бренда — трекера в ТЗ нет)" : ""}` : "нет в ТЗ"}</JobRow>
              {auto?.img ? (
                <>
                  <JobRow label="Лого">{auto.img.logoFrom === "brief" ? "из ТЗ" : auto.img.logoFrom === "site" ? "с сайта бренда" : "нет — бренд текстом"}</JobRow>
                  <JobRow label="Гамма">
                    {auto.img.colorFrom === "brand"
                      ? "фирменный цвет из ТЗ"
                      : auto.img.colorFrom === "site"
                        ? "фирменный цвет с сайта"
                        : auto.img.colorFrom === "ref"
                          ? "с референса"
                          : auto.img.colorFrom === "style"
                            ? "палитра стиля из ТЗ"
                            : "по сгенерированному фону"}
                  </JobRow>
                  {auto.img.refFrom ? <JobRow label="Референс">{auto.img.refFrom === "main" ? "главный визуал — уходит в баннеры" : "персонаж — уходит в баннеры"}</JobRow> : null}
                </>
              ) : null}
            </>
          }
          check={null}
        />
      ) : null}
    </div>
  );
}
