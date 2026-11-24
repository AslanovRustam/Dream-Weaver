"use client";

// Главная. Один экран для гостя и для своего:
//   • Герой — поле ТЗ (вход в простой режим «Кампании») и мозаика настоящих
//     работ: лендинг, плейбл, баннер и проверка перед модерацией.
//   • Свой видит недавние проекты сразу под героем; гость — блоки про форматы
//     и модерацию и повтор поля ТЗ внизу.
//   • Инструменты с живыми превью и витрина шаблонов — всем.
// После входа гость с сохранённым ТЗ уходит прямо в кампанию (lib/hubBrief).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Clock, HelpCircle, Mail, Sparkles } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { BANNER_TEMPLATES_ROUTE, CATEGORIES } from "@/components/PresetSidebar";
import { HomeBrief } from "@/components/home/HomeBrief";
import { FormatsBlock, HOME_ANIM, HeroMosaic, ModerationBlock, TemplateVisualBlock, ToolsGrid } from "@/components/home/HomeSections";
import { SECTION_BY_ID } from "@/lib/sections";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";
import { hasHubBrief } from "@/lib/hubBrief";
import { useWorkspace } from "@/lib/workspace-context";
import { useT } from "@/lib/i18n";
import { getMockProjects } from "@/lib/historyMock";
import { ALL_TEMPLATES } from "@/lib/hubTemplates";

type RecentCard = {
  id: string;
  name: string;
  updatedLabel: string;
  thumb: string | null;
};

// Page-local animation: blocks rise in softly, staggered via --d. The hero
// headline is sized in JS (FittedHeadline) so every language fills the column.
// Decorative only — off under prefers-reduced-motion.
const HUB_ANIM = `
@keyframes hubRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.hub-in { animation: hubRise .55s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
@media (prefers-reduced-motion: reduce) { .hub-in { animation: none; } }
.hero-line { display: block; font-weight: 800; text-transform: uppercase; letter-spacing: -.045em; line-height: .9; font-size: clamp(2.75rem, 9vw, 5.5rem); }
`;

