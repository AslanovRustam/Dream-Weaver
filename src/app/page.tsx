"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, LayoutGrid, Play, Search, Sparkles, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileScrim } from "@/components/MobileScrim";
import { SECTIONS, SECTION_BY_ID, type Section } from "@/lib/sections";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";
import {
  ALL_TEMPLATES,
  POPULAR_TEMPLATES,
  searchTemplates,
  type HubTemplate,
} from "@/lib/hubTemplates";
import presetSlotBanner from "@/assets/preset-slot-banner.jpg";

type RecentCard = {
  id: string;
  name: string;
  updatedLabel: string;
  thumb: string | null;
};

// Looped, self-contained previews for the section tiles — same "живое превью"
// idea as the playable mechanic animations, kept local so the Hub has no
// cross-component coupling. Respects prefers-reduced-motion (see globals.css,
// which already disables animations under that query).
const HUB_ANIM = `
@keyframes hubRoll { to { transform: translateY(-50%); } }
@keyframes hubPulse { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(2.1); opacity: 0; } }
.hub-reels { display: flex; gap: 6px; height: 100%; }
.hub-reel { flex: 1; overflow: hidden; border-radius: 8px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.08); }
.hub-strip { display: flex; flex-direction: column; align-items: center; font-size: 30px; line-height: 1.75; animation: hubRoll 1.5s linear infinite; animation-play-state: paused; }
.hub-reel:nth-child(2) .hub-strip { animation-duration: 1.85s; }
.hub-reel:nth-child(3) .hub-strip { animation-duration: 1.25s; }
.hub-pulse { position: absolute; border-radius: 9999px; border: 2px solid var(--accent-green); animation: hubPulse 1.6s ease-out infinite; animation-play-state: paused; }
/* Previews are STATIC at rest (bright, first frame) and only come alive on
   hover/focus — no ambient motion while browsing, and mobile (no hover) stays
   quiet. The same .hub-tile rule drives every tile, so behaviour is identical. */
.hub-tile:hover .hub-strip,
.hub-tile:focus-visible .hub-strip,
.hub-tile:hover .hub-pulse,
.hub-tile:focus-visible .hub-pulse { animation-play-state: running; }
/* Uniform "comes alive" gloss sweep on hover — gives the light-animation tiles
   (banner, landing) the same life as the looped ones (playable, video). */
.hub-shine { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,.14) 50%, transparent 58%); transform: translateX(-100%); transition: transform .7s ease; }
.hub-tile:hover .hub-shine,
.hub-tile:focus-visible .hub-shine { transform: translateX(100%); }
/* First-paint entrance: blocks rise in softly, staggered via --d, so the Hub
   assembles itself instead of snapping in as one slab. Decorative only —
   switched off under prefers-reduced-motion. */
@keyframes hubRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.hub-in { animation: hubRise .55s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
@media (prefers-reduced-motion: reduce) { .hub-in { animation: none; } }
`;

// Shared dark base for the three illustrated mocks so they read as one family
// (the banner is a real image, tied in by the shared grade overlay in SectionTile).
const PREVIEW_BASE = "bg-gradient-to-br from-[#141a2b] via-[#0d1120] to-[#0a0d15]";

