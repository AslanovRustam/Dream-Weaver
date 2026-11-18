"use client";

// Простой режим плейбла и лендинга на сцене — одним потоком рядом с живым
// превью: ТЗ → ход работы (с живым журналом) → план и цена перед дорогим
// запуском → «Как я понял ТЗ» с решениями по сцене → ссылка по кнопке,
// правка словами и «дальше по этому ТЗ». Оркестровка — в SceneStudio.
import type { ReactNode } from "react";
import { FileText, X } from "lucide-react";

import { AutoSteps } from "@/components/simple/AutoSteps";
import { NextTools } from "@/components/simple/NextTools";
import { TzEditBox } from "@/components/simple/TzEditBox";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import type { TzRunInput, TzUnderstood } from "@/lib/tz/client";
import { NETWORK_BY_ID } from "@/lib/scenes/networks";
import { sceneMeta } from "@/lib/scenes/presets";
import type { PlayablePlan } from "./scenePlan";

export type SceneAutoPhase = "reading" | "planning" | "review" | "art" | "done" | "error";

export type SceneAutoState = {
  phase: SceneAutoPhase;
  error?: string;
  u?: TzUnderstood;
  plan?: PlayablePlan;
  /** Рисовать ли графику ИИ (галочка). */
  art: boolean;
  /** Исходный ввод — для повтора, правок и передачи в другие инструменты. */
  input?: TzRunInput;
  /** Ответы на вопросы и правки — уже дописаны к ТЗ. */
  clar?: string;
  /** Что решил отправитель передачи (лендинг-хаб): сцена, тексты. */
  decided?: Record<string, unknown>;
  /** ТЗ пришло из другого инструмента уже понятым. */
  fromHub?: boolean;
  /** Живой журнал работы. */
  log: string[];
  /** Цена запуска по плану (в воротах). */
  cost?: number;
  /** Решение уже разложено в черновик — повтор начинается с графики. */
  applied?: boolean;
  interrupted?: boolean;
  /** Восстановлено посреди графики — ждём серверную сборку. */
  resumed?: boolean;
};

const EXAMPLES_PLAYABLE: TzExample[] = [
  {
    label: "Aviator, Бразилия",
    text: "Плейбл для Бразилии под AppLovin и Unity: игра как Aviator — самолёт взлетает, множитель растёт. Оффер: 200 rodadas grátis no primeiro depósito. Тексты на португальском, кнопка «Jogar agora». Яркий закат, неон. 18+.",
  },
  {
    label: "Колесо, Узбекистан",
    text: "Плейбл-колесо фортуны для Узбекистана: 100% на первый депозит до 5 000 000 сум + 50 фриспинов. Тексты на узбекском, кнопка «O'ynash». Восточная сказка: ночь, золото, лампа джинна. Размещение — Meta и Google Ads.",
  },
  {
    label: "Пенальти, фрибет",
    text: "Плейбл для беттинга: игрок бьёт пенальти и забирает фрибет 1000 ₽ за первую ставку. Русский язык, вечерний стадион, прожекторы. Кнопка «Забрать фрибет». MRAID-сети. 18+.",
  },
  {
    label: "Сейф, Хэллоуин",
    text: "Хэллоуинский плейбл: вскрыть сейф ведьмы и забрать 150 free spins. Английский язык, тыквы, туман, фиолетово-оранжевый неон. Кнопка «Claim now».",
  },
];

const EXAMPLES_LANDING: TzExample[] = [
  {
    label: "Колесо, Казахстан",
    text: "Лендинг с колесом фортуны для Казахстана: 150% на первый депозит + 100 фриспинов. Тексты на русском, кнопка «Крутить колесо». Тёплое золото, вечерний казино-зал. Ссылка: https://example.com/promo. 18+.",
  },
  {
    label: "Пенальти, финал",
    text: "Лендинг к финалу Лиги чемпионов: игрок бьёт пенальти и получает фрибет 500 ₽ за первую ставку. Русский язык, ночной стадион, вспышки, золото кубка. Кнопка «Сделать ставку». 18+.",
  },
  {
    label: "Скретч-карта, Мексика",
    text: "Лендинг для Мексики: стираешь скретч-карту — под ней 200 giros gratis. Испанский язык, яркая фиеста, папель пикадо, золотые монеты. Кнопка «Reclamar».",
  },
  {
    label: "Plinko, Европа",
    text: "Лендинг под Plinko для Европы: шарик падает на множители, бонус €500 + 100 FS. Английский язык, неоновая аркада. Кнопка «Play Plinko». 18+, T&Cs apply.",
  },
];

/** Решения по сцене — строками: в карточке «Как я понял ТЗ» и в плане перед запуском. */
function PlanRows({ plan, landing }: { plan: PlayablePlan; landing: boolean }) {
  return (
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
        <JobRow label="Сектора">{plan.prizes.map((p, i) => (i === plan.winPrize ? `[${p}]` : p)).join(" · ")}</JobRow>
      ) : null}
      {plan.theme ? <JobRow label="Тема графики">{plan.theme}</JobRow> : null}
      {!landing && plan.networks.length ? (
        <JobRow label="Площадки">{plan.networks.map((n) => NETWORK_BY_ID.get(n)?.label ?? n).join(", ")}</JobRow>
      ) : null}
    </>
  );
}

