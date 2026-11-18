"use client";

// Простой режим баннер-генератора (и «Слоёв»): ТЗ в любом виде → «Создать».
// Остальное решает движок ТЗ (src/lib/tz): задача, шаблон, тексты, размеры,
// референсы. Здесь — общий ввод, ход работы и карточка «Как я понял ТЗ» с
// баннерными решениями. Оркестровка — в ImageGenApp.
import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import type { TzCheck, TzImage, TzLinkInfo, TzSource } from "@/lib/tz/client";
import type { TzJob } from "@/lib/tz/understand";

export type AutoPhase = "reading" | "planning" | "generating" | "checking" | "fixing" | "resizing" | "done" | "error";

export type AutoState = {
  phase: AutoPhase;
  error?: string;
  job?: TzJob;
  images?: TzImage[];
  links?: TzLinkInfo[];
  sources?: TzSource[];
  /** Какой баннер из задания делаем сейчас. */
  bannerIndex: number;
  templateName?: string;
  ideas?: string[];
  check?: TzCheck;
  retried?: boolean;
  /** Описание баннера от арт-директора — основа для попытки исправления. */
  prompt?: string;
  wantResizes: boolean;
};

export type SimpleInput = { text: string; files: { name: string; base64: string }[]; images: string[]; wantResizes: boolean };

export function SimpleBannerPanel({
  auto,
  busy,
  estimate,
  onRun,
  onMakeBanner,
}: {
  auto: AutoState | null;
  busy: boolean;
  estimate: string;
  onRun: (input: SimpleInput) => void;
  onMakeBanner: (index: number) => void;
}) {
  const job = auto?.job;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: "Выбираю шаблон и пишу описание баннера" },
    { id: "generating", label: "Генерирую баннер" },
    { id: "checking", label: auto?.phase === "fixing" ? "Исправляю то, что не прошло проверку" : "Проверяю баннер по требованиям ТЗ" },
    ...(auto?.wantResizes ? [{ id: "resizing", label: "Запускаю ресайзы под площадки" }] : []),
  ];
  const current =
    !auto || auto.phase === "done" ? null : auto.phase === "fixing" ? "checking" : auto.phase === "error" ? "reading" : auto.phase;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy}
        estimate={estimate}
        options={[{ id: "resizes", label: "Сразу сделать ресайзы под площадки из ТЗ", default: true }]}
        onRun={(i) => onRun({ text: i.text, files: i.files, images: i.images, wantResizes: !!i.options.resizes })}
      />

      {auto ? <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} /> : null}

      {job ? (
        <TzJobCard
          u={{ job, images: auto?.images ?? [], links: auto?.links ?? [], sources: auto?.sources ?? [] }}
          check={auto?.check}
          rows={
            <>
              {auto?.templateName ? (
                <JobRow label="Шаблон">
                  {auto.templateName}
                  {job.banners[auto.bannerIndex]?.presetWhy ? ` — ${job.banners[auto.bannerIndex].presetWhy}` : ""}
                </JobRow>
              ) : null}
              {job.sizes.length ? (
                <JobRow label="Размеры">{job.sizes.map((s) => `${s.w}×${s.h}${s.label ? ` (${s.label})` : ""}`).join(", ")}</JobRow>
              ) : null}
            </>
          }
        >
          {job.banners.length > 1 ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Креативы в ТЗ: {job.banners.length}</div>
              <div className="flex flex-col gap-1.5">
                {job.banners.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className={i === auto?.bannerIndex ? "font-medium" : ""}>
                      {i + 1}. {b.name} · {b.aspect}
                    </span>
                    {i !== auto?.bannerIndex ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMakeBanner(i)}
                        className="rounded-md border border-border px-2 py-0.5 hover:border-foreground/40 disabled:opacity-50"
                      >
                        Сделать
                      </button>
                    ) : (
                      <span className="text-accent-green">текущий</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </TzJobCard>
      ) : null}
    </div>
  );
}
