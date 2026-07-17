"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { SECTIONS } from "@/lib/sections";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";

type RecentCard = {
  id: string;
  name: string;
  updatedLabel: string;
  thumb: string | null;
};

export default function HubPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [recent, setRecent] = useState<RecentCard[]>([]);

  useEffect(() => {
    document.title = "Dream Weaver Studio";
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  // Recent projects across all sections. Only banner projects exist today, so
  // we read the banner history. On any failure we simply show nothing (this
  // block is optional — never a blocking error on the Hub).
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    apiJson<{ items?: unknown[] }>("/api/history?bucket=active")
      .then((r) => {
        if (cancelled) return;
        // GET /api/history returns { items, total, offset, limit }.
        const cards = Array.isArray(r?.items) ? r.items : [];
        const mapped: RecentCard[] = cards.slice(0, 5).map((raw) => {
          const c = raw as Record<string, unknown>;
          const master = c.master as Record<string, unknown> | null | undefined;
          const ts = (c.last_activity_at || c.updated_at || c.created_at) as string | undefined;
          let updatedLabel = "";
          if (ts) {
            const d = new Date(ts);
            if (!Number.isNaN(d.getTime())) {
              updatedLabel = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            }
          }
          return {
            id: String(c.id ?? ""),
            name: (c.name as string) || "Проект без названия",
            updatedLabel,
            thumb: (master?.image_url as string) || null,
          };
        });
        setRecent(mapped.filter((m) => m.id));
      })
      .catch(() => {
        /* no recent block on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Что будем создавать?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
          Выберите инструмент — каждый проведёт вас по шагам до готового результата.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className="flex flex-col rounded-2xl border border-accent-green p-5 shadow-[0_0_50px_rgba(212,255,61,0.10)] transition hover:shadow-[0_0_60px_rgba(212,255,61,0.16)] sm:p-6"
                style={{
                  // Same gradient as the "popular" package on the pricing page.
                  background:
                    "linear-gradient(180deg, rgba(212,255,61,0.14) 0%, rgba(212,255,61,0.05) 20%, rgba(22,22,22,0.92) 52%, var(--bg-surface) 100%)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-background text-accent-green">
                    <Icon className="h-6 w-6" />
                  </span>
                  {s.id === "banner" ? (
                    <span className="rounded-full border border-accent-green/50 bg-accent-green/10 px-2.5 py-1 text-xs font-semibold text-accent-green">
                      Рекомендуем начать
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-lg font-semibold">{s.title}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.description}</p>
                <button
                  type="button"
                  onClick={() => router.push(s.route)}
                  className="mt-4 w-full rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  {s.cta}
                </button>
              </div>
            );
          })}
        </div>

        {recent.length > 0 ? (
          <div className="mt-12">
            <h2 className="mb-4 text-lg font-semibold">Недавние проекты</h2>
            {/* Horizontal scroll on mobile, wrapped grid on desktop. */}
            <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
              {recent.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/banner?card=${p.id}`)}
                  className="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition hover:border-white/25 hover:bg-[var(--bg-surface-hover)] sm:w-auto"
                >
                  <div className="relative aspect-[4/3] w-full bg-background">
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-6 w-6" />
                      </span>
                    )}
                    <span
                      className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-accent-green backdrop-blur"
                      title="Баннер-генератор"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="min-w-0 p-2.5">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    {p.updatedLabel ? (
                      <p className="ds-micro text-muted-foreground">{p.updatedLabel}</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
