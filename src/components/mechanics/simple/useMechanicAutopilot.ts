"use client";

// Автопилот простого режима механики:
//   ТЗ → понять (движок ТЗ, продукт landing, живой ход) → решить тексты, призы,
//   язык, бренд, промпты (plan.ts, бесплатно) → план и цена (TzPlanGate), если
//   есть вопросы или графика дорогая → механика заполняет форму → её обычная
//   сборка «Вся графика под тему». Сборка стартует из эффекта, когда форма уже
//   отрисована: шаги строятся из состояния страницы, как при нажатии кнопки.
//
// Пришли с лендинг-хаба (takeTzHandoff) — ТЗ уже понято: сразу к решениям, но
// через план с ценой (хаб цену не показывал). Ход сохраняется (saveAutoSnapshot):
// после перезагрузки карточка на месте, прерванный запуск — «Продолжить».
import { useEffect, useRef, useState } from "react";

import { useAuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import type { LandingExtras, LandingKind } from "@/lib/landingKit";
import {
  loadAutoSnapshot,
  needsReview,
  rememberLastTz,
  saveAutoSnapshot,
  understandTz,
  withClarifications,
  type TzRunInput,
  type TzUnderstood,
} from "@/lib/tz/client";
import { takeTzHandoff } from "@/lib/tz/handoff";
import type { ToolMode } from "@/components/simple/useToolMode";
import {
  buildMechanicPlan,
  costNote,
  editTargets,
  keepExtrasImages,
  planArt,
  sumCredits,
  withEdit,
  type ArtPart,
  type CopyField,
  type MechanicId,
  type MechanicPlan,
} from "./plan";

export type MechanicPhase = "reading" | "planning" | "review" | "filling" | "drawing" | "done" | "error";

export type MechanicAuto = {
  phase: MechanicPhase;
  /** На каком шаге упало / прервалось. */
  failed?: MechanicPhase;
  error?: string;
  /** Прервано перезагрузкой страницы. */
  interrupted?: boolean;
  u?: TzUnderstood;
  plan?: MechanicPlan;
  input?: TzRunInput;
  decided?: Record<string, unknown>;
  /** Рисовать графику ИИ (галочка). */
  wantArt: boolean;
  /** ТЗ пришло понятым с лендинг-хаба. */
  handoff: boolean;
  /** Живой журнал разбора и решений. */
  log: string[];
  /** Цена графики по плану. */
  cost?: { credits: number; note: string };
  /** Идёт правка словами. */
  editing?: string;
};

const EMPTY_INPUT: TzRunInput = { text: "", files: [], images: [], options: {} };

export function useMechanicAutopilot(o: {
  mechanic: MechanicId;
  /** Название инструмента — для «Продолжить по ТЗ из …» в других инструментах. */
  label: string;
  kind: LandingKind;
  setMode: (m: ToolMode) => void;
  /** Поля механики для копирайтера. */
  fields: (ctx: { offer: string; raw: Record<string, unknown> }) => CopyField[];
  icon?: boolean;
  /** Своя графика механики по плану (символы, ракета, эмблемы) — id как у шагов сборки. */
  art: (plan: MechanicPlan) => ArtPart[];
  /** Текущее состояние страницы, нужное решениям. */
  current: () => { extras: LandingExtras; cta: string };
  /** Разложить решения по форме (синхронно, setState). clearArt — убрать картинки прошлой темы. */
  apply: (plan: MechanicPlan, clearArt: boolean) => void;
  /** Обычная сборка графики механики; only — только шаги с этими id / префиксами. */
  startArt: (only?: string[]) => Promise<void>;
}) {
  const { isGuest, openGate } = useAuthGate();
  const { loading: authLoading } = useAuth();
  const [auto, setAuto] = useState<MechanicAuto | null>(null);
  const autoRef = useRef<MechanicAuto | null>(null);
  // Колбэки страницы пересоздаются каждый рендер — держим свежие.
  const opts = useRef(o);
  opts.current = o;
  const [artTick, setArtTick] = useState(0);
  const artOnly = useRef<string[] | undefined>(undefined);

  const set = (next: MechanicAuto | null) => {
    autoRef.current = next;
    setAuto(next);
  };
  const patch = (p: Partial<MechanicAuto>) => set(autoRef.current ? { ...autoRef.current, ...p } : null);
  const say = (m: string) => patch({ log: [...(autoRef.current?.log ?? []), m].slice(-30) });
  const fail = (e: unknown, fallback: string) =>
    patch({ phase: "error", failed: autoRef.current?.phase, error: e instanceof Error ? e.message : fallback, interrupted: false });

  const costOf = (plan: MechanicPlan) => {
    const parts = planArt(plan, opts.current.art(plan));
    return { credits: sumCredits(parts), note: costNote(parts) };
  };

  /** Решения (бесплатно) → план с ценой или сразу запуск. */
  const planFrom = async (u: TzUnderstood, gate: boolean) => {
    patch({ u, phase: "planning", error: undefined });
    const cur = opts.current.current();
    const plan = await buildMechanicPlan({
      u,
      decided: autoRef.current?.decided,
      mechanic: opts.current.mechanic,
      kind: opts.current.kind,
      extras: cur.extras,
      cta: cur.cta,
      fields: opts.current.fields,
      icon: opts.current.icon,
      log: say,
    });
    const cost = costOf(plan);
    patch({ plan, cost });
    const wantArt = autoRef.current?.wantArt !== false;
    if (gate && needsReview(u, wantArt ? cost.credits : 0)) {
      patch({ phase: "review" });
      return;
    }
    launch(plan);
  };

  /** Заполнить форму и (если надо) нарисовать. only — правка: только эти картинки, прежние не трогаем. */
  const launch = (plan: MechanicPlan, only?: string[]) => {
    const a = autoRef.current;
    if (!a) return;
    patch({ plan, phase: "filling" });
    opts.current.apply(plan, a.wantArt && !only);
    const draw = only ? only.length > 0 : a.wantArt;
    if (!draw) {
      patch({ phase: "done", editing: undefined });
      return;
    }
    // Сборку — после того как форма с решениями отрисуется (эффект ниже).
    artOnly.current = only;
    patch({ phase: "drawing" });
    setArtTick((n) => n + 1);
  };

  const go = async (input: TzRunInput, pre?: { u: TzUnderstood; decided?: Record<string, unknown> }) => {
    if (isGuest) {
      openGate("Простой режим разбирает ТЗ и рисует графику — войдите, чтобы продолжить");
      return;
    }
    set({
      phase: pre ? "planning" : "reading",
      wantArt: input.options?.art !== false,
      handoff: !!pre,
      input,
      decided: pre?.decided,
      log: pre ? ["ТЗ разобрано на странице лендинга — беру его решения"] : [],
    });
    void rememberLastTz(input, opts.current.mechanic, opts.current.label).catch(() => {});
    try {
      const u = pre?.u ?? (await understandTz(input, "landing", [], say));
      await planFrom(u, true);
    } catch (e) {
      fail(e, "Не удалось разобрать ТЗ");
    }
  };

  /** «Запускаем» в плане; с ответами на вопросы — понять ТЗ заново и сразу запустить. */
  const approve = async (clarifications: string) => {
    const a = autoRef.current;
    if (!a?.plan) return;
    if (!clarifications.trim()) {
      launch(a.plan);
      return;
    }
    const input = withClarifications(a.input ?? EMPTY_INPUT, clarifications);
    patch({ phase: "reading", input, log: ["Учитываю ответы и перечитываю ТЗ"] });
    try {
      await planFrom(await understandTz(input, "landing", [], say), false);
    } catch (e) {
      fail(e, "Не удалось разобрать ТЗ");
    }
  };

  /** Прерванное или упавшее — с того места, где остановились. */
  const retry = async () => {
    const a = autoRef.current;
    if (!a) return;
    patch({ error: undefined, interrupted: false });
    try {
      if (a.plan && (a.failed === "filling" || a.failed === "drawing")) launch(a.plan);
      else if (a.u) await planFrom(a.u, a.failed !== "review");
      else if (a.input) await go(a.input);
    } catch (e) {
      fail(e, "Не удалось продолжить");
    }
  };

  /** Правка словами: в тексты — заново тексты, в картинки — правка в промпт и только эти картинки. */
  const edit = async (text: string) => {
    const a = autoRef.current;
    if (!a?.plan || !a.u) return;
    const t = editTargets(text);
    patch({ phase: "planning", editing: text, error: undefined, log: [`Правка: «${text}»`] });
    try {
      let p = a.plan;
      if (t.texts) {
        const cur = opts.current.current();
        p = await buildMechanicPlan({
          u: a.u,
          decided: a.decided,
          mechanic: opts.current.mechanic,
          kind: opts.current.kind,
          extras: cur.extras,
          cta: cur.cta,
          fields: opts.current.fields,
          icon: opts.current.icon,
          log: say,
          edit: { text, base: p },
        });
      }
      p = {
        ...p,
        bg: t.bg ? withEdit(p.bg, text) : p.bg,
        chars: t.chars ? { left: withEdit(p.chars.left, text), right: p.chars.right ? withEdit(p.chars.right, text) : "" } : p.chars,
        icon: t.icon ? withEdit(p.icon || p.topic, text) : p.icon,
        extras: keepExtrasImages(p.extras, opts.current.current().extras),
      };
      const iconIds = opts.current.art(p).map((x) => x.id);
      const only = [...(t.bg ? ["bg"] : []), ...(t.chars ? ["char-"] : []), ...(t.icon ? iconIds : [])];
      if (only.length) say(`Перерисовываю: ${[t.bg && "фон", t.chars && "персонажей", t.icon && "иконки"].filter(Boolean).join(", ")}`);
      launch(p, only);
    } catch (e) {
      fail(e, "Не удалось внести правку");
    }
  };

  const backToInput = () => set(null);

  useEffect(() => {
    if (!artTick) return;
    void (async () => {
      try {
        await opts.current.startArt(artOnly.current);
        patch({ phase: "done", editing: undefined });
      } catch (e) {
        patch({ phase: "error", failed: "drawing", error: e instanceof Error ? e.message : "Не удалось запустить сборку графики" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artTick]);

  // При открытии: передача с лендинг-хаба (когда известно, кто вошёл), иначе — сохранённый ход.
  const tookRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (authLoading || tookRef.current) return;
    tookRef.current = true;
    void (async () => {
      const h = await takeTzHandoff(o.mechanic).catch(() => null);
      if (h) {
        setLoaded(true);
        opts.current.setMode("simple");
        void go(h.input ?? EMPTY_INPUT, { u: h.understood, decided: h.decided });
        return;
      }
      const snap = await loadAutoSnapshot<MechanicAuto>(o.mechanic).catch(() => null);
      if (snap && !autoRef.current) {
        const running = ["reading", "planning", "filling", "drawing"].includes(snap.phase);
        set(running ? { ...snap, phase: "error", failed: snap.phase, error: "Прервано перезагрузкой", interrupted: true, editing: undefined } : snap);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Сохраняем ход на смене шага (не на каждой строке журнала — в снимке картинки ТЗ).
  useEffect(() => {
    if (!loaded) return;
    void saveAutoSnapshot(o.mechanic, autoRef.current).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, auto?.phase, auto?.plan, auto?.u]);

  const busy = !!auto && !["done", "error", "review"].includes(auto.phase);
  // Цена правки: тексты бесплатно, картинка — по своей цене.
  const editParts = auto?.plan ? planArt(auto.plan, o.art(auto.plan)).filter((x) => !x.id.startsWith("x-") && x.id !== "char-right") : [];
  const editCost = editParts.length ? `Тексты — бесплатно; ${editParts.map((x) => `${x.label.replace(" слева", "")} ≈ ${x.credits}`).join(", ")} кр.` : "";
  return {
    auto,
    busy,
    run: (input: TzRunInput) => void go(input),
    approve: (c: string) => void approve(c),
    retry: () => void retry(),
    edit: (t: string) => void edit(t),
    backToInput,
    editCost,
  };
}
