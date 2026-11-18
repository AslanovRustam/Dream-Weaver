"use client";

// Простой режим GIF-генератора: ТЗ в любом виде → «Создать». Движок ТЗ решает,
// анимировать ли приложенный готовый баннер или сделать новый, под какую сеть,
// какие размеры и какое движение. Здесь — один поток сверху вниз: ввод → ход
// работы → план (если нужен) или «Как я понял ТЗ» → итог проверки → правка и
// «что дальше». Оркестровка — в GifGenApp.
import { ImagePlay } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { CheckOutcome } from "@/components/simple/CheckOutcome";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import { GIF_NETWORK_BY_ID, type GifMode, type GifNetworkId } from "@/lib/gifNetworks";
import type { GeneratePayload } from "@/lib/imageGen";
import type { TzCheck, TzRequirement, TzRunInput, TzUnderstood } from "@/lib/tz/client";
import type { GifTzPlan } from "@/lib/tz/plans/gif";

export type GifAutoPhase =
  | "reading"
  | "review"
  | "planning"
  | "generating"
  | "checking"
  | "fixing"
  | "verdict"
  | "gif"
  | "done"
  | "error";

/** Фазы, в которых автопилот работает сам (остальные ждут человека или закончены). */
export const GIF_WORKING = new Set<GifAutoPhase>(["reading", "planning", "generating", "checking", "fixing", "gif"]);

export type GifSource =
  | { kind: "card"; id: string; name: string; image: string }
  | { kind: "upload"; name: string; image: string };

/** Сборка GIF: баннер, сеть, размеры, движение, повторы. */
export type GifRun = { image: string; net: GifNetworkId; sizes: string[]; mode?: GifMode; plays: number };

