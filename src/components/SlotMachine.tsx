"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

// --- Synthesised sound (no audio files, via Web Audio) ---------------------
type Ctx = AudioContext;
function tick(ctx: Ctx, when: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.08, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
  o.connect(g).connect(ctx.destination);
  o.start(when);
  o.stop(when + 0.035);
}
function playReelRoll(ctx: Ctx, duration: number) {
  const start = ctx.currentTime;
  let t = 0;
  while (t < duration - 0.05) {
    tick(ctx, start + t);
    t += 0.06; // steady mechanical roll
  }
}
function playWin(ctx: Ctx) {
  const now = ctx.currentTime;
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const w = now + i * 0.1;
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(0.16, w + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, w + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(w);
    o.stop(w + 0.42);
  });
}

const REELS = 3;
const VISIBLE = 3; // rows in the window; the centre row is the payline
const BASE = 24; // resting strip offset (cells)
const REPEATS = 60; // total copies of the symbol list stacked in each reel
const DUR = [2.4, 2.9, 3.4]; // per-reel spin seconds (staggered stops)
const PAD = 12;
const GAP = 8;

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Interactive slot machine. Spins three reels to a random outcome (or a forced
// win) and reports {win, symbol} via onResult after the reels settle.
export function SlotMachine({
  symbols,
  accent = "#818cf8",
  spinSignal = 0,
  forceWin,
  onResult,
}: {
  symbols: string[];
  accent?: string;
  spinSignal?: number;
  forceWin?: boolean;
  onResult?: (win: boolean, symbol: string) => void;
}) {
  const syms = symbols.length >= 3 ? symbols : ["🍒", "💎", "7️⃣"];
  const len = syms.length;
  const [pos, setPos] = useState<number[]>(() => Array.from({ length: REELS }, (_, i) => BASE * len + i));
  const [dur, setDur] = useState<number[]>([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cell, setCell] = useState(76);
  const audioRef = useRef<AudioContext | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Measure the available box → square reel cells sized by the MIN of width and
  // height so the whole cabinet fills the space and never overflows the frame.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const CHROME = 122; // bulbs + payline rounding + SPIN lever + paddings around the reels
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const byW = (w - PAD * 2 - GAP * (REELS - 1)) / REELS;
      const byH = h > CHROME + 60 ? (h - CHROME) / VISIBLE : byW;
      const c = Math.floor(Math.min(byW, byH));
      if (c > 20) setCell(c);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spin = () => {
    if (spinning) return;
    const win = typeof forceWin === "boolean" ? forceWin : Math.random() < 0.45;
    const winK = Math.floor(Math.random() * len);
    const targets = Array.from({ length: REELS }, (_, i) =>
      win ? winK : Math.floor(Math.random() * len),
    );
    // On a loss, make sure the reels don't accidentally line up.
    if (!win && targets[0] === targets[1] && targets[1] === targets[2]) {
      targets[2] = (targets[2] + 1) % len;
    }
    setSpinning(true);

    if (!muted) {
      try {
        type W = Window & { webkitAudioContext?: typeof AudioContext };
        const Ctor = window.AudioContext || (window as W).webkitAudioContext;
        if (Ctor) {
          if (!audioRef.current) audioRef.current = new Ctor();
          const ctx = audioRef.current;
          void ctx.resume();
          playReelRoll(ctx, DUR[REELS - 1]);
          if (win) window.setTimeout(() => playWin(ctx), DUR[REELS - 1] * 1000);
        }
      } catch {
        /* audio unavailable — ignore */
      }
    }

    const newPos = pos.map((p, i) => {
      const spins = (4 + i) * len; // farther reels travel more turns
      const delta = mod(targets[i] - mod(p, len), len);
      return p + spins + delta;
    });
    setDur([...DUR]);
    setPos(newPos);

    window.setTimeout(() => {
      // Normalise back into the resting range without animating (same symbol mod).
      setDur([0, 0, 0]);
      setPos(newPos.map((p) => BASE * len + mod(p, len)));
      setSpinning(false);
      onResult?.(win, syms[win ? winK : targets[0]]);
    }, DUR[REELS - 1] * 1000 + 250);
  };

  // Spin when a parent bumps spinSignal (skip the initial value).
  const lastSignal = useRef(spinSignal);
  useEffect(() => {
    if (spinSignal !== lastSignal.current) {
      lastSignal.current = spinSignal;
      spin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSignal]);

  const windowH = VISIBLE * cell;

  return (
    <div ref={wrapRef} className="relative mx-auto flex h-full w-full max-w-[420px] flex-col items-center justify-center select-none">
      {/* Mute toggle */}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        className="absolute right-1 top-1 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/60"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* Cabinet */}
      <div
        className="rounded-[20px] p-[3px]"
        style={{
          background: `linear-gradient(180deg, #fde68a, ${accent} 45%, #78350f)`,
          filter: `drop-shadow(0 0 22px ${accent}66) drop-shadow(0 14px 30px rgba(0,0,0,.55))`,
        }}
      >
        <div
          className="rounded-[18px] p-3"
          style={{ background: "linear-gradient(180deg, #1b1030, #0c0718)" }}
        >
          {/* Marquee bulbs */}
          <div className="mb-2 flex justify-center gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
              />
            ))}
          </div>

          {/* Reels window */}
          <div
            className="relative overflow-hidden rounded-xl"
            style={{
              height: windowH,
              padding: 0,
              background: "linear-gradient(180deg, #050308, #140a24 50%, #050308)",
              border: "1px solid rgba(255,255,255,.08)",
            }}
          >
            <div className="flex h-full justify-center" style={{ gap: GAP }}>
              {pos.map((p, ri) => (
                <div
                  key={ri}
                  className="overflow-hidden rounded-md"
                  style={{ width: cell, height: windowH, background: "rgba(255,255,255,.03)" }}
                >
                  <div
                    style={{
                      transform: `translateY(${(1 - p) * cell}px)`,
                      transition: dur[ri] ? `transform ${dur[ri]}s cubic-bezier(.12,.7,.2,1)` : "none",
                    }}
                  >
                    {Array.from({ length: REPEATS * len }).map((_, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-center"
                        style={{ height: cell, fontSize: cell * 0.56, lineHeight: 1 }}
                      >
                        {syms[j % len]}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Top/bottom fade for depth */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ height: cell, background: "linear-gradient(180deg, rgba(5,3,8,.95), transparent)" }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ height: cell, background: "linear-gradient(0deg, rgba(5,3,8,.95), transparent)" }}
            />

            {/* Payline (centre row) */}
            <div
              className="pointer-events-none absolute inset-x-1 z-10 rounded-md"
              style={{
                top: cell,
                height: cell,
                border: `2px solid ${accent}`,
                boxShadow: `0 0 14px ${accent}aa, inset 0 0 12px ${accent}55`,
              }}
            />
            {/* Payline arrows */}
            <div
              className="pointer-events-none absolute left-[-2px] z-10"
              style={{
                top: cell + cell / 2 - 7,
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderLeft: `10px solid ${accent}`,
              }}
            />
            <div
              className="pointer-events-none absolute right-[-2px] z-10"
              style={{
                top: cell + cell / 2 - 7,
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderRight: `10px solid ${accent}`,
              }}
            />
          </div>

          {/* SPIN lever */}
          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            aria-label="Крутить барабаны"
            className="mx-auto mt-3 flex h-12 w-full max-w-[220px] items-center justify-center rounded-full text-base font-extrabold uppercase tracking-wide text-white transition active:scale-95 disabled:opacity-80"
            style={{
              background: `radial-gradient(circle at 30% 25%, #fff6, transparent 45%), linear-gradient(180deg, ${accent}, ${accent}bb)`,
              border: "2px solid rgba(255,255,255,.65)",
              boxShadow: `0 0 16px ${accent}aa, inset 0 2px 6px rgba(255,255,255,.4), 0 6px 14px rgba(0,0,0,.5)`,
              textShadow: "0 1px 2px rgba(0,0,0,.5)",
            }}
          >
            {spinning ? "…" : "SPIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
