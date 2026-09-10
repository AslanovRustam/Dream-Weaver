"use client";

import { useEffect, useRef, useState } from "react";

// Interactive crash game: a multiplier climbs along a rising curve; tap CASH OUT
// before it "crashes" to lock in the multiplier. Starts on the internal button
// or on a spinSignal bump (the landing's external CTA). Reports {win, multiplier}
// via onResult when the round ends (cash out = win, crash = loss).
// The trail line's angle above horizontal at progress p (0..1) — see the
// `rotate(${-(18 + p * 30)}deg)` below. Both the trail AND the rocket derive
// their angle from this single formula so they can never disagree.
const trailAngleDeg = (p: number) => 18 + p * 30;
// The rocket artwork's OWN baked-in orientation: both the 🚀 emoji glyph
// (across every common emoji font) and the AI-generated icon (explicitly
// prompted for this) point up-and-to-the-right at ~45° above horizontal by
// default. Rotating by (ROCKET_BASELINE_DEG - trailAngleDeg) turns that
// baseline into "pointing exactly along the current trail angle" — see the
// derivation in the rocket transform below.
const ROCKET_BASELINE_DEG = 45;

export function CrashGame({
  accent = "#ef4444",
  spinSignal = 0,
  startLabel = "СТАРТ",
  cashLabel = "ЗАБРАТЬ",
  retryLabel = "Ещё раз",
  /** Max rounds the player may start. undefined/0 = unlimited (default,
   *  unchanged behaviour). Once reached, the internal button locks and
   *  start() (incl. via spinSignal) becomes a no-op. */
  maxAttempts,
  /** AI-generated rocket icon (data: URL), pointing up-and-right at
   *  ROCKET_BASELINE_DEG by convention (see generate-crash-rocket's
   *  prompt). Omitted = the 🚀 emoji glyph, same convention. */
  rocketImage,
  onResult,
  onAttemptsChange,
}: {
  accent?: string;
  spinSignal?: number;
  startLabel?: string;
  cashLabel?: string;
  retryLabel?: string;
  maxAttempts?: number;
  rocketImage?: string;
  onResult?: (win: boolean, multiplier: string) => void;
  /** Fired whenever the attempt count changes, so a parent landing can show
   *  "N попыток осталось" / disable its own external start button too. */
  onAttemptsChange?: (used: number, left: number | null) => void;
}) {
  const [mult, setMult] = useState(1);
  const [phase, setPhase] = useState<"idle" | "running" | "cashed" | "crashed">("idle");
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const timerRef = useRef(0);
  const crashAtRef = useRef(0);
  const startTsRef = useRef(0);
  const phaseRef = useRef<"idle" | "running" | "cashed" | "crashed">("idle");
  const multRef = useRef(1);
  const attemptsUsedRef = useRef(0);
  const exhausted = !!maxAttempts && attemptsUsed >= maxAttempts;

  // setInterval (not requestAnimationFrame) so the multiplier keeps climbing even
  // when the page/preview is not the foreground tab (rAF is frozen there).
  const start = () => {
    if (maxAttempts && attemptsUsedRef.current >= maxAttempts) return; // out of tries
    window.clearInterval(timerRef.current);
    crashAtRef.current = 2 + Math.random() * 8; // demo: usually reachable
    startTsRef.current = performance.now();
    phaseRef.current = "running";
    multRef.current = 1;
    attemptsUsedRef.current += 1;
    setAttemptsUsed(attemptsUsedRef.current);
    onAttemptsChange?.(
      attemptsUsedRef.current,
      maxAttempts ? Math.max(0, maxAttempts - attemptsUsedRef.current) : null,
    );
    setPhase("running");
    setMult(1);
    timerRef.current = window.setInterval(() => {
      const dt = (performance.now() - startTsRef.current) / 1000;
      const m = Math.pow(1.0718, dt * 10);
      if (m >= crashAtRef.current) {
        window.clearInterval(timerRef.current);
        multRef.current = crashAtRef.current;
        setMult(crashAtRef.current);
        phaseRef.current = "crashed";
        setPhase("crashed");
        onResult?.(false, crashAtRef.current.toFixed(2));
        return;
      }
      multRef.current = m;
      setMult(m);
    }, 45);
  };

  const cashOut = () => {
    if (phaseRef.current !== "running") return;
    window.clearInterval(timerRef.current);
    phaseRef.current = "cashed";
    setPhase("cashed");
    onResult?.(true, multRef.current.toFixed(2));
  };

  useEffect(() => () => window.clearInterval(timerRef.current), []);

  const lastSignal = useRef(spinSignal);
  useEffect(() => {
    if (spinSignal !== lastSignal.current) {
      lastSignal.current = spinSignal;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSignal]);

  const p = Math.min(1, (mult - 1) / 9); // 0..1 progress for the rocket/curve
  const multColor = phase === "crashed" ? "#f87171" : phase === "cashed" ? "#4ade80" : accent;
  const onBtn = phase === "running" ? cashOut : start;
  const btnLabel =
    phase === "running"
      ? `${cashLabel} ×${mult.toFixed(2)}`
      : exhausted
        ? "Попытки закончились"
        : phase === "idle"
          ? startLabel
          : retryLabel;

  return (
    <div className="relative mx-auto flex w-full max-w-[420px] select-none flex-col">
      {/* Graph */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border"
        style={{
          aspectRatio: "10 / 9",
          borderColor: `${accent}66`,
          background: "radial-gradient(130% 120% at 0% 100%, " + accent + "22, transparent 62%), #0c0718",
          boxShadow: `0 0 26px ${accent}44, 0 14px 30px rgba(0,0,0,.5)`,
        }}
      >
        {/* rising trail line */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 origin-bottom-left"
          style={{
            width: "150%",
            height: "3px",
            background: `linear-gradient(90deg, transparent, ${accent})`,
            transform: `rotate(${-trailAngleDeg(p)}deg)`,
            opacity: phase === "crashed" ? 0.25 : 0.85,
          }}
        />
        {/* rocket — travels AND points along the exact same angle as the
            trail line above (trailAngleDeg), so the two never disagree. */}
        <div
          className="pointer-events-none absolute flex items-center justify-center text-3xl transition-transform duration-75 ease-linear"
          style={{
            left: "8%",
            bottom: "8%",
            width: rocketImage ? 34 : undefined,
            height: rocketImage ? 34 : undefined,
            transform: (() => {
              const angle = trailAngleDeg(p);
              const rad = (angle * Math.PI) / 180;
              const dist = p * 165; // % of the rocket's own box — matches the previous travel magnitude
              const dx = dist * Math.cos(rad);
              const dy = -dist * Math.sin(rad);
              return `translate(${dx}%, ${dy}%) rotate(${ROCKET_BASELINE_DEG - angle}deg)`;
            })(),
            opacity: phase === "crashed" ? 0 : 1,
          }}
        >
          {rocketImage ? (
            <img src={rocketImage} alt="" draggable={false} className="h-full w-full select-none object-contain" />
          ) : (
            "🚀"
          )}
        </div>
        {/* multiplier */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-extrabold tabular-nums"
            style={{ fontSize: "clamp(30px,8vw,50px)", color: multColor, textShadow: "0 2px 14px rgba(0,0,0,.55)" }}
          >
            {phase === "crashed" ? `💥 ${mult.toFixed(2)}x` : `${mult.toFixed(2)}x`}
          </span>
        </div>
      </div>

      {/* Cash out / start / retry */}
      <button
        type="button"
        onClick={onBtn}
        disabled={exhausted && phase !== "running"}
        className="mx-auto mt-3 flex h-12 w-full max-w-[260px] items-center justify-center rounded-full text-base font-extrabold uppercase tracking-wide text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        style={{
          background:
            phase === "running"
              ? `radial-gradient(circle at 30% 25%, #fff6, transparent 45%), linear-gradient(180deg, ${accent}, ${accent}bb)`
              : exhausted
                ? "linear-gradient(180deg,#3a4150,#2a303c)"
                : phase === "idle"
                  ? `radial-gradient(circle at 30% 25%, #fff6, transparent 45%), linear-gradient(180deg, ${accent}, ${accent}bb)`
                  : "linear-gradient(180deg,#3a4150,#2a303c)",
          border: "2px solid rgba(255,255,255,.6)",
          boxShadow: `0 0 16px ${accent}88, inset 0 2px 6px rgba(255,255,255,.35), 0 6px 14px rgba(0,0,0,.5)`,
          textShadow: "0 1px 2px rgba(0,0,0,.5)",
        }}
      >
        {btnLabel}
      </button>
    </div>
  );
}
