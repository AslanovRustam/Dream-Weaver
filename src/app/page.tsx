"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Clock,
  HelpCircle,
  Mail,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { MobileScrim } from "@/components/MobileScrim";
import { BANNER_TEMPLATES_ROUTE, CATEGORIES } from "@/components/PresetSidebar";
import { SECTIONS, SECTION_BY_ID, sectionEntryRoute, type Section } from "@/lib/sections";
import { MVP_ENABLED_SECTION_IDS } from "@/lib/mvp";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";
import { useWorkspace } from "@/lib/workspace-context";
import { getMockProjects } from "@/lib/historyMock";
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
/* Editorial hero: display type sized in container-query units so the three
   lines keep filling the column at every width (the column is narrower than
   the viewport because of the sidebar, so vw would overflow). Per-line sizes
   are tuned to the glyph count of each line. */
.hub-hero { container-type: inline-size; }
.hero-line { display: block; font-weight: 800; text-transform: uppercase; letter-spacing: -.045em; line-height: .9; }
.hero-line-1 { font-size: 14.2cqw; }
.hero-line-2 { font-size: 13.9cqw; }
.hero-line-3 { font-size: 13.7cqw; }
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
  label: "Баннер · Казино",
  pos: "left-1/2 top-0 w-[17%] -translate-x-[64%]",
  ratio: "aspect-[3/2]",
  d: "60ms",
};

// Samples behind the type, in the two side columns and the band below it.
// Picked for colour spread so the collage never reads as one gold blur.
const HERO_SHOTS = [
  { src: "/previews/preset20.webp", label: "Бонус", pos: "left-0 top-[15%] w-[15%]", ratio: "aspect-[3/2]", d: "120ms" },
  { src: "/previews/preset15.webp", label: "Слот", pos: "-left-10 top-[43%] w-[17%]", ratio: "aspect-[3/2]", d: "180ms" },
  { src: "/previews/hero-wheel.webp", label: "Лендинг · Колесо", pos: "left-[1%] bottom-0 w-[16%]", ratio: "aspect-[4/3]", d: "300ms" },
  { src: "/previews/preset19.webp", label: "Коэффициенты", pos: "right-0 top-[9%] w-[15%]", ratio: "aspect-[3/2]", d: "150ms" },
  { src: "/previews/preset2.webp", label: "Новый слот", pos: "-right-10 top-[42%] w-[17%]", ratio: "aspect-[3/2]", d: "210ms" },
  { src: "/previews/preset11.webp", label: "Аркада", pos: "left-[24%] bottom-[7%] w-[18%]", ratio: "aspect-[3/2]", d: "330ms" },
  { src: "/previews/preset4.webp", label: "Спорт · Матч", pos: "right-[18%] bottom-[1%] w-[22%]", ratio: "aspect-[3/2]", d: "260ms" },
  { src: "/previews/preset7.webp", label: "Запуск казино", pos: "right-[1%] bottom-[11%] w-[15%]", ratio: "aspect-[3/2]", d: "360ms" },
];

const PRESET_CAT: Record<string, string> = {};
for (const c of CATEGORIES) for (const id of c.presetIds) PRESET_CAT[id] = c.id;

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
          style={{ background: "radial-gradient(46% 34% at 50% 22%, rgba(198,255,61,0.16), transparent 70%)" }}
        />
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-[14%] flex-col items-center">
          <div className="h-10 w-10 rounded-full bg-[#070a10]" />
          <div className="-mt-1.5 h-16 w-28 rounded-t-[46px] bg-[#070a10]" />
        </div>
        <span className="relative z-10 mb-5 flex items-center justify-center">
          <span className="hub-pulse" style={{ inset: "-11px" }} aria-hidden />
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-green text-on-accent shadow-glow-lime">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </span>
      </div>
    );
  }
  if (sectionId === "email") {
    return (
      <div className={`flex h-full w-full items-center justify-center ${PREVIEW_BASE} p-5`}>
        <div className="w-full max-w-[220px] overflow-hidden rounded-lg bg-white shadow-lg">
          <div className="px-3 py-2" style={{ borderBottom: "1px solid #eef1f4" }}>
            <span className="text-xs font-extrabold" style={{ color: "#7B5CFF" }}>
              Adspire
            </span>
          </div>
          <div className="px-3 py-3" style={{ background: "linear-gradient(160deg,#7B5CFF14,#fff)" }}>
            <div className="h-2 w-4/5 rounded bg-[#0f172a]/85" />
            <div className="mt-1.5 h-1.5 w-3/5 rounded bg-[#475569]/45" />
          </div>
          <div className="px-3 pb-3 pt-2">
            <div className="h-1.5 w-full rounded bg-[#334155]/20" />
            <div className="mt-1 h-1.5 w-11/12 rounded bg-[#334155]/20" />
            <div className="mt-3 h-5 w-24 rounded-md" style={{ backgroundColor: "#7B5CFF" }} />
          </div>
        </div>
      </div>
    );
  }
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

