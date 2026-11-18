"use client";

// Простой режим GIF-генератора: ТЗ в любом виде → «Создать». Движок ТЗ решает,
// анимировать ли приложенный готовый баннер или сделать новый, под какую сеть,
// какие размеры и какое движение. Здесь — ввод, ход работы и карточка «Как я понял
// ТЗ» с GIF-решениями. Оркестровка — в GifGenApp.
import { AutoSteps } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { GIF_NETWORK_BY_ID } from "@/lib/gifNetworks";
import type { TzCheck, TzRunInput, TzUnderstood } from "@/lib/tz/client";
import type { GifTzPlan } from "@/lib/tz/plans/gif";

export type GifAutoPhase = "reading" | "planning" | "generating" | "checking" | "fixing" | "gif" | "done" | "error";

export type GifAutoState = {
  phase: GifAutoPhase;
  error?: string;
  /** На каком шаге упало — там и показываем ошибку. */
  failedAt?: GifAutoPhase;
  u?: TzUnderstood;
  plan?: GifTzPlan;
  /** Откуда баннер: приложен в ТЗ / сделан по шаблону. */
  from?: "attached" | "generated";
  templateName?: string;
  /** Баннер-исходник, когда он уже есть. */
  image?: string;
  check?: TzCheck | null;
  retried?: boolean;
  /** Размеры, которые собираем, и что сеть не принимает. */
  sizes?: string[];
  skipped?: string[];
  /** Итог сборки: сколько GIF прошли требования сети. */
  built?: { done: number; ok: number; failed: number };
};

const MOTION_LABEL: Record<GifTzPlan["motion"], string> = {
  auto: "по сети и формату",
  scene: "сцена — надписи влетают, оффер бьётся, кнопка выскакивает",
  light: "лёгкое — двигаются кнопка, блик и искры",
  slides: "по кадрам — заголовок, оффер, бренд по очереди",
  flat: "только блик и искры поверх баннера",
};

export function SimpleGifPanel({
  auto,
  busy,
  estimate,
  onRun,
}: {
  auto: GifAutoState | null;
  busy: boolean;
  estimate: string;
  onRun: (input: TzRunInput) => void;
}) {
  const u = auto?.u;
  const plan = auto?.plan;
  const generated = auto?.from === "generated" || (!auto?.from && plan?.source !== "attached");
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки" },
    ...(auto?.from === "attached"
      ? [{ id: "checking", label: "Беру баннер из ТЗ и проверяю по требованиям" }]
      : [
          { id: "planning", label: "Выбираю шаблон и пишу описание баннера" },
          { id: "generating", label: "Генерирую баннер" },
          { id: "checking", label: auto?.phase === "fixing" ? "Исправляю то, что не прошло проверку" : "Проверяю баннер по требованиям ТЗ" },
        ]),
    { id: "gif", label: "Собираю слои и GIF под сеть" },
  ];
  const current =
    !auto || auto.phase === "done"
      ? null
      : auto.phase === "error"
        ? auto.failedAt === "fixing"
          ? "checking"
          : (auto.failedAt ?? "reading")
        : auto.phase === "fixing"
          ? "checking"
          : auto.phase;
  const net = plan ? GIF_NETWORK_BY_ID.get(plan.network) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy}
        estimate={estimate}
        placeholder={
          "Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, тексты, сеть (Google Ads, ExoClick…), размеры GIF, ссылки.\nМожно приложить готовый баннер — анимируем его; нет баннера — сделаем новый. Файл ТЗ (.docx, .pdf) и картинки — перетащить сюда."
        }
        options={[{ id: "useAttached", label: "Если в ТЗ приложен готовый баннер — анимировать его", default: true }]}
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
              <JobRow label="Баннер">
                {auto?.from === "attached"
                  ? "готовый из ТЗ — анимирую его"
                  : `новый${auto?.templateName ? ` по шаблону «${auto.templateName}»` : ""}${generated && u.job.banners[0]?.presetWhy ? ` — ${u.job.banners[0].presetWhy}` : ""}`}
              </JobRow>
              <JobRow label="Сеть">
                {net?.label ?? plan.network}
                {plan.networkWhy ? ` — ${plan.networkWhy}` : ""}
              </JobRow>
              {auto?.sizes?.length ? (
                <JobRow label="Размеры">
                  {auto.sizes.map((k) => k.replace("x", "×")).join(", ")}
                  {auto.skipped?.length ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {net?.label} не принимает: {auto.skipped.map((k) => k.replace("x", "×")).join(", ")}
                    </span>
                  ) : null}
                </JobRow>
              ) : null}
              <JobRow label="Движение">
                {MOTION_LABEL[plan.motion]}
                {plan.motionWhy ? ` — ${plan.motionWhy}` : ""}
              </JobRow>
              <JobRow label="Повторы">{plan.loops ? `${plan.loops} раз${net?.maxSeconds ? ` (не дольше ${net.maxSeconds} с)` : ""}` : net?.maxSeconds ? `сколько влезет в ${net.maxSeconds} с` : "бесконечно"}</JobRow>
              {auto?.built ? (
                <JobRow label="Итог">
                  GIF готово {auto.built.done}
                  {auto.built.ok < auto.built.done ? `, по требованиям сети проходят ${auto.built.ok}` : ", все проходят требования сети"}
                  {auto.built.failed ? `, не собралось ${auto.built.failed}` : ""}
                </JobRow>
              ) : null}
            </>
          }
        >
          {auto?.image ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={auto.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <span className="text-xs text-muted-foreground">
                {auto.from === "attached" ? "Баннер из ТЗ — сохранён в Историю, слои GIF сохранятся в его карточку." : "Новый баннер — уже в Истории, слои GIF сохранятся в его карточку."}
                {auto.retried ? " Баннер перегенерирован один раз: первая версия не прошла проверку по ТЗ." : ""}
                {auto.from === "attached" && auto.check?.results.some((r) => !r.ok) ? " Готовый баннер не перерисовываю — что не прошло проверку, отмечено ниже." : ""}
              </span>
            </div>
          ) : null}
        </TzJobCard>
      ) : null}
    </div>
  );
}