/** Всё состояние автопилота — оно же снимок для восстановления после перезагрузки. */
export type GifAutoState = {
  phase: GifAutoPhase;
  error?: string;
  /** На каком шаге упало — там и показываем ошибку. */
  failedAt?: GifAutoPhase;
  /** Прервано перезагрузкой страницы (восстановлено из снимка). */
  interrupted?: boolean;
  log?: string[];
  input?: TzRunInput;
  /** Баннер, переданный другим инструментом. */
  handoffImage?: string;
  u?: TzUnderstood;
  plan?: GifTzPlan;
  /** Откуда баннер: приложен в ТЗ / сделан по шаблону. */
  from?: "attached" | "generated";
  /** Готовый баннер из ТЗ (data URL / ссылка). */
  attached?: string;
  cost?: number;
  costNote?: string;
  templateName?: string;
  /** Форма мастер-баннера — основа для исправлений и правок. */
  payload?: GeneratePayload;
  source?: GifSource;
  /** Баннер-исходник, когда он уже есть. */
  image?: string;
  check?: TzCheck | null;
  /** Требования, по которым проверялся баннер. */
  reqs?: TzRequirement[];
  retried?: boolean;
  accepted?: boolean;
  /** Размеры, которые собираем, и что сеть не принимает. */
  sizes?: string[];
  skipped?: string[];
  run?: GifRun;
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

/** Примеры GIF-задач под полем ТЗ. */
export const GIF_TZ_EXAMPLES: TzExample[] = [
  {
    label: "GIF для Google Ads",
    text: "Анимированные GIF для КМС Google Ads: онлайн-казино, 150% на первый депозит + 100 фриспинов. Размеры 300×250, 728×90, 160×600, 320×50. Тексты на русском, кнопка «Играть», 18+. Стиль — ночной неон и золото.",
  },
  {
    label: "Оживить готовый баннер",
    text: "Прикладываю готовый баннер — сделайте из него GIF под ExoClick, 300×250 и 300×100, до 150 КБ. В самом баннере ничего не менять: только лёгкая анимация — блик и пульсирующая кнопка.",
  },
  {
    label: "Беттинг по кадрам",
    text: "GIF для TrafficStars: фрибет 1000 ₽ на матч «Спартак» — «Зенит», 12 мая. Кадры по очереди: матч → фрибет → кнопка «Сделать ставку». Размеры 300×250 и 320×50. Русский язык, 18+.",
  },
  {
    label: "Слот, без лимита веса",
    text: "GIF для сайта партнёра, вес не ограничен: новый слот с драконами и золотом, 200 фриспинов без депозита. Английский язык, кнопка «Play now». Максимум движения. Размеры 1080×1080 и 1200×628.",
  },
];

/** Решения GIF строками JobRow — для карточки «Как я понял ТЗ» и для плана перед запуском. */
function Decisions({ auto }: { auto: GifAutoState }) {
  const { u, plan } = auto;
  if (!u || !plan) return null;
  const net = GIF_NETWORK_BY_ID.get(plan.network);
  return (
    <>
      <JobRow label="Баннер">
        {auto.from === "attached"
          ? "готовый из ТЗ — анимирую его, не перерисовывая"
          : `новый${auto.templateName ? ` по шаблону «${auto.templateName}»` : ""}${u.job.banners[0]?.presetWhy ? ` — ${u.job.banners[0].presetWhy}` : ""}`}
      </JobRow>
      <JobRow label="Сеть">
        {net?.label ?? plan.network}
        {plan.networkWhy ? ` — ${plan.networkWhy}` : ""}
      </JobRow>
      {auto.sizes?.length ? (
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
      <JobRow label="Повторы">
        {plan.loops
          ? `${plan.loops} раз${net?.maxSeconds ? ` (не дольше ${net.maxSeconds} с)` : ""}`
          : net?.maxSeconds
            ? `сколько влезет в ${net.maxSeconds} с`
            : "бесконечно"}
      </JobRow>
      {auto.built ? (
        <JobRow label="Итог">
          GIF готово {auto.built.done}
          {auto.built.ok < auto.built.done ? `, по требованиям сети проходят ${auto.built.ok}` : ", все проходят требования сети"}
          {auto.built.failed ? `, не собралось ${auto.built.failed}` : ""}
        </JobRow>
      ) : null}
    </>
  );
}

export function SimpleGifPanel({
  auto,
  busy,
  hasResults,
  estimate,
  retryCost,
  tweakCost,
  onRun,
  onGate,
  onBackToInput,
  onRetry,
  onRebuild,
  onAccept,
  onRetryCheck,
  onTweak,
}: {
  auto: GifAutoState | null;
  /** Автопилот или сборка сейчас работают. */
  busy: boolean;
  /** GIF уже на экране (после перезагрузки их нет — только снимок). */
  hasResults: boolean;
  estimate: string;
  /** Ещё одна попытка баннера после проверки, кр. */
  retryCost: number;
  /** Подпись цены правки. */
  tweakCost: string;
  onRun: (input: TzRunInput) => void;
  onGate: (clarifications: string) => void;
  onBackToInput: () => void;
  onRetry: () => void;
  onRebuild: () => void;
  onAccept: () => void;
  onRetryCheck: () => void;
  onTweak: (text: string) => void;
}) {
  const u = auto?.u;
  const phase = auto?.phase;
  const steps = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки" },
    ...(auto?.from === "attached"
      ? [{ id: "checking", label: "Беру баннер из ТЗ и проверяю по требованиям" }]
      : [
          { id: "planning", label: "Выбираю шаблон и пишу описание баннера" },
          { id: "generating", label: "Генерирую баннер" },
          { id: "checking", label: phase === "fixing" ? "Исправляю то, что не прошло проверку" : "Проверяю баннер по требованиям ТЗ" },
          ...(phase === "verdict" || auto?.accepted ? [{ id: "verdict", label: "Жду решения: баннер не во всём по ТЗ" }] : []),
        ]),
    { id: "gif", label: "Собираю слои и GIF под сеть" },
  ];
  const current =
    !auto || phase === "done"
      ? null
      : phase === "error"
        ? auto.failedAt === "fixing"
          ? "checking"
          : (auto.failedAt ?? "reading")
        : phase === "fixing"
          ? "checking"
          : (phase ?? null);
  const generated = auto?.from === "generated";

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        tool="gif"
        examples={GIF_TZ_EXAMPLES}
        busy={busy}
        estimate={estimate}
        placeholder={
          "Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, тексты, сеть (Google Ads, ExoClick…), размеры GIF, ссылки.\nМожно приложить готовый баннер — анимируем его; нет баннера — сделаем новый. Файл ТЗ (.docx, .pdf) и картинки — перетащить сюда."
        }
        options={[{ id: "useAttached", label: "Если в ТЗ приложен готовый баннер — анимировать его", default: true }]}
        onRun={onRun}
      />

      {auto && phase !== "review" ? (
        <AutoSteps
          steps={steps}
          current={current}
          done={phase === "done"}
          error={phase === "error" ? auto.error : undefined}
          log={auto.log}
          onRetry={onRetry}
          retryLabel={auto.interrupted ? "Продолжить с того же места" : "Запустить снова"}
        />
      ) : null}

      {auto && u && phase === "review" ? (
        <TzPlanGate u={u} cost={auto.cost ?? null} costNote={auto.costNote} busy={busy} onRun={onGate} onEdit={onBackToInput}>
          <p>{u.job.summary}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <Decisions auto={auto} />
          </dl>
        </TzPlanGate>
      ) : auto && u ? (
        <TzJobCard u={u} check={auto.check} rows={<Decisions auto={auto} />}>
          {auto.image ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={auto.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <span className="text-xs text-muted-foreground">
                {auto.from === "attached"
                  ? "Баннер из ТЗ — сохранён в Историю, слои GIF сохранятся в его карточку."
                  : "Новый баннер — уже в Истории, слои GIF сохранятся в его карточку."}
                {auto.retried ? " Баннер перегенерирован один раз: первая версия не прошла проверку по ТЗ." : ""}
                {auto.from === "attached" && auto.check?.results.some((r) => !r.ok)
                  ? " Готовый баннер не перерисовываю — что не прошло проверку, отмечено ниже."
                  : ""}
              </span>
            </div>
          ) : null}
        </TzJobCard>
      ) : null}

      {auto && generated && auto.check && auto.reqs && (phase === "verdict" || auto.accepted) ? (
        <CheckOutcome
          check={auto.check}
          requirements={auto.reqs}
          retryCost={retryCost}
          busy={busy}
          accepted={auto.accepted}
          onRetry={onRetryCheck}
          onAccept={onAccept}
        />
      ) : null}

      {auto && u && phase === "done" ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-3">
          {!hasResults && auto.source ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRebuild}
              className="flex items-center justify-center gap-2 rounded-lg border border-accent-green/50 px-3 py-2 text-sm transition hover:bg-accent-green/10 disabled:opacity-50"
            >
              <ImagePlay className="h-4 w-4" /> Показать GIF снова — слои уже в Истории
            </button>
          ) : null}
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">
              {generated ? "Поправить баннер словами — перегенерирую, проверю и соберу GIF заново" : "Поправить GIF словами"}
            </div>
            <TzEditBox
              onEdit={onTweak}
              busy={busy}
              costLabel={tweakCost}
              placeholder={
                generated
                  ? "Что поправить? Например: фон темнее, крупнее оффер, персонаж — мужчина"
                  : "Баннер клиента не перерисовываю — правьте анимацию, сеть и размеры: «по кадрам», «добавь 728×90», «под ExoClick»"
              }
              examples={generated ? ["Фон темнее", "Крупнее оффер", "Другой персонаж"] : ["По кадрам", "Только блик", "Добавь 728×90"]}
            />
          </div>
          {auto.input ? <NextTools from="gif" understood={u} input={auto.input} image={auto.source?.image} /> : null}
        </div>
      ) : null}
    </div>
  );
}