const MVP_ENABLED = MVP_ENABLED_SECTION_IDS;

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
  const soon = !MVP_ENABLED.has(section.id);

  if (soon) {
    return (
      <div
        aria-disabled="true"
        title={`${section.title} — скоро`}
        className={`hub-tile relative flex w-full cursor-not-allowed flex-col overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] text-left opacity-55 grayscale lg:h-full ${
          featured ? "min-h-[280px] lg:min-h-0" : "min-h-[168px] lg:min-h-0"
        }`}
      >
        <div className="relative min-h-[104px] w-full flex-1 overflow-hidden">
          <div className="absolute inset-0">
            <TilePreview sectionId={section.id} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-surface)] to-transparent" />
        </div>
        <span className="absolute right-3 top-3 z-10 rounded-full border border-border bg-[var(--bg-void)]/80 px-2.5 py-1 text-xs font-semibold text-hint backdrop-blur">
          Скоро
        </span>
        <div className={`relative flex flex-col items-start ${featured ? "gap-3.5 p-5" : "gap-2 p-4"}`}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-hint">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className={`truncate font-semibold tracking-tight text-muted-foreground ${featured ? "text-xl" : "text-base"}`}>
              {section.title}
            </h3>
          </div>
          <p className="mt-1.5 truncate text-xs text-hint">{section.description}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      // The featured tile is the violet emphasis surface (system: violet carries
      // emphasis); the other three keep the lime accent. Border AND hover glow
      // live inside the ternary so the two treatments never both apply — two
      // competing hover utilities would resolve by stylesheet order, not by the
      // order written here.
      className={`group hub-tile relative flex w-full flex-col overflow-hidden rounded-2xl border bg-[var(--bg-surface)] text-left shadow-[0_10px_34px_-14px_rgba(0,0,0,0.75)] transition-all duration-300 ease-out hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/40 lg:h-full ${
        featured
          ? "min-h-[280px] border-[color:var(--brand-violet)]/40 shadow-[0_16px_48px_-16px_rgba(123,92,255,0.40)] hover:border-[color:var(--brand-violet)]/75 hover:shadow-[0_22px_66px_-16px_rgba(123,92,255,0.55)] focus-visible:border-[color:var(--brand-violet)]/75 lg:min-h-0"
          : "min-h-[168px] border-border hover:border-accent-green/70 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.40)] focus-visible:border-accent-green/60 lg:min-h-0"
      }`}
    >
      {featured ? (
        <>
          {/* Featured (banner) — full-bleed preview with the caption OVERLAID at
              the bottom over a darkening gradient. Tall enough that the two never
              collide. */}
          <div className="absolute inset-0">
            <div className="h-full w-full transition-transform duration-[650ms] ease-out group-hover:scale-[1.07]">
              <TilePreview sectionId={section.id} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[rgba(123,92,255,0.18)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/[0.08] to-transparent" />
          <span className="hub-shine" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
            style={{ background: "radial-gradient(115% 90% at 16% 120%, rgba(123,92,255,0.45), transparent 58%)" }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.07]" />
          <span className="absolute right-3 top-3 z-10 rounded-full border border-accent-green/40 bg-[var(--bg-void)] px-2.5 py-1 text-xs font-semibold text-accent-green shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
            Рекомендуем начать
          </span>
        </>
      ) : (
        // Other tools — a clean CAPTION card: the animated preview lives in a
        // top band, the label + CTA sit BELOW it on the card's solid surface, so
        // text never overlaps the preview at any size (the mobile failure mode).
        <div className="relative min-h-[104px] w-full flex-1 overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-[650ms] ease-out group-hover:scale-[1.07]">
            <TilePreview sectionId={section.id} />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[rgba(198,255,61,0.12)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/[0.08] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-surface)] to-transparent" />
          <span className="hub-shine" aria-hidden />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
        </div>
      )}

      {/* Hierarchy: the featured (banner) tile gets a bigger title, icon, CTA and
          padding; the other three stay compact. Styling/overlay is identical —
          only relative size and weight differ. */}
      <div
        className={`relative flex flex-col items-start ${featured ? "mt-auto gap-3.5 p-5" : "gap-2 p-4"}`}
      >
        <div className="w-full min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg backdrop-blur-sm ${
                featured
                  ? "h-8 w-8 bg-[color:var(--brand-violet)]/25 text-[color:var(--violet-400)] ring-1 ring-[color:var(--brand-violet)]/40"
                  : "h-7 w-7 bg-accent-green/20 text-accent-green ring-1 ring-accent-green/30"
              }`}
            >
              <Icon className={featured ? "h-[18px] w-[18px]" : "h-4 w-4"} />
            </span>
            <h3
              className={`truncate font-semibold tracking-tight text-white ${featured ? "text-xl lg:text-2xl" : "text-base"}`}
            >
              {section.title}
            </h3>
          </div>
          <p className={`mt-1.5 text-white/80 ${featured ? "text-sm" : "truncate text-xs"}`}>
            {section.description}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg bg-accent-green font-semibold text-on-accent shadow-[0_2px_10px_rgba(0,0,0,0.30)] transition-all duration-200 group-hover:bg-[var(--accent-hover)] group-hover:shadow-glow-lime ${
            featured ? "px-5 py-2.5 text-sm" : "px-3.5 py-2 text-sm"
          }`}
        >
          {section.cta}
          <ArrowRight
            className={`transition-transform duration-200 group-hover:translate-x-0.5 ${featured ? "h-4 w-4" : "h-3.5 w-3.5"}`}
          />
        </span>
      </div>
    </button>
  );
}

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
  const { activeId } = useWorkspace();
  const [recent, setRecent] = useState<RecentCard[]>([]);
  const [firstName, setFirstName] = useState("");
  const [projectCount, setProjectCount] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [hubPrompt, setHubPrompt] = useState("");
  const [showcaseCat, setShowcaseCat] = useState<string>("all");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
      setProjectCount(list.length);
      setHistoryLoaded(true);
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
        applyMock();
      });
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, activeId]);

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
  const templateResults = useMemo(
    () => searchTemplates(query, 24).filter((t) => MVP_ENABLED.has(t.sectionId)).slice(0, 6),
    [query],
  );
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
        Загрузка…
      </div>
    );
  }

  const bannerSection = SECTION_BY_ID.get("banner")!;
  const CREATE_IDS = new Set(["landing", "playable", "video", "email"]);
  const otherSections = SECTIONS.filter((s) => CREATE_IDS.has(s.id));
  const greeting = firstName ? `Что создаём сегодня, ${firstName}?` : "Что создаём сегодня?";
  // Gate onboarding on the same count as the stat so the two are mutually
  // exclusive — a first-visit user (0 projects) sees the nudge, a returning one
  // sees the stat, and malformed data can never show both at once.
  const showOnboarding = historyLoaded && projectCount === 0;

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
            <p className="ds-overline ds-overline-accent">GenGO Studio</p>
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
                  {shot.label}
                </span>
              </span>
            ))}
          </div>

          <h1 className="hub-in relative mt-6 text-center text-foreground sm:mt-7" style={{ "--d": "40ms" } as React.CSSProperties}>
            <span className="hero-line hero-line-1">Креатив,</span>{" "}
            <span className="hero-line hero-line-2">который</span>{" "}
            <span className="hero-line hero-line-3">
              продаёт
            </span>
          </h1>

          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
            <span
              style={{ "--d": HERO_SHOT_TOP.d } as React.CSSProperties}
              className={`hub-shot absolute ${HERO_SHOT_TOP.pos}`}
            >
              <span
                  className={`block overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-surface)] shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] ${HERO_SHOT_TOP.ratio}`}
                >
                  <img src={HERO_SHOT_TOP.src} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="mt-1.5 block truncate ds-micro uppercase tracking-wide text-hint">
                  {HERO_SHOT_TOP.label}
                </span>
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
          <p className="ds-overline shrink-0 md:w-40">iGaming · Креативы</p>
          <p className="max-w-lg text-sm text-muted-foreground md:text-center">
            У вашего оффера есть что сказать. Мы превращаем это в баннеры, лендинги, письма и
            видео, которые узнают с первого показа.
          </p>
          <Link
            href={BANNER_TEMPLATES_ROUTE}
            className="ds-overline group inline-flex shrink-0 items-center gap-1.5 text-foreground transition hover:text-accent-green md:w-40 md:justify-end"
          >
            Смотреть шаблоны
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div
          className={`hub-in relative mx-auto max-w-3xl text-center ${
            searchOpen ? "z-50" : ""
          }`}
        >
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
                placeholder="Например: приветственный бонус 100% для онлайн-казино…"
                aria-label="Опишите креатив"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hint sm:text-base"
              />
              <button
                type="submit"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
              >
                Создать
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {TOOL_CHIPS.map((sc) => {
              const Icon = sc.icon;
              const soon = !MVP_ENABLED.has(sc.id);
              if (soon) {
                return (
                  <span
                    key={sc.id}
                    aria-disabled="true"
                    title={`${sc.title} — скоро`}
                    className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-white/[0.02] px-3 text-xs font-medium text-hint opacity-60"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {sc.title}
                    <span className="ml-0.5 rounded-full border border-border px-1 text-[9px] uppercase tracking-wide">
                      Скоро
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
                  {sc.title}
                </Link>
              );
            })}
          </div>

          <p className="mx-auto mt-7 max-w-md ds-caption">Или найдите готовый шаблон</p>

          <MobileScrim open={searchOpen} onClose={() => setSearchFocused(false)} scope="all" />
          <div ref={searchRef} className="relative mt-4 text-left">
            <div className="flex h-13 w-full items-center gap-3 rounded-2xl border border-border bg-[var(--bg-surface)] px-4 shadow-[0_8px_28px_-18px_rgba(0,0,0,0.8)] transition focus-within:border-accent-green focus-within:shadow-[0_0_0_4px_rgba(198,255,61,0.10)] focus-within:ring-1 focus-within:ring-accent-green">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Искать шаблоны, проекты, бренды…"
                aria-label="Поиск по шаблонам и проектам"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hint"
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
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-foreground shadow-xl">
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

          {showOnboarding ? (
            <div
              className="hub-in mt-5 flex items-center gap-3 rounded-2xl border border-accent-green/25 bg-accent-green/[0.06] p-4 text-left"
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

        {/* Large bottom margin sets a clear break before "Недавние проекты"
            (primary action → secondary content). A compact top margin and a
            shorter grid keep all four tiles inside the first desktop viewport. */}
        <div className="mt-6 mb-16 sm:mt-6 sm:mb-20">
          <div className="grid grid-cols-1 gap-4 lg:h-[420px] lg:grid-cols-[1.35fr_1fr_1fr] lg:grid-rows-2">
            <div
              className="hub-in lg:col-start-1 lg:row-span-2"
              style={{ "--d": "120ms" } as React.CSSProperties}
            >
              <SectionTile
                section={bannerSection}
                featured
                onOpen={() => router.push(sectionEntryRoute(bannerSection))}
              />
            </div>
            {otherSections.map((s, i) => (
              <div
                key={s.id}
                style={{ "--d": `${170 + i * 55}ms` } as React.CSSProperties}
                className={`hub-in ${
                  i === 0
                    ? "lg:col-start-2 lg:row-start-1"
                    : i === 1
                      ? "lg:col-start-3 lg:row-start-1"
                      : i === 2
                        ? "lg:col-start-2 lg:row-start-2"
                        : "lg:col-start-3 lg:row-start-2"
                }`}
              >
                <SectionTile section={s} onOpen={() => router.push(sectionEntryRoute(s))} />
              </div>
            ))}
          </div>
        </div>

        <section className="hub-in mt-14" style={{ "--d": "220ms" } as React.CSSProperties}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="ds-feature-icon h-9 w-9 shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="ds-overline ds-overline-accent">Витрина</p>
                <h2 className="mt-0.5 text-lg font-semibold">Примеры креативов</h2>
              </div>
            </div>
            <Link
              href="/banner/templates"
              className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-green transition hover:text-[var(--accent-hover)] sm:inline-flex"
            >
              Все шаблоны
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
                <p className="ds-overline ds-overline-accent">Продолжить</p>
                <h2 className="mt-0.5 text-lg font-semibold">Недавние проекты</h2>
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
              <p className="ds-overline ds-overline-accent">Быстрый старт</p>
              <h2 className="mt-0.5 text-lg font-semibold">Популярные шаблоны</h2>
            </div>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
            {POPULAR_TEMPLATES.filter((t) => MVP_ENABLED.has(t.sectionId)).map((t) => {
              const sec = SECTION_BY_ID.get(t.sectionId);
              const SecIcon = sec?.icon;
              return (
                <button
                  key={`${t.sectionId}-${t.id}`}
                  type="button"
                  onClick={() => openTemplate(t)}
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
                <h2 className="text-lg font-semibold">Нужна помощь?</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  База знаний, частые вопросы и связь с поддержкой — в одном месте.
                </p>
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                href="/help"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--border-strong)] px-4 text-sm font-medium text-foreground transition hover:border-white/28 hover:bg-[var(--overlay-hover)] sm:w-auto"
              >
                <BookOpen className="h-4 w-4" />
                База знаний
              </Link>
              <Link
                href="/help#contact"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-muted-foreground transition hover:bg-[var(--overlay-hover)] hover:text-foreground sm:w-auto"
              >
                <Mail className="h-4 w-4" />
                Написать в поддержку
              </Link>
            </div>
          </div>
        </section>
      </div>
      </AppShell>
    </div>
  );
}