export function SimpleScenePanel({
  tool,
  auto,
  busy,
  landing,
  estimate,
  log,
  onRun,
  onGateRun,
  onReset,
  onRetry,
  onEdit,
  editCost,
  onCancelArt,
  artPanel,
  nextImage,
  clickUrl,
  onClickUrl,
  urlRequired,
}: {
  tool: string;
  auto: SceneAutoState | null;
  busy: boolean;
  landing: boolean;
  estimate: string;
  /** Журнал для текущего шага: строки движка + ход графики. */
  log: string[];
  onRun: (input: TzRunInput) => void;
  /** «Запускаем» в плане: clarifications — ответы на вопросы. */
  onGateRun: (clarifications: string) => void;
  /** «Новое ТЗ» / «Поправить ТЗ» — назад к вводу (текст ТЗ сохранён). */
  onReset: () => void;
  onRetry: () => void;
  onEdit: (text: string) => void;
  editCost: string;
  onCancelArt: () => void;
  /** Сборка графики с ошибками — повтор по деталям. */
  artPanel?: ReactNode;
  /** Готовый фон — уходит в другие инструменты референсом. */
  nextImage?: string;
  clickUrl: string;
  onClickUrl: (v: string) => void;
  urlRequired: boolean;
}) {
  const plan = auto?.plan;
  const u = auto?.u;
  const steps = [
    { id: "reading", label: auto?.fromHub ? "Беру уже понятое ТЗ" : "Читаю ТЗ, файлы и ссылки" },
    { id: "planning", label: "Выбираю игру, пишу тексты, ставлю бренд и цвета" },
    ...((auto?.art ?? true) ? [{ id: "art", label: landing ? "Рисую графику сцены и блоков под тему" : "Рисую графику сцены под тему" }] : []),
  ];
  const current =
    !auto || auto.phase === "done" ? null : auto.phase === "error" ? (auto.applied ? "art" : plan ? "planning" : "reading") : auto.phase === "review" ? "planning" : auto.phase;

  if (!auto)
    return (
      <TzInputBox
        tool={tool}
        examples={landing ? EXAMPLES_LANDING : EXAMPLES_PLAYABLE}
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
    );

  const brief = auto.input?.text.trim() || u?.job.summary || "";
  return (
    <div className="flex flex-col gap-4">
      {/* ТЗ свёрнуто в строку — дальше один поток: ход, план, результат. */}
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{brief || "ТЗ"}</span>
        <button
          type="button"
          disabled={busy}
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" /> Новое ТЗ
        </button>
      </div>

      {auto.phase === "review" && u && plan ? (
        <TzPlanGate
          u={u}
          cost={auto.cost ?? null}
          costNote={auto.art ? (landing ? "Графика сцены и картинки блоков лендинга; разбор ТЗ — бесплатно." : "Вся графика сцены под тему; разбор ТЗ — бесплатно.") : "Без графики ИИ — только тексты и цвета."}
          busy={busy}
          onRun={onGateRun}
          onEdit={onReset}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <PlanRows plan={plan} landing={landing} />
          </dl>
        </TzPlanGate>
      ) : (
        <AutoSteps
          steps={steps}
          current={current}
          done={auto.phase === "done"}
          error={auto.phase === "error" ? auto.error : undefined}
          log={log}
          onRetry={auto.phase === "error" ? onRetry : undefined}
          retryLabel={auto.interrupted ? "Продолжить" : "Повторить"}
        />
      )}
      {auto.phase === "art" ? (
        <button type="button" onClick={onCancelArt} className="-mt-2 w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Отменить оставшуюся графику
        </button>
      ) : null}

      {artPanel}

      {plan && auto.phase !== "review" ? (
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
            {auto.phase === "done"
              ? `Готово — превью справа играется. Скачайте ${landing ? "лендинг" : "файлы"} кнопкой под превью.`
              : "Превью справа обновляется по ходу работы."}
          </p>
        </div>
      ) : null}

      {auto.phase === "done" && plan ? (
        <TzEditBox
          onEdit={onEdit}
          busy={busy}
          costLabel={editCost}
          placeholder="Что поправить? Например: фон темнее, заголовок короче, другая игра"
          examples={["Фон темнее", "Заголовок короче", "Ярче награда"]}
        />
      ) : null}

      {u && plan && auto.phase !== "review" ? <TzJobCard u={u} rows={<PlanRows plan={plan} landing={landing} />} /> : null}

      {auto.phase === "done" && u && auto.input ? (
        <NextTools
          from={landing ? "scene" : "playable"}
          understood={u}
          input={auto.input}
          image={nextImage || undefined}
          only={landing ? ["banner", "email", "campaign"] : ["banner", "email", "landing", "campaign"]}
        />
      ) : null}
    </div>
  );
}
