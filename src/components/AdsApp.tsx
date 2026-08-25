"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, Plug, Trash2 } from "lucide-react";

import {
  AD_PLATFORMS,
  type AdAccount,
  type AdPlatformId,
  connectPlatform,
  disconnectAccount,
  getConnectedAccounts,
} from "@/lib/ads";

export function AdsApp() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [busy, setBusy] = useState<AdPlatformId | null>(null);

  useEffect(() => {
    setAccounts(getConnectedAccounts());
  }, []);

  const connect = (id: AdPlatformId) => {
    // Simulated OAuth round-trip so the button shows a brief connecting state.
    setBusy(id);
    setTimeout(() => {
      setAccounts(connectPlatform(id));
      setBusy(null);
    }, 550);
  };

  const disconnect = (accountId: string) => setAccounts(disconnectAccount(accountId));

  const connectedIds = new Set(accounts.map((a) => a.platform));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ds-overline text-accent-green">Интеграции</p>
          <h1 className="ds-h1 mt-1">Рекламные кабинеты</h1>
          <p className="ds-body mt-2 max-w-xl text-muted-foreground">
            Подключите площадки, чтобы собирать статистику и запускать креативы из генератора.
          </p>
        </div>
        <Link
          href="/stats"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
        >
          <BarChart3 className="h-4 w-4 text-accent-green" />
          Статистика
        </Link>
      </header>

      {/* Platform cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AD_PLATFORMS.map((p) => {
          const connected = connectedIds.has(p.id);
          return (
            <div key={p.id} className="ds-card flex flex-col gap-4 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.glyph}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{p.name}</p>
                  <p className="ds-caption truncate">{p.blurb}</p>
                </div>
              </div>

              {connected ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-medium text-accent-green">
                  <Check className="h-3.5 w-3.5" /> Подключено
                </span>
              ) : (
                <span className="ds-caption">Не подключено</span>
              )}

              <button
                type="button"
                onClick={() => connect(p.id)}
                disabled={connected || busy === p.id}
                className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
                  connected
                    ? "cursor-default border border-border text-muted-foreground"
                    : "bg-accent-green text-on-accent hover:bg-[var(--accent-hover)]"
                }`}
              >
                {busy === p.id ? (
                  "Подключение…"
                ) : connected ? (
                  "Кабинет активен"
                ) : (
                  <>
                    <Plug className="h-4 w-4" /> Подключить
                  </>
                )}
              </button>
            </div>
          );
        })}
      </section>

      {/* Connected accounts */}
      <section className="mt-10">
        <h2 className="ds-h3 mb-3">Подключённые кабинеты</h2>
        {accounts.length === 0 ? (
          <div className="ds-card rounded-2xl p-8 text-center">
            <p className="ds-body text-muted-foreground">
              Пока ничего не подключено. Выберите площадку выше, чтобы начать.
            </p>
          </div>
        ) : (
          <div className="ds-card overflow-hidden rounded-2xl">
            <ul className="divide-y divide-border">
              {accounts.map((a) => {
                const p = AD_PLATFORMS.find((x) => x.id === a.platform)!;
                return (
                  <li key={a.id} className="flex items-center gap-3 p-4">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    >
                      {p.glyph}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="ds-caption truncate tabular-nums">
                        {p.short} · ID {a.externalId} · {a.currency}
                      </p>
                    </div>
                    <StatusPill status={a.status} />
                    <button
                      type="button"
                      onClick={() => disconnect(a.id)}
                      aria-label="Отключить кабинет"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-[var(--status-error)]/50 hover:text-[var(--status-error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <p className="ds-caption mt-6">
        Демо-режим: подключение и данные симулируются. Реальная авторизация площадок добавляется
        подключением их OAuth и API-ключей.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: "active" | "paused" }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-accent-green/15 text-accent-green" : "bg-white/10 text-muted-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent-green" : "bg-muted-foreground"}`}
      />
      {active ? "Активен" : "Пауза"}
    </span>
  );
}
