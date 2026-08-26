"use client";

import { useEffect, useRef, useState } from "react";

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
    <div className="relative mx-auto aspect-square w-full max-w-[380px] select-none">
      {/* Pointer */}
      <div
        className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "16px solid transparent",
          borderRight: "16px solid transparent",
          borderTop: "26px solid #ef4444",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.4))",
        }}
        aria-hidden
      />
      {/* Rotating wheel */}
      <div
        className="h-full w-full rounded-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4.2s cubic-bezier(.15,.85,.25,1)" : "none",
          boxShadow: "0 12px 40px -10px rgba(0,0,0,.55)",
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          {/* Outer rim */}
          <circle cx={cx} cy={cy} r={r} fill={darken(accent, 0.55)} />
          {segments.map((s, i) => {
            const start = i * ang;
            const end = (i + 1) * ang;
            const mid = start + ang / 2;
            const fill = i % 2 === 0 ? accent : darken(accent, 0.38);
            const [tx, ty] = polar(cx, cy, r * 0.62, mid);
            return (
              <g key={i}>
                <path d={sectorPath(cx, cy, r - 8, start, end)} fill={fill} stroke="rgba(255,255,255,.25)" strokeWidth={1} />
                <g transform={`rotate(${mid} ${tx} ${ty})`}>
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize={n > 8 ? 13 : 16}
                    fontWeight={800}
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,.5)" }}
                  >
                    {s.label}
                  </text>
                  {s.sub ? (
                    <text x={tx} y={ty + 16} textAnchor="middle" fill="rgba(255,255,255,.85)" fontSize={10} fontWeight={600}>
                      {s.sub}
                    </text>
                  ) : null}
                </g>
              </g>
            );
          })}
          {/* Rim dots */}
          {Array.from({ length: n }).map((_, i) => {
            const [dx, dy] = polar(cx, cy, r - 3, i * ang);
            return <circle key={i} cx={dx} cy={dy} r={4} fill="#fde047" stroke="#b45309" strokeWidth={1} />;
          })}
        </svg>
      </div>
      {/* Centre hub → click to spin */}
      <button
        type="button"
        onClick={spin}
        disabled={spinning}
        aria-label="Крутить колесо"
        className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-extrabold text-white shadow-lg transition active:scale-95 disabled:opacity-80"
        style={{ background: `radial-gradient(circle at 35% 30%, ${accent}, ${darken(accent, 0.45)})`, border: "4px solid #fff" }}
      >
        SPIN
      </button>
    </div>
  );
}