// Colourful, illustrative preview for each tool — NOT skeleton placeholders, so
// the Hub reads as a live, finished product. Banner shows a real example; the
// other three are stylised colour mocks in the shared palette.
function TilePreview({ sectionId }: { sectionId: string }) {
  if (sectionId === "banner") {
    return (
      <img
        src={presetSlotBanner.src}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  if (sectionId === "playable") {
    return (
      <div className={`flex h-full w-full items-center justify-center ${PREVIEW_BASE} p-5`}>
        <div className="hub-reels aspect-[3/2] h-full max-h-28">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hub-reel">
              <div className="hub-strip">
                <span>🍒</span>
                <span>⭐</span>
                <span>7️⃣</span>
                <span>🍒</span>
                <span>⭐</span>
                <span>7️⃣</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (sectionId === "video") {
    // Stylised video cover: a cool backlight makes a near-black talking-head
    // avatar silhouette read against the stage, with a play button whose ring
    // pulses out on hover (see .hub-pulse).
    return (
      <div className={`relative flex h-full w-full items-center justify-center overflow-hidden ${PREVIEW_BASE}`}>
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(58% 55% at 50% 60%, rgba(99,134,214,0.34), transparent 72%)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(46% 34% at 50% 22%, rgba(212,255,61,0.16), transparent 70%)" }}
        />
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-[14%] flex-col items-center">
          <div className="h-10 w-10 rounded-full bg-[#070a10]" />
          <div className="-mt-1.5 h-16 w-28 rounded-t-[46px] bg-[#070a10]" />
        </div>
        <span className="relative z-10 mb-5 flex items-center justify-center">
          <span className="hub-pulse" style={{ inset: "-11px" }} aria-hidden />
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-green text-black shadow-[0_0_30px_rgba(212,255,61,0.4)]">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </span>
      </div>
    );
  }
  // Landing — a colourful stylised landing mock (nav + hero + CTA + cards).
  return (
    <div className={`flex h-full w-full flex-col ${PREVIEW_BASE}`}>
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="h-2 w-9 rounded-full bg-sky-400" />
        <div className="flex gap-1.5">
          <div className="h-1.5 w-5 rounded-full bg-white/35" />
          <div className="h-1.5 w-5 rounded-full bg-white/35" />
          <div className="h-1.5 w-5 rounded-full bg-white/35" />
        </div>
      </div>
      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3 w-11/12 rounded bg-white/90" />
          <div className="h-2 w-3/5 rounded bg-white/45" />
          <div className="mt-1 h-5 w-24 rounded-md bg-sky-400" />
        </div>
        <div className="h-16 w-1/3 shrink-0 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-600" />
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <div className="h-9 rounded-lg bg-gradient-to-br from-white/20 to-white/5" />
        <div className="h-9 rounded-lg bg-gradient-to-br from-violet-500/30 to-white/5" />
        <div className="h-9 rounded-lg bg-gradient-to-br from-sky-400/40 to-white/5" />
      </div>
    </div>
  );
}

// A quick-start tile: full-bleed preview with the section label + CTA overlaid.
function SectionTile({
  section,
  featured,
  onOpen,
}: {
  section: Section;
  featured?: boolean;
  onOpen: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group hub-tile relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] text-left transition duration-200 hover:border-accent-green/60 hover:shadow-[0_0_50px_rgba(212,255,61,0.16)] focus:outline-none focus-visible:border-accent-green/60 focus-visible:ring-2 focus-visible:ring-accent-green/40 lg:h-full ${
        featured ? "min-h-[280px] lg:min-h-0" : "min-h-[168px] lg:min-h-0"
      }`}
    >
      {/* Preview fills the tile; scale on hover (ken-burns) + gloss sweep + the
          per-tile loop (playable/video) are the "comes alive" effect. */}
      <div className="absolute inset-0">
        <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.06]">
          <TilePreview sectionId={section.id} />
        </div>
      </div>
      {/* Unified brand grade — a consistent lime sheen (top-right) so all four
          previews, photo or illustration, read as one visual system. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[rgba(212,255,61,0.12)]" />
      <span className="hub-shine" aria-hidden />
      {/* Darkening overlay: transparent at the top (preview stays visible), dark
          at the bottom where the label + button sit — so text is legible over
          ANY preview, no matter how bright. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />

      {section.id === "banner" ? (
        <span className="absolute right-3 top-3 z-10 rounded-full border border-accent-green/40 bg-[#0a0a0a] px-2.5 py-1 text-xs font-semibold text-accent-green shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          Рекомендуем начать
        </span>
      ) : null}

      {/* Hierarchy: the featured (banner) tile gets a bigger title, icon, CTA and
          padding; the other three stay compact. Styling/overlay is identical —
          only relative size and weight differ. */}
      <div
        className={`relative mt-auto flex flex-col items-start ${featured ? "gap-3.5 p-5" : "gap-2.5 p-4"}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`shrink-0 text-accent-green ${featured ? "h-5 w-5" : "h-4 w-4"}`} />
            <h3
              className={`truncate font-semibold text-white ${featured ? "text-xl lg:text-2xl" : "text-base"}`}
            >
              {section.title}
            </h3>
          </div>
          <p className={`mt-1 text-white/80 ${featured ? "text-sm" : "truncate text-xs"}`}>
            {section.description}
          </p>
        </div>
        {/* Clearly-active primary button on every tile (uniform style, smaller
            footprint on the non-featured ones). */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg bg-accent-green text-sm font-semibold text-black shadow-sm transition group-hover:bg-[var(--accent-hover)] ${
            featured ? "px-5 py-2.5" : "px-3.5 py-2"
          }`}
        >
          {section.cta}
          <ArrowRight className={featured ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </span>
      </div>
    </button>
  );
}

// Small thumbnail used by both the "recent" and "popular" horizontal rows.
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

// Russian plural for counts: 1 проект / 2 проекта / 5 проектов.
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Compact metric chip — big accent number over a quiet label, so the Hub reads
// as a workspace with progress rather than a catalogue of buttons.
function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-[var(--bg-surface)] px-3 py-3 sm:gap-3 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-2xl font-semibold leading-none tabular-nums text-accent-green">
          {value}
        </span>
        <span className="mt-1 block ds-caption">{label}</span>
      </span>
    </div>
  );
}

export default function HubPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [recent, setRecent] = useState<RecentCard[]>([]);
  const [firstName, setFirstName] = useState("");
  const [projectCount, setProjectCount] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Dream Weaver Studio";
  }, []);

  // Public for guests: the Hub is the shop window. Data-loading effects below
  // stay gated on isAuthenticated, so a guest simply sees no personal blocks.

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

  // Recent projects across all sections. Only banner projects exist today, so we
  // read the banner history. Any failure simply hides the block (never blocking).
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    apiJson<{ items?: unknown[] }>("/api/history?bucket=active")
      .then((r) => {
        if (cancelled) return;
        const cards = Array.isArray(r?.items) ? r.items : [];
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
            name: (c.name as string) || "Проект без названия",
            updatedLabel,
            thumb: (master?.image_url as string) || null,
          };
        });
        setRecent(mapped.filter((m) => m.id));
        setProjectCount(cards.length);
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated]);

  // Close the search dropdown on outside click.
  useEffect(() => {
    if (!searchFocused) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchFocused]);

  const q = query.trim().toLowerCase();
  const templateResults = useMemo(() => searchTemplates(query, 6), [query]);
  const projectResults = useMemo(
    () => (q ? recent.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4) : []),
    [q, recent],
  );
  const searchOpen = searchFocused && q.length > 0;
  const hasResults = templateResults.length + projectResults.length > 0;

  const openTemplate = (t: HubTemplate) => {
    setSearchFocused(false);
    router.push(t.href);
  };
  const openProject = (id: string) => {
    setSearchFocused(false);
    router.push(`/banner?card=${id}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  const bannerSection = SECTION_BY_ID.get("banner")!;
  const otherSections = SECTIONS.filter((s) => s.id !== "banner");
  const greeting = firstName ? `Что создаём сегодня, ${firstName}?` : "Что создаём сегодня?";
  // "0 проектов" would read as a scolding, so the strip only appears once there
  // is something to count.
  const showStats = projectCount > 0;
  const showOnboarding = historyLoaded && recent.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{HUB_ANIM}</style>
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* ── Greeting + search ─────────────────────────────────────────── */}
        {/* .hub-in animates transform with fill-mode:both, which leaves this
            element owning a stacking context forever — so the search dropdown
            inside it can only rise above the tiles if the WHOLE hero is lifted
            (z-50, above the z-40 scrim) while the dropdown is open. */}
        <div
          className={`hub-in relative mx-auto max-w-3xl text-center ${
            searchOpen ? "z-50" : ""
          }`}
        >
          <h1 className="ds-h1 sm:text-3xl">{greeting}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Выберите инструмент или найдите готовый шаблон — каждый проведёт вас по шагам до
            результата.
          </p>

          {/* Same shared scrim every other dropdown in the product uses — here
              on desktop too, so the results separate from the tiles behind. */}
          <MobileScrim open={searchOpen} onClose={() => setSearchFocused(false)} scope="all" />
          <div ref={searchRef} className="relative mt-5 text-left">
            <div className="flex h-13 w-full items-center gap-3 rounded-2xl border border-border bg-[var(--bg-surface)] px-4 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Искать шаблоны, проекты, бренды…"
                aria-label="Поиск по шаблонам и проектам"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Очистить поиск"
                  className="relative flex shrink-0 text-muted-foreground transition after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {searchOpen ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-foreground shadow-xl">
                {!hasResults ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm font-medium">Ничего не найдено</p>
                    <p className="mt-1 ds-caption">
                      По запросу «{query.trim()}» шаблонов и проектов нет
                    </p>
                  </div>
                ) : (
                  <>
                    {templateResults.length > 0 ? (
                      <div className="mb-1">
                        <p className="px-3 pb-1 pt-2 ds-micro uppercase tracking-wide text-muted-foreground">
                          Шаблоны
                        </p>
                        {templateResults.map((t) => {
                          const sec = SECTION_BY_ID.get(t.sectionId);
                          const SecIcon = sec?.icon;
                          return (
                            <button
                              key={`${t.sectionId}-${t.id}`}
                              type="button"
                              onClick={() => openTemplate(t)}
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                            >
                              <span
                                className="h-9 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-[var(--bg-surface)]"
                                aria-hidden
                              >
                                <Thumb
                                  preview={t.preview}
                                  gradient={t.gradient}
                                  fallbackIcon={SecIcon ? <SecIcon className="h-4 w-4" /> : null}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{t.name}</span>
                                <span className="flex items-center gap-1 truncate ds-caption">
                                  {SecIcon ? (
                                    <SecIcon className="h-3 w-3 shrink-0 text-accent-green" />
                                  ) : null}
                                  {sec?.title}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {projectResults.length > 0 ? (
                      <div>
                        <p className="px-3 pb-1 pt-2 ds-micro uppercase tracking-wide text-muted-foreground">
                          Мои проекты
                        </p>
                        {projectResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => openProject(p.id)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                          >
                            <span className="h-9 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-[var(--bg-surface)]">
                              <Thumb
                                preview={p.thumb}
                                fallbackIcon={<Clock className="h-4 w-4" />}
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{p.name}</span>
                              {p.updatedLabel ? (
                                <span className="block truncate ds-caption">
                                  Изменён {p.updatedLabel}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* ── Quick stats: a little sense of progress above the tools.
              Credits deliberately live only in the header — showing them here
              too was pure duplication. ─────────────────────────────────────── */}
          {showStats ? (
            <div
              className="hub-in mt-6 flex justify-center"
              style={{ "--d": "60ms" } as React.CSSProperties}
            >
              <StatCard
                icon={<LayoutGrid className="h-4 w-4" />}
                value={projectCount}
                label={`${plural(projectCount, "проект", "проекта", "проектов")} создано`}
              />
            </div>
          ) : null}

          {/* First-visit nudge — fills the space that "Недавние проекты" takes
              for returning users, and points at the tools right below it. */}
          {showOnboarding ? (
            <div
              className="hub-in mt-6 flex items-center gap-3 rounded-2xl border border-accent-green/25 bg-accent-green/[0.06] p-4 text-left"
              style={{ "--d": "90ms" } as React.CSSProperties}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Начните с любого инструмента ниже
                </span>{" "}
                — мы поможем создать первый креатив за пару минут.
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Quick start (asymmetric: banner featured) ─────────────────── */}
        <div className="mt-10">
          {/* The banner column is deliberately wider (1.35fr) — it is the primary
              tool; the other three share the remaining space as secondary. */}
          <div className="grid grid-cols-1 gap-4 lg:h-[480px] lg:grid-cols-[1.35fr_1fr_1fr] lg:grid-rows-2">
            <div
              className="hub-in lg:col-start-1 lg:row-span-2"
              style={{ "--d": "120ms" } as React.CSSProperties}
            >
              <SectionTile
                section={bannerSection}
                featured
                onOpen={() => router.push(bannerSection.route)}
              />
            </div>
            {otherSections.map((s, i) => (
              <div
                key={s.id}
                style={{ "--d": `${170 + i * 55}ms` } as React.CSSProperties}
                className={`hub-in ${
                  // landing → col2/row1, playable → col3/row1, video → wide col2-3/row2
                  i === 0
                    ? "lg:col-start-2 lg:row-start-1"
                    : i === 1
                      ? "lg:col-start-3 lg:row-start-1"
                      : "lg:col-start-2 lg:col-span-2 lg:row-start-2"
                }`}
              >
                <SectionTile section={s} onOpen={() => router.push(s.route)} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent projects (only when the user has some) ─────────────── */}
        {recent.length > 0 ? (
          <section className="hub-in mt-12" style={{ "--d": "300ms" } as React.CSSProperties}>
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent-green" />
              <h2 className="text-lg font-semibold">Недавние проекты</h2>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {recent.map((p) => {
                const BannerIcon = bannerSection.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => router.push(`/banner?card=${p.id}`)}
                    className="group flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition hover:border-white/25 hover:bg-[var(--bg-surface-hover)] sm:w-auto"
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

        {/* ── Popular templates (MOCK — see lib/hubTemplates) ───────────── */}
        <section className="hub-in mt-12" style={{ "--d": "340ms" } as React.CSSProperties}>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-green" />
            <h2 className="text-lg font-semibold">Популярные шаблоны</h2>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
            {POPULAR_TEMPLATES.map((t) => {
              const sec = SECTION_BY_ID.get(t.sectionId);
              const SecIcon = sec?.icon;
              return (
                <button
                  key={`${t.sectionId}-${t.id}`}
                  type="button"
                  onClick={() => openTemplate(t)}
                  className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)] text-left transition hover:border-accent-green/50 hover:bg-[var(--bg-surface-hover)] sm:w-auto"
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
      </div>
    </div>
  );
}
