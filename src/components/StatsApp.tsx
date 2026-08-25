"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ImagePlus, Megaphone } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AD_PLATFORMS,
  PLATFORM_BY_ID,
  type AdAccount,
  type Campaign,
  type Kpis,
  fmtInt,
  fmtMoney,
  fmtPct,
  getConnectedAccounts,
  getStats,
} from "@/lib/ads";

type MetricKey = "spend" | "impressions" | "clicks" | "conversions";

const RANGES = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

const KPI_DEFS: { key: keyof Kpis; label: string; fmt: (n: number) => string }[] = [
  { key: "spend", label: "Расход", fmt: fmtMoney },
  { key: "impressions", label: "Показы", fmt: fmtInt },
  { key: "clicks", label: "Клики", fmt: fmtInt },
  { key: "ctr", label: "CTR", fmt: fmtPct },
  { key: "conversions", label: "Конверсии", fmt: fmtInt },
  { key: "cpc", label: "CPC", fmt: fmtMoney },
  { key: "cpa", label: "CPA", fmt: fmtMoney },
];

const METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: "spend", label: "Расход", money: true },
  { key: "clicks", label: "Клики" },
  { key: "impressions", label: "Показы" },
  { key: "conversions", label: "Конверсии" },
];

export function StatsApp() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<MetricKey>("spend");
  const [sortKey, setSortKey] = useState<keyof Campaign>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const list = getConnectedAccounts();
    setAccounts(list);
    setSelected(new Set(list.map((a) => a.id)));
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => selected.has(a.id)),
    [accounts, selected],
  );

  const stats = useMemo(
    () => getStats({ accounts: activeAccounts, days }),
    [activeAccounts, days],
  );

  const chartData = useMemo(
    () => stats.series.map((p) => ({ date: p.date, value: p[metric] })),
    [stats.series, metric],
  );

  const campaigns = useMemo(() => {
    const rows = [...stats.campaigns];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [stats.campaigns, sortKey, sortDir]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setSort = (key: keyof Campaign) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // No accounts connected → send the user to the connect screen.
  if (accounts.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <Header />
        <div className="ds-card mt-8 flex flex-col items-center gap-4 rounded-2xl p-10 text-center">
          <Megaphone className="h-8 w-8 text-accent-green" />
          <p className="ds-body max-w-md text-muted-foreground">
            Нет подключённых кабинетов. Подключите площадку, чтобы увидеть статистику.
          </p>
          <Link
            href="/ads"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            Подключить кабинет
          </Link>
        </div>
      </div>
    );
  }

  const money = METRICS.find((m) => m.key === metric)?.money;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Header />

      {/* Filters: accounts + date range */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const p = PLATFORM_BY_ID.get(a.platform)!;
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition ${
                  on ? "border-accent-green/40 bg-accent-green/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {a.name}
              </button>
            );
          })}
        </div>
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
      </div>

      {/* KPI tiles */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {KPI_DEFS.map((k) => (
          <KpiTile
            key={k.key}
            label={k.label}
            value={k.fmt(stats.totals[k.key])}
            delta={stats.deltas[k.key]}
          />
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
                <linearGradient id="fillLime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-lime)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand-lime)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(8, 10) + "." + d.slice(5, 7)}
                tick={{ fill: "var(--muted-foreground, #9AA3B2)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground, #9AA3B2)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(n: number) => (money ? "$" + compact(n) : compact(n))}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover, #1E2128)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground, #9AA3B2)" }}
                formatter={(v: number) => [money ? fmtMoney(v) : fmtInt(v), METRICS.find((m) => m.key === metric)!.label]}
                labelFormatter={(d: string) => d}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--brand-lime)"
                strokeWidth={2}
                fill="url(#fillLime)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--brand-lime)", stroke: "transparent" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Campaigns drill-down */}
      <section className="ds-card mt-4 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <p className="ds-h4">Кампании</p>
          <span className="ds-caption">{campaigns.length} шт.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border text-left ds-caption">
                <th className="px-5 py-2 font-medium">Кампания</th>
                <SortTh label="Расход" col="spend" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="Показы" col="impressions" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="Клики" col="clicks" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="CTR" col="ctr" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="CPC" col="cpc" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="Конв." col="conversions" {...{ sortKey, sortDir, setSort }} />
                <SortTh label="CPA" col="cpa" {...{ sortKey, sortDir, setSort }} />
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const p = PLATFORM_BY_ID.get(c.platform)!;
                return (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                          style={{ backgroundColor: p.color }}
                          aria-hidden
                        >
                          {p.glyph}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="ds-caption">{p.short} · {c.status === "active" ? "активна" : "пауза"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(c.spend)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.impressions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.clicks)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(c.cpc)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.conversions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(c.cpa)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href="/banner"
                        title="Создать баннер для кампании"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-accent-green/50 hover:text-accent-green"
                      >
                        <ImagePlus className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="ds-caption mt-6">
        Демо-режим: данные симулируются детерминированно. Подключите реальные API площадок, чтобы
        видеть фактическую статистику.
      </p>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="ds-overline text-accent-green">Аналитика</p>
        <h1 className="ds-h1 mt-1">Статистика</h1>
        <p className="ds-body mt-2 max-w-xl text-muted-foreground">
          Расход, показы, клики и конверсии по подключённым кабинетам.
        </p>
      </div>
      <Link
        href="/ads"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
      >
        <Megaphone className="h-4 w-4 text-accent-green" />
        Кабинеты
      </Link>
    </header>
  );
}

function KpiTile({ label, value, delta }: { label: string; value: string; delta?: number }) {
  const showDelta = typeof delta === "number" && isFinite(delta) && Math.abs(delta) >= 0.05;
  const up = (delta ?? 0) >= 0;
  return (
    <div className="ds-card rounded-xl p-4">
      <p className="ds-overline">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {showDelta ? (
        <span
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
            up ? "bg-accent-green/15 text-accent-green" : "bg-[var(--status-error)]/15 text-[var(--status-error)]"
          }`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(delta as number).toFixed(1)}%
        </span>
      ) : (
        <span className="mt-1.5 inline-block text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  setSort,
}: {
  label: string;
  col: keyof Campaign;
  sortKey: keyof Campaign;
  sortDir: "asc" | "desc";
  setSort: (k: keyof Campaign) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-5 py-2 text-right font-medium">
      <button
        type="button"
        onClick={() => setSort(col)}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : null}
      </button>
    </th>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}
