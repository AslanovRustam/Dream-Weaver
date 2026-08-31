"use client";

import { useEffect, useRef, useState } from "react";

// Interactive crash game: a multiplier climbs along a rising curve; tap CASH OUT
// before it "crashes" to lock in the multiplier. Starts on the internal button
// or on a spinSignal bump (the landing's external CTA). Reports {win, multiplier}
// via onResult when the round ends (cash out = win, crash = loss).
export function CrashGame({
  accent = "#ef4444",
  spinSignal = 0,
  startLabel = "СТАРТ",
  cashLabel = "ЗАБРАТЬ",
  retryLabel = "Ещё раз",
  onResult,
}: {
  accent?: string;
  spinSignal?: number;
  startLabel?: string;
  cashLabel?: string;
  retryLabel?: string;
  onResult?: (win: boolean, multiplier: string) => void;
}) {
  const [mult, setMult] = useState(1);
  const [phase, setPhase] = useState<"idle" | "running" | "cashed" | "crashed">("idle");
  const timerRef = useRef(0);
  const crashAtRef = useRef(0);
  const startTsRef = useRef(0);
  const phaseRef = useRef<"idle" | "running" | "cashed" | "crashed">("idle");
  const multRef = useRef(1);

  // setInterval (not requestAnimationFrame) so the multiplier keeps climbing even
  // when the page/preview is not the foreground tab (rAF is frozen there).
  const start = () => {
    window.clearInterval(timerRef.current);
    crashAtRef.current = 2 + Math.random() * 8; // demo: usually reachable
    startTsRef.current = performance.now();
    phaseRef.current = "running";
    multRef.current = 1;
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
            transform: `rotate(${-(18 + p * 30)}deg)`,
            opacity: phase === "crashed" ? 0.25 : 0.85,
          }}
        />
        {/* rocket */}
        <div
          className="pointer-events-none absolute text-3xl transition-transform duration-75 ease-linear"
          style={{
            left: "8%",
            bottom: "8%",
            transform: `translate(${p * 62}%, ${-p * 150}%) rotate(12deg)`,
            opacity: phase === "crashed" ? 0 : 1,
          }}
        >
          🚀
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
        className="mx-auto mt-3 flex h-12 w-full max-w-[260px] items-center justify-center rounded-full text-base font-extrabold uppercase tracking-wide text-white transition active:scale-95"
        style={{
          background:
            phase === "running"
              ? `radial-gradient(circle at 30% 25%, #fff6, transparent 45%), linear-gradient(180deg, ${accent}, ${accent}bb)`
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
