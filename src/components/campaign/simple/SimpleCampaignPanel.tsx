"use client";

// Простой режим кампании: ТЗ в любом виде, галочки частей → «Создать».
// Движок ТЗ решает, что и как делать (части, механика и игра, письмо, баннеры,
// тема и визуал), дальше — тексты всех частей и вся графика в одной теме.
// Здесь — ввод, ход работы, карточка «Как я понял ТЗ» с решением по каждой
// части и прогресс графики. Оркестровка — в CampaignApp.
import Link from "next/link";
import { AlertTriangle, Check, Download, Loader2, X } from "lucide-react";

import { PRESETS } from "@/components/PresetSidebar";
import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { EMAIL_TEMPLATES } from "@/lib/emailTemplates";
import { SCENES } from "@/lib/scenes/presets";
import type { TzRunInput, TzUnderstood } from "@/lib/tz/client";
import type { AssetStepState } from "@/lib/useAssetRun";
import { briefHeadline, type CampaignBrief, type CampaignPart } from "@/lib/campaign";
import type { CampaignDecisions, JobImages, SimpleBannerSpec } from "./fromJob";

export type CampaignAutoPhase = "reading" | "planning" | "copy" | "generating" | "done" | "error";

export type CampaignAuto = {
  phase: CampaignAutoPhase;
  /** На каком шаге остановились с ошибкой. */
  failedAt?: CampaignAutoPhase;
  error?: string;
  u?: TzUnderstood;
  d?: CampaignDecisions;
  img?: JobImages;
  /** Смета графики после решения: картинок и кредитов. */
  count?: number;
  credits?: number;
};

const PART_LABEL: Record<CampaignPart, string> = { landing: "Лендинг", playable: "Плейбл", email: "Письмо", banner: "Баннеры" };
const MECH_LABEL: Record<string, string> = { wheel: "колесо фортуны", slot: "слот", crash: "crash-игра", match: "прогноз на матч" };
const OFF_LABEL = { tick: "не делаем — снята галочка", brief: "не делаем — по ТЗ не нужно", section: "не делаем — раздел закрыт" };
const sceneLabel = (id: string) => SCENES.find((s) => s.id === id)?.label ?? id;

export function SimpleCampaignPanel({
  auto,
  busy,
  estimate,
  showPlayable,
  brief,
  run,
  onRun,
  onCancel,
  onDownload,
  zipping,
}: {
  auto: CampaignAuto | null;
  busy: boolean;
  estimate: string;
  showPlayable: boolean;
  /** Текущий бриф — что в итоге ушло в части (заголовок, кнопка, ссылка, баннеры). */
  brief: CampaignBrief;
  run: { steps: AssetStepState[]; running: boolean; notEnough: string };
  onRun: (input: TzRunInput) => void;
  onCancel: () => void;
  onDownload: () => void;
  zipping: boolean;
}) {
  const d = auto?.d;
  const u = auto?.u;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы, ссылки и картинки" },
    { id: "planning", label: "Решаю, что и как делать: части, игра, письмо, баннеры, стиль" },
    { id: "copy", label: "Пишу тексты всех частей под ТЗ" },
    {
      id: "generating",
      label: auto?.credits ? `Рисую графику в одной теме: ${auto.count} шт. · ${auto.credits} кр.` : "Рисую графику в одной теме",
    },
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? (auto.failedAt ?? "reading") : auto.phase;
  const failed = run.steps.filter((s) => s.status === "error").length;
  const doneSteps = run.steps.filter((s) => s.status === "done").length;

  const what = (id: CampaignPart): string => {
    if (!d) return "";
    if (id === "landing") return brief.landing === "scene" ? `игра «${sceneLabel(brief.scene)}»` : MECH_LABEL[brief.landing] ?? brief.landing;
    if (id === "playable") return `«${sceneLabel(brief.scene)}»`;
    if (id === "email") return EMAIL_TEMPLATES.find((t) => t.id === brief.emailTemplate)?.name ?? brief.emailTemplate ?? "";
    const specs = (brief.banners ?? []) as SimpleBannerSpec[];
    return specs.map((s) => `${s.name} · ${s.aspect}`).join("; ");
  };
  const bannerTpl = ((brief.banners ?? []) as SimpleBannerSpec[])[0]?.presetId;
  const tplName = PRESETS.find((p) => p.id === bannerTpl)?.name;
  const tplWhy = u?.job.banners[0]?.presetWhy;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
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
        <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} />
      ) : null}

      {run.notEnough && auto ? <p className="ds-caption text-amber-400">{run.notEnough}</p> : null}

      {run.steps.length && (auto ? auto.phase === "generating" || auto.phase === "done" : run.running) ? (
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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={zipping}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {zipping ? "Собираем…" : "Скачать всё — ZIP"}
          </button>
          <p className="text-center ds-caption">
            Превью каждой части — справа. Доводить руками — в «Продвинутом» или в редакторе части.{" "}
            <Link href="/campaign/view" className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline">
              Страница кампании
            </Link>
          </p>
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
              <JobRow label="Тема">
                {d.roll.themeName}
                {d.plan.visualWhy ? ` — ${d.plan.visualWhy}` : ""}
              </JobRow>
              {d.langNote ? <JobRow label="Язык">{d.langNote}</JobRow> : null}
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
              {d.parts.find((p) => p.id === "email")?.on && !d.parts.find((p) => p.id === "banner")?.on ? (
                <JobRow label="Шапка письма">первый баннер без текстов — его рисуем только как основу</JobRow>
              ) : null}
              <JobRow label="Заголовок">
                {briefHeadline(brief)}
                {d.plan.headlineFromBrief ? " (из ТЗ)" : ""}
              </JobRow>
              <JobRow label="Кнопка">{brief.cta}</JobRow>
              <JobRow label="Ссылка">{brief.link ? `${brief.link}${d.linkFrom === "site" ? " (сайт бренда — трекера в ТЗ нет)" : ""}` : "нет в ТЗ — впишите в «Продвинутом»"}</JobRow>
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
        />
      ) : null}
    </div>
  );
}