// Display type that fills the column whatever language it is in: all lines
// share ONE size — the one that makes the longest line reach `fill` of the
// column width (a short word like «THAT» is not blown up to full width).
function FittedHeadline({ lines, fill = 0.9, max = 112 }: { lines: string[]; fill?: number; max?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    let alive = true;

    const measure = () => {
      if (!alive) return;
      const target = host.clientWidth * fill;
      if (target <= 0) return;
      const spans = Array.from(host.querySelectorAll<HTMLElement>(".hero-line"));
      let widest = 1;
      for (const span of spans) {
        const previous = span.style.fontSize;
        span.style.fontSize = "100px";
        const range = document.createRange();
        range.selectNodeContents(span);
        widest = Math.max(widest, range.getBoundingClientRect().width);
        span.style.fontSize = previous;
      }
      const next = Math.min(max, Math.max(20, Math.round((target / widest) * 1000) / 10));
      setSize((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
    };

    measure();
    // Web fonts land after the first paint and change every measurement.
    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as Document & { fonts: FontFaceSet }).fonts.ready.then(measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [lines.join("\u0000"), fill, max]);

  return (
    <h1 ref={ref} className="hub-in relative mt-5 text-foreground" style={{ "--d": "40ms" } as React.CSSProperties}>
      {lines.map((line, i) => (
        <span key={i} className="hero-line" style={size ? { fontSize: `${size}px` } : undefined}>
          {line}
        </span>
      ))}
    </h1>
  );
}

const PRESET_CAT: Record<string, string> = {};
for (const c of CATEGORIES) for (const id of c.presetIds) PRESET_CAT[id] = c.id;

function Thumb({
  preview,
  gradient,
  fallbackIcon,
}: {
  preview?: string | null;
  gradient?: string;
  fallbackIcon: React.ReactNode;
}) {
  if (preview) {
    return <img src={preview} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />;
  }
  if (gradient) {
    return <div className="h-full w-full" style={{ background: gradient }} />;
  }
  return (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
      {fallbackIcon}
    </span>
  );
}

function SectionHead({ overline, title, action }: { overline: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="ds-overline ds-overline-accent">{overline}</p>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function HubPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const t = useT();
  const { activeId } = useWorkspace();
  const [recent, setRecent] = useState<RecentCard[]>([]);
  const [firstName, setFirstName] = useState("");
  const [showcaseCat, setShowcaseCat] = useState<string>("all");

  useEffect(() => {
    document.title = "GenGO";
  }, []);

  // Гость оставил ТЗ на главной и вошёл — продолжаем там, где остановились.
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    void hasHubBrief().then((has) => {
      if (has && !cancelled) router.replace("/campaign");
    });
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, router]);

  // Best-effort name for the greeting. Fails silently (e.g. the dev-bypass build
  // where /api/me is unauthenticated) → generic greeting.
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    apiJson<{ profile?: { first_name?: string; nickname?: string } }>("/api/me")
      .then((r) => {
        if (cancelled) return;
        setFirstName(r?.profile?.first_name?.trim() || r?.profile?.nickname?.trim() || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated]);

  // Recent projects for the ACTIVE workspace: real cards when there are any,
  // else the cross-type mock seeded to this workspace. Re-runs on switch.
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    const seed = activeId ?? undefined;
    const qs = `/api/history?bucket=active${activeId ? `&workspace=${encodeURIComponent(activeId)}` : ""}`;
    const applyMock = () => {
      if (cancelled) return;
      const list = getMockProjects(undefined, seed).filter((p) => !p.deleted);
      setRecent(
        list.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          updatedLabel: new Date(p.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
          thumb: p.thumb ?? null,
        })),
      );
    };
    apiJson<{ items?: unknown[] }>(qs)
      .then((r) => {
        if (cancelled) return;
        const cards = Array.isArray(r?.items) ? r.items : [];
        if (cards.length === 0) {
          applyMock();
          return;
        }
        const mapped: RecentCard[] = cards.slice(0, 6).map((raw) => {
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
            name: (c.name as string) || t("hub.recent.untitled"),
            updatedLabel,
            thumb: (master?.image_url as string) || null,
          };
        });
        setRecent(mapped.filter((m) => m.id));
      })
      .catch(() => {
        applyMock();
      });
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, activeId, t]);

  const BANNER_TEMPLATES = ALL_TEMPLATES.filter((x) => x.sectionId === "banner" && x.preview);
  const SHOWCASE = (
    showcaseCat === "all" ? BANNER_TEMPLATES : BANNER_TEMPLATES.filter((x) => PRESET_CAT[x.id] === showcaseCat)
  ).slice(0, 16);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const guest = !isAuthenticated;
  const bannerSection = SECTION_BY_ID.get("bannerLayers") ?? SECTION_BY_ID.get("banner")!;
  const greeting = firstName ? t("hub.greeting", { name: firstName }) : t("hub.greetingAnon");

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <style>{HUB_ANIM + HOME_ANIM}</style>
      <AppHeader />

      <AppShell>
        {/* Brand backdrop — violet + lime aurora with a fading dot-grid.
            Decorative, behind the content by DOM order alone. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
          <div className="ds-hero-glow absolute inset-0" />
          <div className="ds-dotgrid ds-dotgrid-fade absolute inset-0 opacity-[0.14]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-6 sm:pt-10">
          {/* ---- Герой: ТЗ слева, живые работы справа ---- */}
          <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
            <div className="min-w-0">
              <div className="hub-in flex items-baseline justify-between gap-4">
                <p className="ds-overline ds-overline-accent">{t("hub.overline")}</p>
                {guest ? null : <p className="ds-caption truncate lg:hidden">{greeting}</p>}
              </div>
              <FittedHeadline lines={[t("hub.headline.l1"), t("hub.headline.l2"), t("hub.headline.l3")]} />
              <p className="hub-in mt-5 max-w-xl text-base text-muted-foreground sm:text-lg" style={{ "--d": "120ms" } as React.CSSProperties}>
                {t("hub.sub")}
              </p>
              <div className="hub-in mt-6" style={{ "--d": "180ms" } as React.CSSProperties}>
                <HomeBrief id="hero" />
              </div>
              <ul className="hub-in mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" style={{ "--d": "240ms" } as React.CSSProperties}>
                {(["igaming", "formats", "check", "langs"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-accent-green" />
                    {t(`hub.trust.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hub-in" style={{ "--d": "120ms" } as React.CSSProperties}>
              <HeroMosaic />
            </div>
          </section>

          {/* ---- Свой: недавние проекты сразу под героем ---- */}
          {!guest && recent.length > 0 ? (
            <section className="hub-in mt-16" style={{ "--d": "300ms" } as React.CSSProperties}>
              <SectionHead
                overline={t("hub.continueCta")}
                title={t("hub.recent.title")}
                action={
                  <Link href="/history" className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex">
                    <Clock className="h-4 w-4" />
                    {t("nav.history")}
                  </Link>
                }
              />
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
                {recent.map((p) => {
                  const BannerIcon = bannerSection.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => router.push(`/banner-layers?card=${p.id}`)}
                      className="group flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-accent-green/40 hover:bg-[var(--bg-surface-hover)] hover:shadow-[0_12px_32px_-14px_rgba(198,255,61,0.28)] sm:w-auto"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-background">
                        <Thumb preview={p.thumb} fallbackIcon={<BannerIcon className="h-6 w-6" />} />
                      </div>
                      <div className="min-w-0 p-2.5">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        {p.updatedLabel ? <p className="ds-micro text-muted-foreground">{p.updatedLabel}</p> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ---- Инструменты ---- */}
          <section className="hub-in mt-20" style={{ "--d": "320ms" } as React.CSSProperties}>
            <SectionHead overline={t("hub.tools.overline")} title={t("hub.tools.title")} />
            <ToolsGrid />
          </section>

          {/* ---- Гость: почему мы, а не общий генератор ---- */}
          {guest ? (
            <>
              <section className="mt-24">
                <FormatsBlock />
              </section>
              <section className="mt-24">
                <ModerationBlock />
              </section>
            </>
          ) : null}

          {/* ---- Шаблон как визуал: ценность шаблонов, для всех ---- */}
          <section className="mt-24">
            <TemplateVisualBlock />
          </section>

          {/* ---- Витрина шаблонов ---- */}
          <section className="mt-24">
            <SectionHead
              overline={t("hub.showcase.overline")}
              title={t("hub.showcase.title")}
              action={
                <Link
                  href={BANNER_TEMPLATES_ROUTE}
                  className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex"
                >
                  {t("hub.showcase.all")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {[{ id: "all", label: "Все" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setShowcaseCat(c.id)}
                  className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                    showcaseCat === c.id
                      ? "border-accent-green/40 bg-[var(--lime-tint)] text-accent-green"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
              {SHOWCASE.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => router.push(x.href)}
                  title={x.name}
                  className="group relative aspect-[3/2] w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] transition-all hover:-translate-y-1 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
                >
                  <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                    <Thumb preview={x.preview} gradient={x.gradient} fallbackIcon={null} />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
                    <span className="truncate text-sm font-semibold text-white">{x.name}</span>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-accent-green px-2 py-1 text-xs font-semibold text-on-accent opacity-0 transition group-hover:opacity-100">
                      {t("hub.showcase.same")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ---- Гость: повтор поля ТЗ ---- */}
          {guest ? (
            <section className="relative mt-24 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card sm:p-10">
              <div aria-hidden className="ds-hero-glow pointer-events-none absolute inset-0 opacity-70" />
              <div className="relative mx-auto max-w-2xl text-center">
                <Sparkles className="mx-auto h-6 w-6 text-accent-green" />
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t("hub.final.title")}</h2>
                <p className="mt-2 text-muted-foreground">{t("hub.final.body")}</p>
              </div>
              <div className="relative mx-auto mt-6 max-w-2xl text-left">
                <HomeBrief id="final" compact />
              </div>
            </section>
          ) : (
            <section className="mt-20">
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="ds-feature-icon h-11 w-11 shrink-0">
                    <HelpCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{t("hub.helpCard.title")}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t("hub.helpCard.body")}</p>
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
                  <Link
                    href="/help"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--border-strong)] px-4 text-sm font-medium text-foreground transition hover:border-white/28 hover:bg-[var(--overlay-hover)] sm:w-auto"
                  >
                    <BookOpen className="h-4 w-4" />
                    {t("hub.helpCard.kb")}
                  </Link>
                  <Link
                    href="/help#contact"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-muted-foreground transition hover:bg-[var(--overlay-hover)] hover:text-foreground sm:w-auto"
                  >
                    <Mail className="h-4 w-4" />
                    {t("hub.helpCard.contact")}
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>
      </AppShell>
    </div>
  );
}
