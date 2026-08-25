"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Megaphone, Plug } from "lucide-react";

import {
  AD_PLATFORMS,
  PLATFORM_BY_ID,
  type AdAccount,
  fmtInt,
  fmtMoney,
  getConnectedAccounts,
  getStats,
} from "@/lib/ads";

// Hub band that ties the ad-accounts feature into the home page: a live 30-day
// snapshot when cabinets are connected, or a connect CTA when none are.
export function HubAdsPanel() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAccounts(getConnectedAccounts());
    setReady(true);
  }, []);

  const stats = useMemo(() => getStats({ accounts, days: 30 }), [accounts]);

  // Avoid a first-paint flash of the empty state before localStorage is read.
  if (!ready) return null;

  const connected = accounts.length > 0;

  return (
    <section className="hub-in mt-12" style={{ "--d": "260ms" } as React.CSSProperties}>
      <div className="mb-4 flex items-center gap-3">
        <span className="ds-feature-icon h-9 w-9 shrink-0">
          <Megaphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ds-overline ds-overline-accent">Реклама</p>
          <h2 className="mt-0.5 text-lg font-semibold">Реклама и аналитика</h2>
        </div>
        <Link
          href="/ads"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex"
        >
          Все кабинеты
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {connected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Live snapshot → Статистика */}
          <Link
            href="/stats"
            className="group relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ds-caption">За 30 дней · {accounts.length} каб.</p>
                <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                  <Metric label="Расход" value={fmtMoney(stats.totals.spend)} />
                  <Metric label="Клики" value={fmtInt(stats.totals.clicks)} />
                  <Metric label="Конверсии" value={fmtInt(stats.totals.conversions)} />
                </div>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
                <BarChart3 className="h-4 w-4" />
              </span>
            </div>
            <Sparkline values={stats.series.map((p) => p.spend)} />
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-green">
              Открыть статистику
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {/* Connected cabinets → /ads */}
          <Link
            href="/ads"
            className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-[var(--bg-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
          >
            <div>
              <p className="text-base font-semibold">Кабинеты</p>
              <p className="ds-caption mt-0.5">Подключено {accounts.length} из {AD_PLATFORMS.length}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {accounts.slice(0, 3).map((a) => {
                const p = PLATFORM_BY_ID.get(a.platform)!;
                return (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    >
                      {p.glyph}
                    </span>
                    <span className="truncate text-sm">{a.name}</span>
                  </li>
                );
              })}
            </ul>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-green">
              Управлять
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      ) : (
        // Connect CTA when nothing is linked yet.
        <div className="flex flex-col items-start gap-5 overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-green/15 text-accent-green">
              <Megaphone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold">Подключите рекламные кабинеты</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Meta, Google и TikTok — статистика расхода, кликов и конверсий в одном месте.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:flex" aria-hidden>
              {AD_PLATFORMS.map((p) => (
                <span
                  key={p.id}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: p.color }}
                >
                  {p.glyph}
                </span>
              ))}
            </span>
            <Link
              href="/ads"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
            >
              <Plug className="h-4 w-4" />
              Подключить
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="ds-overline">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </span>
  );
}

// Lightweight inline sparkline (no chart lib on the Hub). Lime stroke + fade.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id="hubSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-lime)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-lime)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill="url(#hubSpark)" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--brand-lime)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
