"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_TOTAL, type TourStep } from "@/lib/tour";

// ─────────────────────────────────────────────────────────────────────────────
// Interactive tour. Highlights a real control on a real screen and waits for
// the user to do the thing before moving on.
//
// The overlay never blocks the app: the dim is drawn as four rectangles AROUND
// the target (so the target itself is untouched) and the whole layer is
// pointer-events:none except the card. That keeps the product usable — the
// point is to guide the hands, not to trap them.
// ─────────────────────────────────────────────────────────────────────────────

type TourCtx = {
  active: boolean;
  completed: boolean;
  stepIndex: number;
  start: () => void;
  stop: () => void;
};

const Ctx = createContext<TourCtx>({
  active: false,
  completed: false,
  stepIndex: 0,
  start: () => {},
  stop: () => {},
});

export function useTour() {
  return useContext(Ctx);
}

type Saved = { active: boolean; index: number; completed: boolean };

const DEFAULT: Saved = { active: false, index: 0, completed: false };

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") {
      const o = v as Partial<Saved>;
      return {
        active: o.active === true,
        index: typeof o.index === "number" && o.index >= 0 && o.index < TOUR_TOTAL ? o.index : 0,
        completed: o.completed === true,
      };
    }
  } catch {
    /* private mode / blocked storage — the tour just starts fresh */
  }
  return DEFAULT;
}

function save(s: Saved) {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** The visible element carrying this data-tour name. Several screens render the
 *  same control twice (a mobile and a desktop copy), so zero-sized matches are
 *  skipped rather than highlighted off-screen. */
function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };

const same = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1);

