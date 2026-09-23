"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Clock,
  HelpCircle,
  Mail,
  Sparkles,
  X,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { BANNER_TEMPLATES_ROUTE, CATEGORIES } from "@/components/PresetSidebar";
import { SECTION_BY_ID, sectionEntryRoute, type Section } from "@/lib/sections";
import { isSectionEnabled } from "@/lib/mvp";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";
import { useWorkspace } from "@/lib/workspace-context";
import { useT, useTx } from "@/lib/i18n";
import { getMockProjects } from "@/lib/historyMock";
import { ALL_TEMPLATES, POPULAR_TEMPLATES } from "@/lib/hubTemplates";
import presetSlotBanner from "@/assets/preset-slot-banner.jpg";

type RecentCard = {
  id: string;
  name: string;
  updatedLabel: string;
  thumb: string | null;
};

// Page-local animation: the first-paint entrance the Hub blocks rise in with.
// Respects prefers-reduced-motion (globals.css disables animations there).
const HUB_ANIM = `
/* First-paint entrance: blocks rise in softly, staggered via --d, so the Hub
   assembles itself instead of snapping in as one slab. Decorative only —
   switched off under prefers-reduced-motion. */
@keyframes hubRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.hub-in { animation: hubRise .55s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
@media (prefers-reduced-motion: reduce) { .hub-in { animation: none; } }
/* Editorial hero: display type sized in container-query units so the three
   lines keep filling the column at every width (the column is narrower than
   the viewport because of the sidebar, so vw would overflow). Per-line sizes
   are tuned to the glyph count of each line. */
.hub-hero { container-type: inline-size; }
.hero-line { display: block; font-weight: 800; text-transform: uppercase; letter-spacing: -.045em; line-height: .9; font-size: 13cqw; }
/* Scattered work samples. They rise in with the same curve as the tiles and
   lift slightly on hover of the hero — decorative, off under reduced motion. */
.hub-shot { animation: hubRise .7s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); transition: transform .5s cubic-bezier(.22,1,.36,1); }
.hub-hero:hover .hub-shot { transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { .hub-shot { animation: none; transition: none; } .hub-hero:hover .hub-shot { transform: none; } }
`;

// Work samples scattered around the hero headline — real generated creatives,
// picked for contrast (gold casino, purple slot, blue sport, magenta landing).
// Purely decorative: the layer is aria-hidden and takes no pointer events.
// The one sample that paints OVER the type: it clips the crown of the first
// line rather than whole letters, as in the reference layout.
const HERO_SHOT_TOP = {
  src: "/previews/preset1.webp",
  pos: "left-1/2 top-0 w-[17%] -translate-x-[64%]",
  ratio: "aspect-[3/2]",
  d: "60ms",
};

// Samples behind the type, in the two side columns and the band below it.
// Picked for colour spread so the collage never reads as one gold blur.
const HERO_SHOTS = [
  { src: "/previews/preset20.webp", key: "bonus", label: "Бонус", pos: "left-0 top-[15%] w-[15%]", ratio: "aspect-[3/2]", d: "120ms" },
  { src: "/previews/preset15.webp", key: "slot", label: "Слот", pos: "-left-10 top-[43%] w-[17%]", ratio: "aspect-[3/2]", d: "180ms" },
  { src: "/previews/hero-wheel.webp", key: "wheel", label: "Лендинг · Колесо", pos: "left-[1%] bottom-0 w-[16%]", ratio: "aspect-[4/3]", d: "300ms" },
  { src: "/previews/preset19.webp", key: "odds", label: "Коэффициенты", pos: "right-0 top-[9%] w-[15%]", ratio: "aspect-[3/2]", d: "150ms" },
  { src: "/previews/preset2.webp", key: "newSlot", label: "Новый слот", pos: "-right-10 top-[42%] w-[17%]", ratio: "aspect-[3/2]", d: "210ms" },
  { src: "/previews/preset11.webp", key: "arcade", label: "Аркада", pos: "left-[24%] bottom-[7%] w-[18%]", ratio: "aspect-[3/2]", d: "330ms" },
  { src: "/previews/preset4.webp", key: "match", label: "Спорт · Матч", pos: "right-[18%] bottom-[1%] w-[22%]", ratio: "aspect-[3/2]", d: "260ms" },
  { src: "/previews/preset7.webp", key: "launch", label: "Запуск казино", pos: "right-[1%] bottom-[11%] w-[15%]", ratio: "aspect-[3/2]", d: "360ms" },
];

