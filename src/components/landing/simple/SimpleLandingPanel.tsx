"use client";

// Простой режим лендинг-хаба: ТЗ в любом виде → «Создать». Движок ТЗ понимает
// задачу и решает, какой лендинг нужен (plans/landing.ts). Дальше хаб либо сам
// собирает блочный лендинг и открывает редактор, либо передаёт понятое ТЗ
// конструктору механики / сцены (putTzHandoff) и уходит туда — там свой
// автопилот доводит лендинг до конца.
//
// Ход работы живой (строки разбора ТЗ), с вопросами по критичным пробелам ТЗ
// перед запуском, переживает перезагрузку (снимок в IndexedDB) и принимает ТЗ,
// переданное из других инструментов (takeTzHandoff("landing")).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { useAuthGate } from "@/components/AuthGate";
import { AutoSteps, type AutoStep } from "@/components/simple/AutoSteps";
import { TzInputBox, type TzExample } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import { TzPlanGate } from "@/components/simple/TzPlanGate";
import {
  LANDING_SECTIONS,
  accentForVertical,
  normalizeLandingLang,
  type LandingInput,
  type LandingSectionId,
  type LandingTextOverrides,
} from "@/lib/landingGen";
import { SCENES } from "@/lib/scenes/presets";
import {
  loadAutoSnapshot,
  needsReview,
  rememberLastTz,
  saveAutoSnapshot,
  tzImageByRole,
  understandTz,
  withClarifications,
  type TzRunInput,
  type TzUnderstood,
} from "@/lib/tz/client";
import { putTzHandoff, takeTzHandoff, type TzHandoffTarget } from "@/lib/tz/handoff";
import {
  normalizeLandingPlan,
  type LandingDecided,
  type LandingKitBlock,
  type LandingPlan,
  type LandingPlanType,
} from "@/lib/tz/plans/landing";

const TOOL = "landing";

type Phase = "reading" | "review" | "building" | "opening" | "done" | "error";

type AutoState = {
  phase: Phase;
  error?: string;
  /** Живой журнал: строки разбора ТЗ и свои шаги хаба. */
  log: string[];
  /** Ввод, по которому идёт работа, — для повтора и уточнений. */
  input?: TzRunInput;
  u?: TzUnderstood;
  plan?: LandingPlan;
  /** Галочка «можно с мини-игрой» снята — механику заменили блочным лендингом. */
  forcedBlocks?: boolean;
  /** Работа оборвалась перезагрузкой — показываем «Повторить». */
  interrupted?: boolean;
};

const EXAMPLES: TzExample[] = [
  {
    label: "Колесо фортуны",
    text: "Лендинг для казино: крути колесо — выиграй 150% на первый депозит + 100 фриспинов. Русский язык, неон и золото, ночной Лас-Вегас. Кнопка «Забрать бонус». 18+.",
  },
  {
    label: "Матч-прогноз",
    text: "Лендинг под матч Реал — Барселона, 26 октября: угадай исход, фрибет 1 000 ₽ за первую ставку. Русский язык, вечерний стадион, прожекторы. Кнопка «Сделать ставку». 18+.",
  },
  {
    label: "Плинко",
    text: "Промо-лендинг игры Plinko: брось шарик — до ×1000 и 50 фриспинов новым игрокам. Английский язык, неоновый розово-фиолетовый стиль. Кнопка «Play now». 18+.",
  },
  {
    label: "Страница бонуса без игры",
    text: "Простая страница без мини-игры: приветственный пакет 200% до 30 000 ₽ + 150 фриспинов, преимущества, шаги «регистрация → депозит → игра», отзывы. Русский язык, тёмный строгий стиль с золотом. 18+.",
  },
];

const TYPE_LABEL: Record<LandingPlanType, string> = {
  blocks: "Блочный лендинг",
  wheel: "Колесо фортуны",
  slot: "Слот-машина",
  crash: "Crash-игра",
  match: "Матч-прогноз",
  scene: "Премиум-сцена",
};

const OPEN_LABEL: Record<Exclude<LandingPlanType, "blocks" | "scene">, string> = {
  wheel: "Открываю конструктор колеса",
  slot: "Открываю конструктор слота",
  crash: "Открываю конструктор crash-игры",
  match: "Открываю конструктор матч-прогноза",
};