const PAD = 6;
const CARD_W = 340;
const GAP = 14;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<Saved>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [satisfied, setSatisfied] = useState(false);
  const scrolledFor = useRef<number>(-1);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  const apply = useCallback((next: Saved) => {
    setState(next);
    save(next);
  }, []);

  const step: TourStep | null = state.active ? (TOUR_STEPS[state.index] ?? null) : null;
  const onRoute =
    !!step &&
    (pathname.startsWith(step.route) || (step.also ?? []).some((r) => pathname.startsWith(r)));

  const start = useCallback(() => {
    apply({ active: true, index: 0, completed: false });
    const first = TOUR_STEPS[0];
    if (first && !window.location.pathname.startsWith(first.route)) router.push(first.route);
  }, [apply, router]);

  const stop = useCallback(() => {
    apply({ ...load(), active: false });
  }, [apply]);

  const next = useCallback(() => {
    setState((prev) => {
      const last = prev.index >= TOUR_TOTAL - 1;
      const n: Saved = last
        ? { active: false, index: 0, completed: true }
        : { ...prev, index: prev.index + 1 };
      save(n);
      return n;
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      const n: Saved = { ...prev, index: Math.max(0, prev.index - 1) };
      save(n);
      return n;
    });
  }, []);

  // A fresh step starts unsatisfied, except the ones that only need reading.
  useEffect(() => {
    setSatisfied(!step || step.action.type === "manual");
    setBox(null);
  }, [state.index, step]);

  // Track the target's position. An interval covers layout shifts that fire no
  // event at all (images loading, panels expanding, generation finishing).
  useEffect(() => {
    if (!step?.target || !onRoute) {
      setBox(null);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const el = findTarget(step.target!);
      if (!el) {
        setBox((prev) => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const b: Box = { top: r.top, left: r.left, width: r.width, height: r.height };
      setBox((prev) => (same(prev, b) ? prev : b));
      if (scrolledFor.current !== state.index) {
        scrolledFor.current = state.index;
        const off = r.top < 90 || r.bottom > window.innerHeight - 90;
        if (off) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
    };
  }, [step, onRoute, state.index]);

  // Did the user do the thing? Listeners are capture-phase so they see the
  // event even if the app stops propagation, and the click advance is deferred
  // so the app's own handler (navigation, generation) runs first.
  useEffect(() => {
    if (!step?.target || !onRoute || step.action.type === "manual") return;
    const sel = `[data-tour="${step.target}"]`;
    const action = step.action;

    if (action.type === "click") {
      const onClick = (e: Event) => {
        const t = e.target as Element | null;
        if (t && t.closest(sel)) {
          setSatisfied(true);
          window.setTimeout(next, 350);
        }
      };
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
    }

    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!t || !t.closest?.(sel)) return;
      setSatisfied((t.value ?? "").trim().length >= action.min);
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, [step, onRoute, next]);

  // Esc leaves the tour — but not while a modal of the app itself is open on
  // top of it (the fullscreen landing preview closes on Esc too). The listener
  // captures: a bubbling handler would run after the modal has already removed
  // itself from the DOM, and the tour would close along with it.
  useEffect(() => {
    if (!state.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-tour-modal-open]")) stop();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.active, stop]);

  const value = useMemo<TourCtx>(
    () => ({
      active: state.active,
      completed: state.completed,
      stepIndex: state.index,
      start,
      stop,
    }),
    [state.active, state.completed, state.index, start, stop],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {hydrated && state.active && step ? (
        <TourOverlay
          step={step}
          index={state.index}
          box={onRoute ? box : null}
          onRoute={onRoute}
          satisfied={satisfied}
          onNext={next}
          onBack={back}
          onStop={stop}
          onGoToRoute={() => router.push(step.route)}
        />
      ) : null}
    </Ctx.Provider>
  );
}

function TourOverlay({
  step,
  index,
  box,
  onRoute,
  satisfied,
  onNext,
  onBack,
  onStop,
  onGoToRoute,
}: {
  step: TourStep;
  index: number;
  box: Box | null;
  onRoute: boolean;
  satisfied: boolean;
  onNext: () => void;
  onBack: () => void;
  onStop: () => void;
  onGoToRoute: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(230);
  useEffect(() => setMounted(true), []);
  // Measure the card so the placement maths knows its real height — the copy
  // length differs a lot between steps.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  });
  if (!mounted) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dim = "rgba(0,0,0,0.62)";

  // Card position: below the target, else above, else beside it — a full-height
  // panel has room on neither side of itself, only next to it. Always clamped
  // into the viewport. With no target the card sits bottom-centre.
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  let top: number;
  let left: number;
  if (box) {
    const need = cardH + GAP;
    const centreX = box.left + box.width / 2 - CARD_W / 2;
    if (vh - (box.top + box.height) >= need) {
      top = box.top + box.height + GAP;
      left = centreX;
    } else if (box.top >= need) {
      top = box.top - GAP - cardH;
      left = centreX;
    } else if (vw - (box.left + box.width) >= CARD_W + GAP) {
      left = box.left + box.width + GAP;
      top = box.top + box.height / 2 - cardH / 2;
    } else if (box.left >= CARD_W + GAP) {
      left = box.left - GAP - CARD_W;
      top = box.top + box.height / 2 - cardH / 2;
    } else {
      left = vw / 2 - CARD_W / 2;
      top = vh - cardH - 16;
    }
  } else {
    left = vw / 2 - CARD_W / 2;
    top = vh - cardH - 24;
  }
  const cardStyle: React.CSSProperties = {
    top: clamp(top, 12, Math.max(12, vh - cardH - 12)),
    left: clamp(left, 12, Math.max(12, vw - CARD_W - 12)),
  };

  const ringTop = box ? box.top - PAD : 0;
  const ringLeft = box ? box.left - PAD : 0;
  const ringW = box ? box.width + PAD * 2 : 0;
  const ringH = box ? box.height + PAD * 2 : 0;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[300]" role="dialog" aria-modal="false">
      {box ? (
        <>
          {/* Dim drawn around the target, so the control stays fully usable. */}
          <div style={{ position: "fixed", left: 0, top: 0, width: "100%", height: Math.max(0, ringTop), background: dim }} />
          <div style={{ position: "fixed", left: 0, top: ringTop + ringH, width: "100%", height: Math.max(0, vh - ringTop - ringH), background: dim }} />
          <div style={{ position: "fixed", left: 0, top: ringTop, width: Math.max(0, ringLeft), height: ringH, background: dim }} />
          <div style={{ position: "fixed", left: ringLeft + ringW, top: ringTop, width: Math.max(0, vw - ringLeft - ringW), height: ringH, background: dim }} />
          <div
            className="tour-ring"
            style={{
              position: "fixed",
              left: ringLeft,
              top: ringTop,
              width: ringW,
              height: ringH,
              borderRadius: 12,
              boxShadow: "0 0 0 2px var(--accent-green), 0 0 0 9999px rgba(0,0,0,0)",
            }}
          />
        </>
      ) : (
        <div style={{ position: "fixed", inset: 0, background: dim }} />
      )}

      <div
        ref={cardRef}
        className="pointer-events-auto rounded-2xl border border-border bg-popover p-4 text-foreground shadow-[0_30px_80px_-24px_rgba(0,0,0,0.95)]"
        style={{ position: "fixed", width: CARD_W, maxWidth: "calc(100vw - 24px)", ...cardStyle }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="ds-overline ds-overline-accent">
            Шаг {index + 1} из {TOUR_TOTAL}
          </p>
          <button
            type="button"
            onClick={onStop}
            aria-label="Выйти из тура"
            className="relative -mr-1 -mt-1 shrink-0 text-muted-foreground transition after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!onRoute ? (
          <>
            <p className="mt-2 text-sm font-medium">Шаг ждёт на другой странице</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              «{step.title}» — этот шаг проходят на другом экране. Перейти туда?
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onGoToRoute}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-green px-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
              >
                Перейти
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onStop}
                className="min-h-10 rounded-xl border border-border px-3 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Выйти
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium">{step.title}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>

            {!box && step.target ? (
              <p className="mt-3 rounded-lg border border-border bg-white/[0.03] px-3 py-2 ds-caption">
                Этого элемента сейчас нет на экране — он появится, когда вы дойдёте до него. Можно
                пропустить шаг.
              </p>
            ) : null}

            {!satisfied && step.hint ? (
              <p className="mt-3 border-l-2 border-accent-green/40 pl-3 ds-caption">{step.hint}</p>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onBack}
                disabled={index === 0}
                className="min-h-10 rounded-xl px-2 text-sm text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Назад
              </button>
              {satisfied ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
                >
                  {index === TOUR_TOTAL - 1 ? "Завершить" : "Далее"}
                  {index === TOUR_TOTAL - 1 ? null : <ArrowRight className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onNext}
                  className="min-h-10 rounded-xl border border-border px-3 text-sm text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground"
                >
                  Пропустить шаг
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
