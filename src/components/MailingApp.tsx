"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Send, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AUDIENCES,
  AUDIENCE_BY_ID,
  type EmailDraft,
  type MailCampaign,
  fmtInt,
  fmtPct,
  getCampaigns,
  getDrafts,
  getMailOverview,
  sendCampaign,
} from "@/lib/mailing";

const RANGES = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

export function MailingApp() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [campaigns, setCampaigns] = useState<MailCampaign[]>([]);
  const [days, setDays] = useState(30);
  const [draftId, setDraftId] = useState("");
  const [audienceId, setAudienceId] = useState(AUDIENCES[0].id);
  const [justSent, setJustSent] = useState<string | null>(null);

  const refresh = () => {
    setDrafts(getDrafts());
    setCampaigns(getCampaigns());
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (drafts.length && !draftId) setDraftId(drafts[0].id);
  }, [drafts, draftId]);

  const overview = useMemo(() => getMailOverview(days), [days, campaigns]);
  const chartData = overview.series;

  const send = () => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;
    const c = sendCampaign({ draft, audienceId });
    setCampaigns(getCampaigns());
    setJustSent(c.name);
    setTimeout(() => setJustSent(null), 4000);
  };

  const audience = AUDIENCE_BY_ID.get(audienceId);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ds-overline text-accent-green">Рассылки</p>
          <h1 className="ds-h1 mt-1">Кабинет рассылок</h1>
          <p className="ds-body mt-2 max-w-xl text-muted-foreground">
            Отправляйте письма по аудиториям и следите за открытиями и кликами.
          </p>
        </div>
        <Link
          href="/email"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
        >
          <Mail className="h-4 w-4 text-accent-green" />
          Создать письмо
        </Link>
      </header>

      {/* Date range */}
      <div className="mt-6 flex justify-end">
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
      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Отправлено" value={fmtInt(overview.totals.sent)} />
        <Kpi label="Доставлено" value={fmtInt(overview.totals.delivered)} />
        <Kpi label="Открытия" value={fmtInt(overview.totals.opens)} />
        <Kpi label="Клики" value={fmtInt(overview.totals.clicks)} />
        <Kpi label="Open Rate" value={fmtPct(overview.totals.openRate)} />
        <Kpi label="CTR" value={fmtPct(overview.totals.ctr)} />
      </section>

      {/* Trend + create side by side */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="ds-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="ds-h4">Открытия и клики</p>
            <div className="flex items-center gap-4 ds-caption">
              <Legend color="var(--brand-lime)" label="Открытия" />
              <Legend color="var(--brand-violet)" label="Клики" />
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="mOpens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-lime)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand-lime)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-violet)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--brand-violet)" stopOpacity={0} />
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
                  width={40}
                  tickFormatter={(n: number) => (n >= 1000 ? (n / 1000).toFixed(0) + "k" : String(n))}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1E2128",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#9AA3B2" }}
                  formatter={(v: number, n: string) => [fmtInt(v), n === "opens" ? "Открытия" : "Клики"]}
                />
                <Area type="monotone" dataKey="opens" stroke="var(--brand-lime)" strokeWidth={2} fill="url(#mOpens)" dot={false} />
                <Area type="monotone" dataKey="clicks" stroke="var(--brand-violet)" strokeWidth={2} fill="url(#mClicks)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Create a campaign */}
        <section className="ds-card flex flex-col gap-4 rounded-2xl p-5">
          <p className="ds-h4">Создать рассылку</p>
          {drafts.length === 0 ? (
            <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-xl border border-dashed border-border p-5">
              <p className="ds-body text-muted-foreground">
                Нет сохранённых писем. Сначала соберите письмо в генераторе.
              </p>
              <Link
                href="/email"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
              >
                <Mail className="h-4 w-4" /> Создать письмо
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block ds-label">Письмо</label>
                <select
                  className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  value={draftId}
                  onChange={(e) => setDraftId(e.target.value)}
                >
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.subject}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block ds-label">Аудитория</label>
                <select
                  className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  value={audienceId}
                  onChange={(e) => setAudienceId(e.target.value)}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {fmtInt(a.count)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="ds-caption inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Получателей: {fmtInt(audience?.count ?? 0)}
              </p>
              <button
                type="button"
                onClick={send}
                className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
              >
                <Send className="h-4 w-4" /> Отправить рассылку
              </button>
              {justSent ? (
                <p className="ds-caption text-accent-green">Отправлено: «{justSent}» — появилось в списке ниже.</p>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* Campaigns table */}
      <section className="ds-card mt-4 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <p className="ds-h4">Кампании</p>
          <span className="ds-caption">{campaigns.length} шт.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border text-left ds-caption">
                <th className="px-5 py-2 font-medium">Кампания</th>
                <th className="px-5 py-2 font-medium">Аудитория</th>
                <th className="px-5 py-2 font-medium">Статус</th>
                <th className="px-5 py-2 text-right font-medium">Получатели</th>
                <th className="px-5 py-2 text-right font-medium">Открытия</th>
                <th className="px-5 py-2 text-right font-medium">Open Rate</th>
                <th className="px-5 py-2 text-right font-medium">Клики</th>
                <th className="px-5 py-2 text-right font-medium">CTR</th>
                <th className="px-5 py-2 text-right font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const aud = AUDIENCE_BY_ID.get(c.audienceId);
                const openRate = c.delivered ? (c.opens / c.delivered) * 100 : 0;
                const ctr = c.delivered ? (c.clicks / c.delivered) * 100 : 0;
                return (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="max-w-[240px] truncate font-medium">{c.name}</p>
                      <p className="max-w-[240px] truncate ds-caption">{c.subject}</p>
                    </td>
                    <td className="px-5 py-3">{aud?.name ?? "—"}</td>
                    <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.recipients)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.opens)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtPct(openRate)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtInt(c.clicks)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtPct(ctr)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.sentAt ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="ds-caption mt-6">
        Демо-режим: отправка и статистика симулируются. Реальная доставка подключается через ESP
        (SendGrid / Mailgun) и его API.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-card rounded-xl p-4">
      <p className="ds-overline">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: "draft" | "scheduled" | "sent" }) {
  const map = {
    sent: { label: "Отправлена", cls: "bg-accent-green/15 text-accent-green" },
    scheduled: { label: "Запланир.", cls: "bg-[color:var(--brand-cyan)]/15 text-[color:var(--brand-cyan)]" },
    draft: { label: "Черновик", cls: "bg-white/10 text-muted-foreground" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${map.cls}`}>
      {map.label}
    </span>
  );
}
