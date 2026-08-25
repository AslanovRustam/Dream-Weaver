"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  PLATFORM_BY_ID,
  type Campaign,
  fmtInt,
  fmtMoney,
  fmtPct,
  getCampaignDetail,
} from "@/lib/ads";

type MetricKey = "spend" | "impressions" | "clicks" | "conversions";

const RANGES = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];
const METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: "spend", label: "Расход", money: true },
  { key: "clicks", label: "Клики" },
  { key: "impressions", label: "Показы" },
  { key: "conversions", label: "Конверсии" },
];
const KPI_DEFS: { key: keyof Campaign; label: string; fmt: (n: number) => string }[] = [
  { key: "spend", label: "Расход", fmt: fmtMoney },
  { key: "impressions", label: "Показы", fmt: fmtInt },
  { key: "clicks", label: "Клики", fmt: fmtInt },
  { key: "ctr", label: "CTR", fmt: fmtPct },
  { key: "conversions", label: "Конверсии", fmt: fmtInt },
  { key: "cpc", label: "CPC", fmt: fmtMoney },
  { key: "cpa", label: "CPA", fmt: fmtMoney },
];

export function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(String(params.id));
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<MetricKey>("spend");
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const detail = useMemo(() => (ready ? getCampaignDetail(id, days) : null), [ready, id, days]);
  const chartData = useMemo(
    () => (detail ? detail.series.map((p) => ({ date: p.date, value: p[metric] })) : []),
    [detail, metric],
  );

  if (!ready) return null;

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <BackLink />
        <div className="ds-card mt-6 rounded-2xl p-10 text-center">
          <p className="ds-body text-muted-foreground">
            Кампания не найдена. Возможно, её кабинет не подключён.
          </p>
          <Link
            href="/stats"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            К статистике
          </Link>
        </div>
      </div>
    );
  }

  const { campaign: c } = detail;
  const p = PLATFORM_BY_ID.get(c.platform)!;
  const money = METRICS.find((m) => m.key === metric)?.money;

  const createBanner = () => {
    try {
      window.localStorage.setItem(
        "dw_hub_prompt",
        `Рекламный баннер для кампании «${c.name}» (${p.name}).`,
      );
    } catch {
      /* ignore */
    }
    router.push("/banner");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <BackLink />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: p.color }}
            aria-hidden
          >
            {p.glyph}
          </span>
          <div className="min-w-0">
            <h1 className="ds-h2 truncate">{c.name}</h1>
            <p className="ds-caption">
              {p.name} · {c.status === "active" ? "активна" : "пауза"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`min-h-8 rounded-md px-3 text-xs font-medium transition ${
                  days === r.days ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={createBanner}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-white/5 px-3 text-sm font-medium transition hover:border-accent-green/50 hover:text-accent-green"
          >
            <ImagePlus className="h-4 w-4 text-accent-green" />
            Создать баннер
          </button>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {KPI_DEFS.map((k) => (
          <div key={k.key} className="ds-card rounded-xl p-4">
            <p className="ds-overline">{k.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {k.fmt(c[k.key] as number)}
            </p>
          </div>
        ))}
      </section>

      {/* Trend chart */}
      <section className="ds-card mt-4 rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="ds-h4">Динамика</p>
          <div className="flex rounded-lg border border-border p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`min-h-8 rounded-md px-3 text-xs font-medium transition ${
                  metric === m.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="cdLime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-lime)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand-lime)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(8, 10) + "." + d.slice(5, 7)}
                tick={{ fill: "#9AA3B2", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "#9AA3B2", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(n: number) => (money ? "$" + compact(n) : compact(n))}
              />
              <Tooltip
                contentStyle={{
                  background: "#1E2128",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#9AA3B2" }}
                formatter={(v: number) => [money ? fmtMoney(v) : fmtInt(v), METRICS.find((m) => m.key === metric)!.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--brand-lime)"
                strokeWidth={2}
                fill="url(#cdLime)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--brand-lime)", stroke: "transparent" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/stats"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Назад к статистике
    </Link>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}