const KIT_LABEL: Record<LandingKitBlock, string> = {
  bonuses: "бонусы",
  games: "игры",
  trust: "доверие",
  steps: "шаги",
  winners: "лента выигрышей",
  timer: "таймер",
  reviews: "отзывы",
  faq: "FAQ",
};

const sceneLabel = (id: string | null) => SCENES.find((s) => s.id === id)?.label ?? id ?? "";
const typeName = (p: LandingPlan) => TYPE_LABEL[p.type] + (p.type === "scene" ? ` «${sceneLabel(p.scene)}»` : "");
const finalLabel = (p: LandingPlan) =>
  p.type === "blocks"
    ? "Собираю лендинг из блоков и открываю редактор"
    : p.type === "scene"
      ? `Открываю конструктор сцены «${sceneLabel(p.scene)}»`
      : OPEN_LABEL[p.type];

/** Уменьшить картинку из ТЗ, чтобы проект влез в localStorage (webp — с прозрачностью). */
function shrinkImage(src: string, maxPx: number): Promise<string> {
  return new Promise((resolve) => {
    if (!src) return resolve("");
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width || maxPx, img.height || maxPx));
      const w = Math.max(1, Math.round((img.width || maxPx) * scale));
      const h = Math.max(1, Math.round((img.height || maxPx) * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SimpleLandingPanel({
  fallbackBrand,
  openBlocks,
}: {
  /** Бренд из настроек — если в ТЗ его нет. */
  fallbackBrand: { name: string; logo: string };
  /** Сохранить проект блочного лендинга и открыть редактор (как «Сгенерировать»). */
  openBlocks: (input: LandingInput, overrides: LandingTextOverrides) => void;
}) {
  const router = useRouter();
  const { isGuest, openGate } = useAuthGate();
  const [auto, setAuto] = useState<AutoState | null>(null);
  const autoRef = useRef<AutoState | null>(null);
  /** persist: false — только экран (строки журнала не пишем в IndexedDB на каждую). */
  const set = (next: AutoState | null, persist = true) => {
    autoRef.current = next;
    setAuto(next);
    if (persist) void saveAutoSnapshot(TOOL, next).catch(() => {});
  };
  const patch = (p: Partial<AutoState>) => set({ ...(autoRef.current ?? { phase: "reading", log: [] }), ...p });
  const say = (line: string) =>
    set({ ...(autoRef.current ?? { phase: "reading" }), log: [...(autoRef.current?.log ?? []), line].slice(-40) }, false);
  const busy = !!auto && (auto.phase === "reading" || auto.phase === "building" || auto.phase === "opening");

  /** Блочный лендинг из ТЗ: тексты, блоки, цвет, лого и главный визуал. */
  const buildBlocks = async (u: TzUnderstood, plan: LandingPlan) => {
    const { job } = u;
    const lang = normalizeLandingLang(plan.language || job.language);
    const sections = Object.fromEntries(LANDING_SECTIONS.map((s) => [s.id, plan.blocks.includes(s.id)])) as Record<
      LandingSectionId,
      boolean
    >;
    const logoSrc = tzImageByRole(u, "brand");
    const heroSrc = tzImageByRole(u, "main") || tzImageByRole(u, "character");
    const [logo, hero] = await Promise.all([shrinkImage(logoSrc, 256), shrinkImage(heroSrc, 960)]);
    const fine = [plan.offer || job.offer, ...job.legal].filter(Boolean).join(" · ");
    const input: LandingInput = {
      vertical: plan.vertical,
      accent: job.brand.colors[0] || job.style.palette[0] || accentForVertical(plan.vertical),
      brandName: job.brand.name || fallbackBrand.name,
      brandLogo: logo || (job.brand.name ? "" : fallbackBrand.logo),
      language: lang,
      subject: plan.sub || job.summary,
      occasion: plan.occasion,
      sections,
      ctaText: plan.cta,
      offerDetails: fine,
      heroImage: hero,
    };
    const ov: LandingTextOverrides = {};
    const put = (k: keyof LandingTextOverrides, v: string) => {
      if (v.trim()) ov[k] = v.trim();
    };
    put("heroHeadline", plan.headline);
    put("lead", plan.sub);
    put("cta", plan.cta);
    put("benefitsTitle", plan.titles.benefits);
    put("howtoTitle", plan.titles.howto);
    put("trustTitle", plan.titles.trust);
    put("ctaTitle", plan.titles.cta);
    openBlocks(input, ov);
  };

  /** Решение принято — собрать блочный лендинг или передать ТЗ конструктору. */
  const proceed = async (u: TzUnderstood, plan: LandingPlan, input: TzRunInput) => {
    patch({ phase: plan.type === "blocks" ? "building" : "opening", error: undefined, interrupted: false });
    say(finalLabel(plan));
    // Пауза — чтобы решение успели увидеть до перехода.
    await wait(1400);
    if (plan.type === "blocks") {
      await buildBlocks(u, plan);
      patch({ phase: "done" });
      return;
    }
    const decided: LandingDecided = {
      mechanic: plan.type,
      ...(plan.scene ? { scene: plan.scene } : {}),
      why: plan.why,
      headline: plan.headline,
      sub: plan.sub,
      cta: plan.cta,
      offer: plan.offer || u.job.offer,
      language: plan.language,
      kitBlocks: plan.kitBlocks,
    };
    await putTzHandoff({ target: plan.type as TzHandoffTarget, understood: u, input, decided });
    patch({ phase: "done" });
    router.push(plan.type === "scene" ? `/landing/scene?pick=scene-${plan.scene}` : `/${plan.type}`);
  };

  /** ТЗ понято: решить тип лендинга; с вопросами движка — сначала план и ответы. */
  const decide = async (u: TzUnderstood, input: TzRunInput, allowGate: boolean) => {
    say("Решаю тип лендинга");
    let plan = normalizeLandingPlan(u.job.plan ?? {});
    if (!plan.language) plan = { ...plan, language: u.job.language };
    // Галочки нет (ТЗ из другого инструмента) — мини-игра разрешена.
    const forcedBlocks = input.options.mechanic === false && plan.type !== "blocks";
    if (forcedBlocks) plan = { ...plan, type: "blocks", scene: null };
    patch({ u, plan, forcedBlocks, input });
    say(`Решение: ${typeName(plan)}`);
    // Блочный лендинг бесплатный; цену картинок механики покажет её конструктор.
    if (allowGate && needsReview(u, plan.type === "blocks" ? 0 : null)) {
      patch({ phase: "review" });
      return;
    }
    await proceed(u, plan, input);
  };

  /** Понять ТЗ (с живым ходом разбора) и вести дальше. */
  const understandAndGo = async (input: TzRunInput, allowGate: boolean) => {
    patch({ phase: "reading", input, error: undefined, interrupted: false });
    try {
      const u = await understandTz(input, "landing", [], (m) => say(m));
      await decide(u, input, allowGate);
    } catch (e) {
      patch({ phase: "error", error: e instanceof Error ? e.message : "Не удалось разобрать ТЗ" });
    }
  };

  const run = (input: TzRunInput) => {
    if (isGuest) {
      openGate();
      return;
    }
    void rememberLastTz(input, TOOL, "Лендинг-генератор").catch(() => {});
    set({ phase: "reading", log: [], input });
    void understandAndGo(input, true);
  };

  /** Ответы на вопросы → ТЗ понимается заново и идёт без повторного плана. */
  const runReviewed = async (clar: string) => {
    const a = autoRef.current;
    if (!a?.u || !a.plan || !a.input) return;
    try {
      if (clar.trim()) await understandAndGo(withClarifications(a.input, clar), false);
      else await proceed(a.u, a.plan, a.input);
    } catch (e) {
      patch({ phase: "error", error: e instanceof Error ? e.message : "Не удалось продолжить" });
    }
  };

  /** Повтор после ошибки или перезагрузки: понятое ТЗ есть — с решения, нет — с разбора. */
  const retry = () => {
    const a = autoRef.current;
    if (!a?.input) return;
    if (isGuest) {
      openGate();
      return;
    }
    if (a.u) {
      patch({ error: undefined, interrupted: false });
      void decide(a.u, a.input, false).catch((e) =>
        patch({ phase: "error", error: e instanceof Error ? e.message : "Не удалось продолжить" }),
      );
    } else void understandAndGo(a.input, true);
  };

  // При открытии: ТЗ из другого инструмента, иначе — снимок прошлого запуска.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void (async () => {
      let advanced = false;
      try {
        advanced = window.localStorage.getItem(`dw_mode_${TOOL}`) === "advanced";
      } catch {
        /* ignore */
      }
      const h = advanced ? null : await takeTzHandoff("landing").catch(() => null);
      if (h) {
        set({ phase: "reading", log: [], input: h.input });
        if (h.understood.job.product === "landing") {
          say("ТЗ передано из другого инструмента");
          await decide(h.understood, h.input, true).catch((e) =>
            patch({ phase: "error", error: e instanceof Error ? e.message : "Не удалось продолжить" }),
          );
        } else await understandAndGo(h.input, true);
        return;
      }
      const snap = await loadAutoSnapshot<AutoState>(TOOL).catch(() => null);
      if (!snap || autoRef.current) return;
      const midRun = snap.phase === "reading" || snap.phase === "building" || snap.phase === "opening";
      set(midRun ? { ...snap, phase: "error", error: "Прервано перезагрузкой", interrupted: true } : snap);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = auto?.plan;
  const steps: AutoStep[] = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки" },
    { id: "review", label: auto?.phase === "review" ? "Жду ответов на вопросы по ТЗ" : "Решаю тип лендинга" },
    { id: "final", label: plan ? finalLabel(plan) : "Собираю лендинг" },
  ];
  const current = (() => {
    if (!auto || auto.phase === "done") return null;
    if (auto.phase === "error") return plan ? "final" : "reading";
    if (auto.phase === "building" || auto.phase === "opening") return "final";
    return auto.phase;
  })();
  const blockLang = plan ? normalizeLandingLang(plan.language) : "ru";

  const decisionRows = plan ? (
    <>
      <JobRow label="Тип лендинга">
        {typeName(plan)}
        {auto?.forcedBlocks ? " — мини-игра выключена" : plan.why ? ` — ${plan.why}` : ""}
      </JobRow>
      {plan.headline ? <JobRow label="Заголовок">{plan.headline}</JobRow> : null}
      {plan.sub ? <JobRow label="Подзаголовок">{plan.sub}</JobRow> : null}
      {plan.cta ? <JobRow label="Кнопка">{plan.cta}</JobRow> : null}
      {plan.offer ? <JobRow label="Оффер на странице">{plan.offer}</JobRow> : null}
      <JobRow label="Блоки">
        {plan.type === "blocks"
          ? LANDING_SECTIONS.filter((s) => plan.blocks.includes(s.id))
              .map((s) => s.label)
              .join(", ")
          : plan.kitBlocks.map((b) => KIT_LABEL[b]).join(", ")}
      </JobRow>
      {plan.type === "blocks" && blockLang !== (plan.language || "ru") ? (
        <JobRow label="Язык блоков">
          Готовые тексты блоков есть на русском, украинском и английском — служебные подписи будут на{" "}
          {blockLang === "en" ? "английском" : blockLang === "uk" ? "украинском" : "русском"}, тексты из ТЗ — как в ТЗ.
        </JobRow>
      ) : null}
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Ввод не размонтируем во время работы — файлы и картинки ТЗ остаются для «Поправить ТЗ». */}
      <div className={auto ? "hidden" : ""}>
        <TzInputBox
          tool={TOOL}
          examples={EXAMPLES}
          busy={busy}
          estimate="Разбор ТЗ и блочный лендинг — бесплатно. Картинки для лендинга с мини-игрой сгенерирует её конструктор, по своим ценам."
          options={[{ id: "mechanic", label: "Можно с мини-игрой: колесо, слот, сцена", default: true }]}
          onRun={run}
        />
      </div>

      {auto ? (
        <div className="flex flex-col gap-3">
          <AutoSteps
            steps={steps}
            current={current}
            done={auto.phase === "done"}
            error={auto.phase === "error" ? auto.error : undefined}
            log={auto.log}
            onRetry={auto.input ? retry : undefined}
            retryLabel={auto.interrupted ? "Продолжить" : "Повторить"}
          />

          {auto.phase === "review" && auto.u && plan ? (
            <TzPlanGate
              u={auto.u}
              cost={plan.type === "blocks" ? 0 : null}
              costNote={plan.type === "blocks" ? undefined : "Картинки для мини-игры сгенерирует её конструктор — цену покажет он."}
              busy={busy}
              onRun={(c) => void runReviewed(c)}
              onEdit={() => set(null)}
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">{decisionRows}</dl>
            </TzPlanGate>
          ) : null}

          {auto.u && plan ? <TzJobCard u={auto.u} rows={auto.phase === "review" ? null : decisionRows} /> : null}

          {!busy && auto.phase !== "review" ? (
            <button
              type="button"
              onClick={() => set(null)}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Новое ТЗ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
