"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail, Send } from "lucide-react";

import { fmtInt, fmtPct, getDrafts, getMailOverview } from "@/lib/mailing";

// Hub band for the email-mailing feature: a 30-day opens/clicks snapshot plus an
// entry to the email generator.
export function HubMailingPanel() {
  const [ready, setReady] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    setDraftCount(getDrafts().length);
    setReady(true);
  }, []);

  const overview = useMemo(() => getMailOverview(30), []);

  if (!ready) return null;

  return (
    <section className="hub-in mt-12" style={{ "--d": "280ms" } as React.CSSProperties}>
      <div className="mb-4 flex items-center gap-3">
        <span className="ds-feature-icon h-9 w-9 shrink-0">
          <Send className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ds-overline ds-overline-accent">Email</p>
          <h2 className="mt-0.5 text-lg font-semibold">Email-рассылки</h2>
        </div>
        <Link
          href="/mailing"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex"
        >
          Все рассылки
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Snapshot → Кабинет рассылок */}
        <Link
          href="/mailing"
          className="group relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="ds-caption">За 30 дней · Open Rate {fmtPct(overview.totals.openRate)}</p>
              <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                <Metric label="Отправлено" value={fmtInt(overview.totals.sent)} />
                <Metric label="Открытия" value={fmtInt(overview.totals.opens)} />
                <Metric label="Клики" value={fmtInt(overview.totals.clicks)} />
              </div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
              <Send className="h-4 w-4" />
            </span>
          </div>
          <Sparkline values={overview.series.map((p) => p.opens)} />
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-green">
            Открыть рассылки
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {/* Compose entry → Генератор писем */}
        <Link
          href="/email"
          className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-[var(--bg-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
        >
          <div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
              <Mail className="h-4 w-4" />
            </span>
            <p className="mt-3 text-base font-semibold">Создать письмо</p>
            <p className="ds-caption mt-0.5">
              {draftCount > 0 ? `Сохранённых писем: ${draftCount}` : "Соберите письмо с живым предпросмотром"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-green">
            В генератор писем
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
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
        <linearGradient id="hubMailSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-lime)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-lime)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill="url(#hubMailSpark)" />
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
