"use client";

// Автопилот простого режима механики: ТЗ → понять (движок ТЗ, продукт landing)
// → решить тексты, призы, язык, бренд, промпты (plan.ts) → механика заполняет
// свою форму → её обычная сборка «Вся графика под тему». Сборка стартует из
// эффекта, когда заполненная форма уже отрисована: шаги сборки строятся из
// состояния страницы, как при нажатии кнопки.
//
// Пришли с лендинг-хаба (takeTzHandoff) — ТЗ уже понято: сразу к решениям.
import { useEffect, useRef, useState } from "react";

import { useAuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import type { LandingExtras, LandingKind } from "@/lib/landingKit";
import { understandTz, type TzRunInput, type TzUnderstood } from "@/lib/tz/client";
import { takeTzHandoff } from "@/lib/tz/handoff";
import type { ToolMode } from "@/components/simple/useToolMode";
import { buildMechanicPlan, type CopyField, type MechanicId, type MechanicPlan } from "./plan";

export type MechanicPhase = "reading" | "planning" | "filling" | "drawing" | "done" | "error";

export type MechanicAuto = {
  phase: MechanicPhase;
  /** На каком шаге упало. */
  failed?: MechanicPhase;
  error?: string;
  u?: TzUnderstood;
  plan?: MechanicPlan;
  /** Рисовать графику ИИ (галочка). */
  wantArt: boolean;
  /** ТЗ пришло понятым с лендинг-хаба. */
  handoff: boolean;
};

export function useMechanicAutopilot(o: {
  mechanic: MechanicId;
  kind: LandingKind;
  setMode: (m: ToolMode) => void;
  /** Поля механики для копирайтера. */
  fields: (ctx: { offer: string; raw: Record<string, unknown> }) => CopyField[];
  icon?: boolean;
  /** Текущее состояние страницы, нужное решениям. */
  current: () => { extras: LandingExtras; cta: string };
  /** Разложить решения по форме механики (синхронно, setState). */
  apply: (plan: MechanicPlan, wantArt: boolean) => void;
  /** Обычная сборка графики механики — та же, что по кнопке. */
  startArt: () => Promise<void>;
}) {
  const { isGuest, openGate } = useAuthGate();
  const { loading: authLoading } = useAuth();
  const [auto, setAuto] = useState<MechanicAuto | null>(null);
  const autoRef = useRef<MechanicAuto | null>(null);
  // Колбэки страницы пересоздаются каждый рендер — держим свежие.
  const opts = useRef(o);
  opts.current = o;
  const [artTick, setArtTick] = useState(0);

  const patch = (p: Partial<MechanicAuto>) => {
    const next = autoRef.current ? { ...autoRef.current, ...p } : null;
    autoRef.current = next;
    setAuto(next);
  };

  const go = async (input: TzRunInput, pre?: { u: TzUnderstood; decided?: Record<string, unknown> }) => {
    if (isGuest) {
      openGate("Простой режим разбирает ТЗ и рисует графику — войдите, чтобы продолжить");
      return;
    }
    const init: MechanicAuto = { phase: pre ? "planning" : "reading", wantArt: input.options?.art !== false, handoff: !!pre };
    autoRef.current = init;
    setAuto(init);
    try {
      const u = pre?.u ?? (await understandTz(input, "landing"));
      patch({ u, phase: "planning" });
      const cur = opts.current.current();
      const plan = await buildMechanicPlan({
        u,
        decided: pre?.decided,
        mechanic: opts.current.mechanic,
        kind: opts.current.kind,
        extras: cur.extras,
        cta: cur.cta,
        fields: opts.current.fields,
        icon: opts.current.icon,
      });
      patch({ plan, phase: "filling" });
      opts.current.apply(plan, init.wantArt);
      if (!init.wantArt) {
        patch({ phase: "done" });
        return;
      }
      // Сборку — после того как форма с решениями отрисуется (эффект ниже).
      patch({ phase: "drawing" });
      setArtTick((n) => n + 1);
    } catch (e) {
      patch({ phase: "error", failed: autoRef.current?.phase, error: e instanceof Error ? e.message : "Не удалось разобрать ТЗ" });
    }
  };

  useEffect(() => {
    if (!artTick) return;
    void (async () => {
      try {
        await opts.current.startArt();
        patch({ phase: "done" });
      } catch (e) {
        patch({ phase: "error", failed: "drawing", error: e instanceof Error ? e.message : "Не удалось запустить сборку графики" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artTick]);

  // С лендинг-хаба: забрать понятое ТЗ (один раз, когда известно, кто вошёл).
  const tookRef = useRef(false);
  useEffect(() => {
    if (authLoading || tookRef.current) return;
    tookRef.current = true;
    void takeTzHandoff(o.mechanic)
      .then((h) => {
        if (!h) return;
        opts.current.setMode("simple");
        void go(h.input ?? { text: "", files: [], images: [], options: {} }, { u: h.understood, decided: h.decided });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const busy = !!auto && auto.phase !== "done" && auto.phase !== "error";
  return { auto, busy, run: (input: TzRunInput) => void go(input) };
}
