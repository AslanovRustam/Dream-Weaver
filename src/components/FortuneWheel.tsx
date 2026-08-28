"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export type WheelSegment = { label: string; sub?: string };

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function sectorPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

// Blend a hex colour toward black by `amt` (0..1) for the alternating sectors.
function darken(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r}, ${g}, ${b})`;
}

// --- Synthesised sound (no audio files, via Web Audio) ---------------------
type Ctx = AudioContext;
function tick(ctx: Ctx, when: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = 1150;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.1, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
  o.connect(g).connect(ctx.destination);
  o.start(when);
  o.stop(when + 0.035);
}
function playTicks(ctx: Ctx, duration: number) {
  const start = ctx.currentTime;
  let t = 0;
  while (t < duration - 0.1) {
    tick(ctx, start + t);
    const frac = t / duration;
    t += 0.035 + 0.33 * frac * frac; // intervals grow → decelerating clack
  }
}
function playWin(ctx: Ctx) {
  const now = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const w = now + i * 0.12;
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(0.16, w + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, w + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(w);
    o.stop(w + 0.42);
  });
}

// Interactive fortune wheel. Spins to a random segment (or a forced one) and
// reports the winning index via onResult after the animation settles.
export function FortuneWheel({
  segments,
  accent = "#f97316",
  forceIndex,
  spinSignal = 0,
  onResult,
}: {
  segments: WheelSegment[];
  accent?: string;
  forceIndex?: number;
  spinSignal?: number; // increment to spin from a parent control
  onResult?: (index: number) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const n = Math.max(2, segments.length);
  const ang = 360 / n;
  const size = 400;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  const spin = () => {
    if (spinning) return;
    const target =
      typeof forceIndex === "number" ? ((forceIndex % n) + n) % n : Math.floor(Math.random() * n);
    setSpinning(true);
    // Sound (spin is a user gesture, so the context can start/resume).
    if (!muted) {
      try {
        type W = Window & { webkitAudioContext?: typeof AudioContext };
        const Ctor = window.AudioContext || (window as W).webkitAudioContext;
        if (Ctor) {
          if (!audioRef.current) audioRef.current = new Ctor();
          const ctx = audioRef.current;
          void ctx.resume();
          playTicks(ctx, 4.2);
          window.setTimeout(() => playWin(ctx), 4200);
        }
      } catch {
        /* audio unavailable — ignore */
      }
    }
    setRotation((prev) => {
      const base = prev - (prev % 360);
      const segCenter = (target + 0.5) * ang;
      const need = (360 - segCenter) % 360; // bring segment centre under the top pointer
      const jitter = (Math.random() - 0.5) * ang * 0.5;
      return base + 360 * 5 + need + jitter;
    });
    window.setTimeout(() => {
      setSpinning(false);
      onResult?.(target);
    }, 4200);
  };

  // Spin when a parent bumps spinSignal (skip the initial 0).
  const lastSignal = useRef(spinSignal);
  useEffect(() => {
    if (spinSignal !== lastSignal.current) {
      lastSignal.current = spinSignal;
      spin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSignal]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-full select-none">
      {/* Mute toggle */}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        className="absolute right-0 top-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/60"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* Pointer */}
      <div
        className="absolute left-1/2 top-[-8px] z-20 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "17px solid transparent",
          borderRight: "17px solid transparent",
          borderTop: "30px solid #ef4444",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.5))",
        }}
        aria-hidden
      />

      {/* Rotating wheel (with accent glow) */}
      <div
        className="h-full w-full rounded-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4.2s cubic-bezier(.15,.85,.25,1)" : "none",
          filter: `drop-shadow(0 0 26px ${accent}66) drop-shadow(0 14px 30px rgba(0,0,0,.55))`,
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          <defs>
            <radialGradient id="fw-sheen" cx="42%" cy="30%" r="75%">
              <stop offset="0%" stopColor="rgba(255,255,255,.30)" />
              <stop offset="45%" stopColor="rgba(255,255,255,.05)" />
              <stop offset="100%" stopColor="rgba(0,0,0,.28)" />
            </radialGradient>
            <linearGradient id="fw-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="45%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
            <radialGradient id="fw-hub" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="30%" stopColor={accent} />
              <stop offset="100%" stopColor={darken(accent, 0.5)} />
            </radialGradient>
            <filter id="fw-dotGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Golden rim + inner base */}
          <circle cx={cx} cy={cy} r={r} fill="url(#fw-rim)" />
          <circle cx={cx} cy={cy} r={r - 8} fill={darken(accent, 0.62)} />

          {/* Sectors */}
          {segments.map((s, i) => {
            const start = i * ang;
            const end = (i + 1) * ang;
            const fill = i % 2 === 0 ? accent : darken(accent, 0.42);
            return (
              <path
                key={i}
                d={sectorPath(cx, cy, r - 12, start, end)}
                fill={fill}
                stroke="rgba(255,255,255,.28)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Glossy sheen over the sectors */}
          <circle cx={cx} cy={cy} r={r - 12} fill="url(#fw-sheen)" pointerEvents="none" />

          {/* Labels (above the sheen so they stay crisp) */}
          {segments.map((s, i) => {
            const mid = i * ang + ang / 2;
            const [tx, ty] = polar(cx, cy, r * 0.6, mid);
            return (
              <g key={i} transform={`rotate(${mid} ${tx} ${ty})`}>
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={n > 8 ? 13 : 16}
                  fontWeight={800}
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}
                >
                  {s.label}
                </text>
                {s.sub ? (
                  <text x={tx} y={ty + 16} textAnchor="middle" fill="rgba(255,255,255,.9)" fontSize={10} fontWeight={600}>
                    {s.sub}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Glowing rim dots */}
          <g filter="url(#fw-dotGlow)">
            {Array.from({ length: n }).map((_, i) => {
              const [dx, dy] = polar(cx, cy, r - 4, i * ang);
              return <circle key={i} cx={dx} cy={dy} r={4} fill="#fef08a" stroke="#b45309" strokeWidth={1} />;
            })}
          </g>
        </svg>
      </div>

      {/* Centre hub → click to spin */}
      <button
        type="button"
        onClick={spin}
        disabled={spinning}
        aria-label="Крутить колесо"
        className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-extrabold text-white transition active:scale-95 disabled:opacity-80"
        style={{
          background: `radial-gradient(circle at 35% 30%, #fff, ${accent} 42%, ${darken(accent, 0.5)})`,
          border: "4px solid #fff",
          boxShadow: `0 0 18px ${accent}aa, inset 0 2px 6px rgba(255,255,255,.5), 0 6px 14px rgba(0,0,0,.5)`,
          textShadow: "0 1px 2px rgba(0,0,0,.5)",
        }}
      >
        SPIN
      </button>
    </div>
  );
}
