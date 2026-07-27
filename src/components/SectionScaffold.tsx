"use client";

// Shared scaffold for the not-yet-built sections (landing / playable / video).
// Mirrors the Banner-generator shell — 3 columns on desktop (templates /
// settings / result, 20/40/40), a step wizard on mobile (Назад + sticky CTA) —
// but with placeholder content. No real generation logic yet.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { getCreativeLanguage, CREATIVE_LANGUAGES } from "@/lib/creative-language";
import type { Section } from "@/lib/sections";
import { useAuth } from "@/lib/auth-context";

type BannerSeed = {
  brand_name?: string;
  brand_logo?: string;
  subject?: string;
  language?: string;
  banner_text?: string;
};

type MobileTab = "templates" | "settings" | "result";

export function SectionScaffold({ section }: { section: Section }) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [language, setLanguage] = useState("auto");
  const [mobileTab, setMobileTab] = useState<MobileTab>("templates");
  const [seed, setSeed] = useState<BannerSeed | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  // Default the section's language field from the global creative language,
  // and (landing only) accept the "create from banner" handoff.
  useEffect(() => {
    document.title = `${section.title} — Dream Weaver Studio`;
    let lang = getCreativeLanguage();
    if (section.id === "landing" && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dw:landingSeed");
        if (raw) {
          const s = JSON.parse(raw) as BannerSeed;
          setSeed(s);
          if (s.language) lang = s.language;
          window.localStorage.removeItem("dw:landingSeed");
          setMobileTab("settings");
          toast.success("Данные бренда перенесены из баннера");
        }
      } catch {
        /* ignore malformed seed */
      }
    }
    setLanguage(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  const Icon = section.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="flex flex-col p-0 lg:flex-row lg:gap-6 lg:p-3">
        {/* COLUMN 1 — templates placeholder */}
        <aside
          className={`flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-[calc(100vh-2rem)] lg:w-auto lg:flex-[2] lg:rounded-2xl lg:border ${
            mobileTab !== "templates" ? "max-lg:hidden" : ""
          }`}
        >
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="ds-h4">Шаблоны</h2>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <p className="ds-caption">Шаблоны появятся здесь</p>
            {[1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMobileTab("settings")}
                className="flex w-full items-center gap-2.5 rounded-2xl border border-border bg-[var(--bg-surface)] p-3 text-left opacity-70 transition hover:opacity-100 lg:cursor-default"
              >
                <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--bg-surface-hover)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-[var(--bg-surface-hover)]" />
                  <div className="h-2.5 w-1/2 rounded bg-[var(--bg-surface-hover)]" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* COLUMN 2 — settings placeholder */}
        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none lg:h-[calc(100vh-2rem)] lg:flex-[4] lg:rounded-2xl lg:border ${
            mobileTab !== "settings" ? "max-lg:hidden" : ""
          }`}
        >
          <div className="px-2 pb-3 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("templates")}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
              Назад
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-accent-green">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="ds-h4">{section.title}</p>
                  <p className="ds-caption">{section.description}</p>
                </div>
              </div>

              {/* "Created from banner" prefilled brand block (landing only). */}
              {seed ? (
                <div className="rounded-xl border border-accent-green/40 bg-accent-green/5 p-3">
                  <p className="mb-2 ds-h4">Данные бренда (из баннера)</p>
                  <div className="flex items-center gap-3">
                    {seed.brand_logo ? (
                      <img
                        src={seed.brand_logo}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md border border-border bg-white object-contain p-1"
                      />
                    ) : null}
                    <div className="min-w-0 space-y-1 text-sm">
                      {seed.brand_name ? (
                        <p className="truncate">
                          <span className="text-muted-foreground">Бренд: </span>
                          {seed.brand_name}
                        </p>
                      ) : null}
                      {seed.subject ? (
                        <p className="truncate">
                          <span className="text-muted-foreground">Тематика: </span>
                          {seed.subject}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="mb-2 ds-h4">Язык креатива</p>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                >
                  {CREATIVE_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 ds-caption">
                  По умолчанию берётся из языка в шапке. Можно переопределить для этого проекта.
                </p>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
                <LayoutGrid className="mx-auto mb-3 h-7 w-7 text-muted-foreground/40" />
                <p className="ds-body text-muted-foreground">{section.scaffoldHint}</p>
              </div>
            </div>
          </div>
          {/* Mobile sticky primary action */}
          <div className="shrink-0 border-t border-border bg-panel p-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("result")}
              disabled
              className="min-h-12 w-full rounded-lg bg-accent-green px-8 text-base font-semibold text-on-accent opacity-50"
            >
              {section.cta}
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">Раздел скоро будет доступен</p>
          </div>
        </section>

        {/* COLUMN 3 — result empty state */}
        <div
          className={`flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none max-lg:p-4 lg:h-[calc(100vh-2rem)] lg:flex-[4] ${
            mobileTab !== "result" ? "max-lg:hidden" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileTab("settings")}
            className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground lg:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
            Назад
          </button>
          <div className="flex w-full flex-1 items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6">
            <div className="max-w-xs text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-surface)] text-accent-green">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="ds-h4">Здесь появится результат</h2>
              <p className="mt-1 ds-caption">{section.description}</p>
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-lg bg-accent-green px-8 py-3 text-sm font-semibold text-on-accent opacity-50 max-lg:hidden"
              >
                {section.cta}
              </button>
              <p className="mt-2 ds-caption max-lg:hidden">Раздел скоро будет доступен</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
