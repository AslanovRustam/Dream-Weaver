"use client";

// Простой режим лендинг-хаба: ТЗ в любом виде → «Создать». Движок ТЗ понимает
// задачу и решает, какой лендинг нужен (plans/landing.ts). Дальше хаб либо сам
// собирает блочный лендинг и открывает редактор, либо передаёт понятое ТЗ
// конструктору механики / сцены (putTzHandoff) и уходит туда — там свой
// автопилот доводит лендинг до конца.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthGate } from "@/components/AuthGate";
import { AutoSteps, type AutoStep } from "@/components/simple/AutoSteps";
import { TzInputBox } from "@/components/simple/TzInputBox";
import { JobRow, TzJobCard } from "@/components/simple/TzJobCard";
import {
  LANDING_SECTIONS,
  accentForVertical,
  normalizeLandingLang,
  type LandingInput,
  type LandingSectionId,
  type LandingTextOverrides,
} from "@/lib/landingGen";
import { SCENES } from "@/lib/scenes/presets";
import { tzImageByRole, understandTz, type TzRunInput, type TzUnderstood } from "@/lib/tz/client";
import { putTzHandoff, type TzHandoffTarget } from "@/lib/tz/handoff";
import {
  normalizeLandingPlan,
  type LandingDecided,
  type LandingKitBlock,
  type LandingPlan,
  type LandingPlanType,
} from "@/lib/tz/plans/landing";

type Phase = "reading" | "building" | "opening" | "done" | "error";

type AutoState = {
  phase: Phase;
  error?: string;
  u?: TzUnderstood;
  plan?: LandingPlan;
  /** Галочка «игра первым экраном» снята — механику заменили блочным лендингом. */
  forcedBlocks?: boolean;
};

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
  const patch = (p: Partial<AutoState>) => {
    const next = { ...(autoRef.current ?? { phase: "reading" as Phase }), ...p };
    autoRef.current = next;
    setAuto(next);
  };
  const busy = !!auto && auto.phase !== "done" && auto.phase !== "error";

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
    const set = (k: keyof LandingTextOverrides, v: string) => {
      if (v.trim()) ov[k] = v.trim();
    };
    set("heroHeadline", plan.headline);
    set("lead", plan.sub);
    set("cta", plan.cta);
    set("benefitsTitle", plan.titles.benefits);
    set("howtoTitle", plan.titles.howto);
    set("trustTitle", plan.titles.trust);
    set("ctaTitle", plan.titles.cta);
    openBlocks(input, ov);
  };

  const run = async (input: TzRunInput) => {
    if (isGuest) {
      openGate();
      return;
    }
    autoRef.current = null;
    patch({ phase: "reading" });
    try {
      const u = await understandTz(input, "landing");
      let plan = normalizeLandingPlan(u.job.plan ?? {});
      if (!plan.language) plan = { ...plan, language: u.job.language };
      const forcedBlocks = !input.options.mechanic && plan.type !== "blocks";
      if (forcedBlocks) plan = { ...plan, type: "blocks", scene: null };
      patch({ u, plan, forcedBlocks, phase: plan.type === "blocks" ? "building" : "opening" });
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
    } catch (e) {
      patch({ phase: "error", error: e instanceof Error ? e.message : "Не удалось разобрать ТЗ" });
    }
  };

  const plan = auto?.plan;
  const lastLabel = !plan
    ? "Собираю лендинг"
    : plan.type === "blocks"
      ? "Собираю лендинг из блоков и открываю редактор"
      : plan.type === "scene"
        ? `Открываю конструктор сцены «${sceneLabel(plan.scene)}»`
        : OPEN_LABEL[plan.type];
  const steps: AutoStep[] = [
    { id: "reading", label: "Читаю ТЗ, файлы и ссылки, выбираю тип лендинга" },
    { id: plan?.type === "blocks" ? "building" : "opening", label: lastLabel },
  ];
  const current = !auto || auto.phase === "done" ? null : auto.phase === "error" ? (plan ? steps[1].id : "reading") : auto.phase;
  const blockLang = plan ? normalizeLandingLang(plan.language) : "ru";

  return (
    <div className="flex flex-col gap-5">
      <TzInputBox
        busy={busy}
        estimate="Разбор ТЗ — бесплатно. Картинки для игрового лендинга сгенерирует конструктор механики, по своим ценам."
        options={[{ id: "mechanic", label: "Игра первым экраном (колесо, слот, сцена…), если подходит ТЗ", default: true }]}
        onRun={(i) => void run(i)}
      />

      {auto ? <AutoSteps steps={steps} current={current} done={auto.phase === "done"} error={auto.phase === "error" ? auto.error : undefined} /> : null}

      {auto?.u && plan ? (
        <TzJobCard
          u={auto.u}
          rows={
            <>
              <JobRow label="Тип лендинга">
                {TYPE_LABEL[plan.type]}
                {plan.type === "scene" ? ` «${sceneLabel(plan.scene)}»` : ""}
                {auto.forcedBlocks ? " — игра первым экраном выключена" : plan.why ? ` — ${plan.why}` : ""}
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
          }
        />
      ) : null}
    </div>
  );
}