// Display type that fills the column whatever language it is in. Sizes used to
// be hard-coded per line, tuned to the width of «Креатив, который продаёт», so a
// translation of a different length broke the block. Now all three lines share
// ONE size: the one that makes the longest line reach the target width. Scaling
// each line to the same width instead blows a short word like «THAT» up to fill
// the column, which is not what the reference layout does.
function FittedHeadline({ lines, fill = 0.72 }: { lines: string[]; fill?: number }) {
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
      const next = Math.max(20, Math.round((target / widest) * 1000) / 10);
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
  }, [lines.join("\u0000"), fill]);

  return (
    <h1
      ref={ref}
      className="hub-in relative mt-6 text-center text-foreground sm:mt-7"
      style={{ "--d": "40ms" } as React.CSSProperties}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          className="hero-line"
          style={size ? { fontSize: `${size}px` } : undefined}
        >
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
    return <img src={preview} alt="" className="h-full w-full object-cover" draggable={false} />;
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

export default function HubPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const t = useT();
  const tx = useTx();
  const { activeId } = useWorkspace();
  const [recent, setRecent] = useState<RecentCard[]>([]);
  const [firstName, setFirstName] = useState("");
  const [hubPrompt, setHubPrompt] = useState("");
  const [showcaseCat, setShowcaseCat] = useState<string>("all");

  useEffect(() => {
    document.title = "GenGO";
  }, []);

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

  // Recent projects + count for the ACTIVE workspace. Real banners when
  // available (server-side filtering via ?workspace=<id> once the backend
  // supports it), else the cross-type mock seeded to this workspace — so the
  // Hub reflects only the current company/client. Re-runs on workspace switch.
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    const seed = activeId ?? undefined;
    const qs = `/api/history?bucket=active${
      activeId ? `&workspace=${encodeURIComponent(activeId)}` : ""
    }`;
    const applyMock = () => {
      if (cancelled) return;
      const list = getMockProjects(undefined, seed).filter((p) => !p.deleted);
      setRecent(
        list.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          updatedLabel: new Date(p.updatedAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
          }),
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
            name: (c.name as string) || "Проект без названия", // localised at render
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
  }, [loading, isAuthenticated, activeId]);

  const submitHubPrompt = () => {
    const v = hubPrompt.trim();
    if (v) {
      try {
        window.localStorage.setItem("dw_hub_prompt", v);
      } catch {
        /* ignore */
      }
    }
    router.push("/banner");
  };
  const TOOL_CHIPS = ["banner", "video", "landing", "playable", "email"]
    .map((id) => SECTION_BY_ID.get(id as Section["id"]))
    .filter((x): x is Section => Boolean(x));
  const BANNER_TEMPLATES = ALL_TEMPLATES.filter((t) => t.sectionId === "banner" && t.preview);
  const SHOWCASE = (
    showcaseCat === "all"
      ? BANNER_TEMPLATES
      : BANNER_TEMPLATES.filter((t) => PRESET_CAT[t.id] === showcaseCat)
  ).slice(0, 16);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const bannerSection = SECTION_BY_ID.get("banner")!;
  const greeting = firstName
    ? t("hub.greeting", { name: firstName })
    : t("hub.greetingAnon");
  // Gate onboarding on the same count as the stat so the two are mutually
  // exclusive — a first-visit user (0 projects) sees the nudge, a returning one
  // sees the stat, and malformed data can never show both at once.

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <style>{HUB_ANIM}</style>
      <AppHeader />

      <AppShell>

      {/* Brand hero backdrop — the system's aurora (violet + lime radials) with
          a fading dot-grid over it. Purely decorative: it is aria-hidden, takes
          no pointer events, and sits behind the content by DOM order alone, so
          nothing here needs a z-index. The header stays on top via its own
          sticky z-30. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[860px] overflow-hidden"
      >
        <div className="ds-hero-glow absolute inset-0" />
        <div className="ds-dotgrid ds-dotgrid-fade absolute inset-0 opacity-[0.14]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* .hub-in animates transform with fill-mode:both, which leaves this
            element owning a stacking context forever — so the search dropdown
            inside it can only rise above the tiles if the WHOLE hero is lifted
            (z-50, above the z-40 scrim) while the dropdown is open. */}
        {/* Editorial hero: one giant statement with work samples scattered
            around it. The samples are absolutely placed and only shown from lg
            up, where there is room beside the headline; narrower screens get a
            compact strip of the same creatives under the type. */}
        <section className="hub-hero relative mb-6 overflow-hidden pb-2 pt-2 sm:mb-8 sm:pt-5 lg:pb-40">
          <div className="hub-in flex items-baseline justify-between gap-4">
            <p className="ds-overline ds-overline-accent">{t("hub.overline")}</p>
            <p className="ds-caption truncate">{greeting}</p>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
            {HERO_SHOTS.map((shot) => (
              <span
                key={shot.src}
                style={{ "--d": shot.d } as React.CSSProperties}
                className={`hub-shot absolute ${shot.pos}`}
              >
                <span
                  className={`block overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-surface)] shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] ${shot.ratio}`}
                >
                  <img src={shot.src} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="mt-1.5 block truncate ds-micro uppercase tracking-wide text-hint">
                  {tx(`hub.shots.${shot.key}`, shot.label)}
                </span>
              </span>
            ))}
          </div>

          <FittedHeadline
            lines={[t("hub.headline.l1"), t("hub.headline.l2"), t("hub.headline.l3")]}
          />

          {/* No caption on this one: it sits over the headline, so a line of
              text under it would print across the letters. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
            <span
              style={{ "--d": HERO_SHOT_TOP.d } as React.CSSProperties}
              className={`hub-shot absolute overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-surface)] shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] ${HERO_SHOT_TOP.ratio} ${HERO_SHOT_TOP.pos}`}
            >
              <img src={HERO_SHOT_TOP.src} alt="" className="h-full w-full object-cover" />
            </span>
          </div>

          {/* Mobile / tablet stand-in for the scattered layer. */}
          <div aria-hidden className="mt-7 grid grid-cols-3 gap-2 lg:hidden">
            {[HERO_SHOT_TOP, ...HERO_SHOTS].slice(0, 6).map((shot) => (
              <span
                key={shot.src}
                className="aspect-[3/2] overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-surface)]"
              >
                <img src={shot.src} alt="" className="h-full w-full object-cover" />
              </span>
            ))}
          </div>

        </section>

        <div className="hub-in mb-8 flex flex-col gap-4 border-t border-border pt-5 sm:mb-10 md:flex-row md:items-start md:justify-between md:gap-8" style={{ "--d": "360ms" } as React.CSSProperties}>
          <p className="ds-overline shrink-0 md:w-40">{t("hub.label")}</p>
          <p className="max-w-lg text-sm text-muted-foreground md:text-center">
            {t("hub.tagline")}
          </p>
          <Link
            href={BANNER_TEMPLATES_ROUTE}
            className="ds-overline group inline-flex shrink-0 items-center gap-1.5 text-foreground transition hover:text-accent-green md:w-40 md:justify-end"
          >
            {t("hub.templatesLink")}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="hub-in relative mx-auto max-w-3xl text-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitHubPrompt();
            }}
            className="mx-auto mt-6 max-w-2xl"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-[var(--bg-surface)] p-2 pl-4 shadow-[0_10px_40px_-16px_rgba(0,0,0,0.85)] transition focus-within:border-accent-green focus-within:shadow-[0_0_0_4px_rgba(198,255,61,0.10)]">
              <Sparkles className="h-5 w-5 shrink-0 text-accent-green" />
              <input
                type="text"
                value={hubPrompt}
                onChange={(e) => setHubPrompt(e.target.value)}
                placeholder={t("hub.prompt.placeholder")}
                aria-label={t("hub.prompt.aria")}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hint sm:text-base"
              />
              <button
                type="submit"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
              >
                {t("hub.prompt.submit")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {TOOL_CHIPS.map((sc) => {
              const Icon = sc.icon;
              const soon = !isSectionEnabled(sc.id);
              const chipTitle = tx(`sections.${sc.id}.title`, sc.title);
              if (soon) {
                return (
                  <span
                    key={sc.id}
                    aria-disabled="true"
                    title={t("common.soonFor", { title: chipTitle })}
                    className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-white/[0.02] px-3 text-xs font-medium text-hint opacity-60"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {chipTitle}
                    <span className="ml-0.5 rounded-full border border-border px-1 text-[9px] uppercase tracking-wide">
                      {t("common.soon")}
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={sc.id}
                  href={sectionEntryRoute(sc)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-accent-green" />
                  {chipTitle}
                </Link>
              );
            })}
          </div>



        </div>


        <section className="hub-in mt-14" style={{ "--d": "220ms" } as React.CSSProperties}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="ds-feature-icon h-9 w-9 shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="ds-overline ds-overline-accent">{t("hub.showcase.overline")}</p>
                <h2 className="mt-0.5 text-lg font-semibold">{t("hub.showcase.title")}</h2>
              </div>
            </div>
            <Link
              href="/banner/templates"
              className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex"
            >
              {t("hub.showcase.all")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {[{ id: "all", label: "Все" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))].map(
              (c) => (
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
              ),
            )}
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {SHOWCASE.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(t.href)}
                title={t.name}
                className="group relative aspect-[3/2] w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] transition-all hover:-translate-y-1 hover:border-accent-green/60 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.35)]"
              >
                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                  <Thumb preview={t.preview} gradient={t.gradient} fallbackIcon={null} />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
                  <span className="truncate text-sm font-semibold text-white">{t.name}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-green text-on-accent opacity-0 transition group-hover:opacity-100">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* MVP: ads and mailings are «Скоро» (coming soon) — entry points hidden
        for the demo.
        <HubAdsPanel />
        <HubMailingPanel /> */}

        {recent.length > 0 ? (
          <section className="hub-in mt-12" style={{ "--d": "300ms" } as React.CSSProperties}>
            <div className="mb-4 flex items-center gap-3">
              <span className="ds-feature-icon h-9 w-9 shrink-0">
                <Clock className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="ds-overline ds-overline-accent">{t("hub.continueCta")}</p>
                <h2 className="mt-0.5 text-lg font-semibold">{t("hub.recent.title")}</h2>
              </div>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {recent.map((p) => {
                const BannerIcon = bannerSection.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => router.push(`/banner?card=${p.id}`)}
                    className="group flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-accent-green/40 hover:bg-[var(--bg-surface-hover)] hover:shadow-[0_12px_32px_-14px_rgba(198,255,61,0.28)] sm:w-auto"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-background">
                      <Thumb
                        preview={p.thumb}
                        fallbackIcon={<BannerIcon className="h-6 w-6" />}
                      />
                      <span
                        className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-accent-green backdrop-blur"
                        title={bannerSection.title}
                      >
                        <BannerIcon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="min-w-0 p-2.5">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      {p.updatedLabel ? (
                        <p className="ds-micro text-muted-foreground">Изменён {p.updatedLabel}</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="hub-in mt-12" style={{ "--d": "340ms" } as React.CSSProperties}>
          <div className="mb-4 flex items-center gap-3">
            <span className="ds-feature-icon h-9 w-9 shrink-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="ds-overline ds-overline-accent">{t("nav.onboarding")}</p>
              <h2 className="mt-0.5 text-lg font-semibold">{t("hub.popular")}</h2>
            </div>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
            {POPULAR_TEMPLATES.filter((t) => isSectionEnabled(t.sectionId)).map((t) => {
              const sec = SECTION_BY_ID.get(t.sectionId);
              const SecIcon = sec?.icon;
              return (
                <button
                  key={`${t.sectionId}-${t.id}`}
                  type="button"
                  onClick={() => router.push(t.href)}
                  className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-accent-green/50 hover:bg-[var(--bg-surface-hover)] hover:shadow-[0_12px_32px_-14px_rgba(198,255,61,0.35)] sm:w-auto"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-background">
                    <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                      <Thumb
                        preview={t.preview}
                        gradient={t.gradient}
                        fallbackIcon={SecIcon ? <SecIcon className="h-6 w-6" /> : null}
                      />
                    </div>
                    <span
                      className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-accent-green backdrop-blur"
                      title={sec?.title}
                    >
                      {SecIcon ? <SecIcon className="h-3.5 w-3.5" /> : null}
                    </span>
                  </div>
                  <div className="min-w-0 p-2.5">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate ds-caption">{sec?.title}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="hub-in mb-2 mt-12"
          style={{ "--d": "380ms" } as React.CSSProperties}
        >
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="ds-feature-icon h-11 w-11 shrink-0">
                <HelpCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{t("hub.helpCard.title")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("hub.helpCard.body")}
                </p>
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
      </div>
      </AppShell>
    </div>
  );
}
