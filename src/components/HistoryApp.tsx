"use client";

// История — two tabs, because they answer two different needs:
//   • "Мои проекты" → find & reuse your past work (Canva "Your designs")
//   • "Кредиты"     → see where credits went (billing/usage log)
//
// Projects: loads real banner history from /api/history when available and
// falls back to a flagged cross-type MOCK (lib/historyMock) for local review /
// tool types the backend doesn't persist yet. Trash and bulk-delete (pre-existing
// features) are preserved; favorites is kept in code but hidden behind the
// SHOW_FAVORITES flag. New spec adds sort, grid/list, per-card ⋯ actions and
// inline rename. Credits tab is fully mocked.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  Heart,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { MobileScrim } from "@/components/MobileScrim";
import { SECTION_BY_ID, type SectionId } from "@/lib/sections";
import { apiJson } from "@/lib/api-client";
import {
  getMockCredits,
  getMockProjects,
  type CreditTx,
  type Project,
  type ProjectType,
} from "@/lib/historyMock";

type Tab = "projects" | "credits";
type SortKey = "new" | "old" | "name";
type ViewMode = "grid" | "list";

const TYPES: ProjectType[] = ["banner", "landing", "playable", "video"];
const TYPE_PLURAL: Record<ProjectType, string> = {
  banner: "Баннеры",
  landing: "Лендинги",
  playable: "Плейблы",
  video: "Видео",
};

// Feature flag: "Избранное" is temporarily hidden across История (desktop filter
// toggle, mobile sheet toggle, per-card ♥). All favorites state, filter logic and
// the FavToggle component are kept intact — flip to true to bring it back.
const SHOW_FAVORITES = false;

// ── main ────────────────────────────────────────────────────────────────────
export function HistoryApp() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("projects");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:py-8">
      {/* Header: back → личный кабинет, title, tabs */}
      <button
        type="button"
        onClick={() => router.push("/account")}
        className="-ml-1 mb-3 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Личный кабинет
      </button>
      <h1 className="ds-h1 sm:text-3xl">История</h1>

      <div className="mt-4 flex border-b border-border">
        {(
          [
            ["projects", "Мои проекты"],
            ["credits", "Кредиты"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`relative flex-1 px-3 py-2.5 text-sm font-medium transition sm:flex-none sm:px-5 ${
              tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full transition ${
                tab === id ? "bg-accent-green" : "bg-transparent"
              }`}
            />
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "projects" ? <ProjectsTab /> : <CreditsTab />}
      </div>
    </div>
  );
}

// ── Tab 1: projects ───────────────────────────────────────────────────────────
function ProjectsTab() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null); // null = loading
  const [q, setQ] = useState("");
  const [type, setType] = useState<ProjectType | "all">("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [view, setView] = useState<ViewMode>("grid");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [bucket, setBucket] = useState<"active" | "trash">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(12); // client-side pagination (infinite scroll)
  const [filterSheet, setFilterSheet] = useState(false);

  // Load: real banners when available, else cross-type mock for review.
  useEffect(() => {
    let cancelled = false;
    apiJson<{ items?: unknown[] }>("/api/history?bucket=active&limit=100")
      .then((r) => {
        if (cancelled) return;
        const items = Array.isArray(r?.items) ? r.items : [];
        setProjects(items.length > 0 ? mapRealCards(items) : getMockProjects());
      })
      .catch(() => {
        if (!cancelled) setProjects(getMockProjects());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const query = q.trim().toLowerCase();
    let list = projects.filter((p) => p.deleted === (bucket === "trash"));
    if (type !== "all") list = list.filter((p) => p.type === type);
    if (favoritesOnly) list = list.filter((p) => p.favorite);
    if (query) list = list.filter((p) => p.name.toLowerCase().includes(query));
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ru");
      const da = +new Date(a.updatedAt);
      const db = +new Date(b.updatedAt);
      return sort === "old" ? da - db : db - da;
    });
    return list;
  }, [projects, q, type, favoritesOnly, bucket, sort]);

  // Reset pagination + selection when filters change.
  useEffect(() => {
    setVisible(12);
    setSelected(new Set());
  }, [q, type, favoritesOnly, bucket, sort]);

  const page = filtered.slice(0, visible);

  // Infinite scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setVisible((v) => (v < filtered.length ? v + 12 : v));
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  // Mutations (optimistic; fire real API for real items, best-effort).
  const patch = (id: string, fn: (p: Project) => Project) =>
    setProjects((prev) => (prev ? prev.map((p) => (p.id === id ? fn(p) : p)) : prev));

  const toggleFav = (p: Project) => {
    patch(p.id, (x) => ({ ...x, favorite: !x.favorite }));
    if (p.real) apiJson(`/api/history/${p.id}`, { method: "PATCH", json: { is_favorite: !p.favorite } }).catch(() => {});
  };
  const rename = (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const target = projects?.find((x) => x.id === id);
    patch(id, (x) => ({ ...x, name: clean }));
    // Persist for real cards (was local-only, so renames reverted on reload).
    if (target?.real) apiJson(`/api/history/${id}`, { method: "PATCH", json: { name: clean } }).catch(() => {});
  };
  const duplicate = (p: Project) => {
    // Unique id — the old `${id}-copy-${name.length}${updatedAt slice}` scheme
    // collided when the same card was duplicated twice (same length + tail),
    // producing duplicate React keys that made later actions hit both copies.
    const copy: Project = { ...p, id: `${p.id}-copy-${crypto.randomUUID().slice(0, 8)}`, name: `${p.name} (копия)`, updatedAt: new Date().toISOString(), favorite: false, real: false };
    setProjects((prev) => (prev ? [copy, ...prev] : prev));
    toast.success("Проект дублирован");
  };
  const trash = (p: Project) => {
    patch(p.id, (x) => ({ ...x, deleted: true }));
    setSelected((s) => { const n = new Set(s); n.delete(p.id); return n; });
    if (p.real) apiJson("/api/history/bulk-delete", { method: "POST", json: { card_ids: [p.id] } }).catch(() => {});
    toast("Перемещено в корзину");
  };
  const restore = (p: Project) => {
    patch(p.id, (x) => ({ ...x, deleted: false }));
    // Persist for real cards (restore endpoint takes one card_id).
    if (p.real) apiJson("/api/history/restore", { method: "POST", json: { card_id: p.id } }).catch(() => {});
    toast.success("Восстановлено");
  };
  // Permanent delete has no backend endpoint yet (only soft bulk-delete +
  // restore exist), so this stays local until one lands.
  const hardDelete = (p: Project) => {
    setProjects((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
    setSelected((s) => { const n = new Set(s); n.delete(p.id); return n; });
    toast("Удалено навсегда");
  };
  const download = (p: Project) => {
    if (p.type === "landing") toast("Скачивание HTML лендинга…");
    else if (p.type === "playable") toast("Скачивание HTML5-пакета…");
    else toast("Скачивание файла…");
  };
  const openProject = (p: Project) => {
    // Only banners can be reopened with their saved state (?card= restore).
    // Landing/playable/video have no restore flow yet, so routing to the bare
    // generator opened a BLANK screen that looked like the project failed to
    // load. Be honest instead of misleading.
    if (p.real && p.type === "banner") {
      router.push(`${SECTION_BY_ID.get(p.type)!.route}?card=${p.id}`);
      return;
    }
    if (p.real) {
      toast("Открытие проектов этого типа скоро — пока доступны баннеры");
      return;
    }
    // Mock/demo cards: just open the matching generator fresh.
    router.push(SECTION_BY_ID.get(p.type)!.route);
  };
  // Read-only card detail (hero + resizes). Banner-only for now, which is also
  // the only entry point into /history/[cardId] — that page was otherwise
  // unreachable except by typing the URL.
  const openCard = (p: Project) => router.push(`/history/${p.id}`);

  const bulkTrash = () => {
    const ids = new Set(selected);
    const realIds = (projects || []).filter((p) => ids.has(p.id) && p.real).map((p) => p.id);
    setProjects((prev) => (prev ? prev.map((p) => (ids.has(p.id) ? { ...p, deleted: true } : p)) : prev));
    setSelected(new Set());
    // Persist for real cards (was optimistic-only, so a bulk trash reverted on reload).
    if (realIds.length) apiJson("/api/history/bulk-delete", { method: "POST", json: { card_ids: realIds } }).catch(() => {});
    toast(`Перемещено в корзину: ${ids.size}`);
  };

  // Trash-bucket bulk actions (the bar previously offered only "В корзину" even
  // inside the trash, where it was a no-op).
  const bulkRestore = () => {
    const ids = new Set(selected);
    const realIds = (projects || []).filter((p) => ids.has(p.id) && p.real).map((p) => p.id);
    setProjects((prev) => (prev ? prev.map((p) => (ids.has(p.id) ? { ...p, deleted: false } : p)) : prev));
    setSelected(new Set());
    // Restore endpoint takes one card_id — fire per real card.
    realIds.forEach((id) =>
      apiJson("/api/history/restore", { method: "POST", json: { card_id: id } }).catch(() => {}),
    );
    toast.success(`Восстановлено: ${ids.size}`);
  };
  const bulkHardDelete = () => {
    const ids = new Set(selected);
    setProjects((prev) => (prev ? prev.filter((p) => !ids.has(p.id)) : prev));
    setSelected(new Set());
    // No permanent-delete endpoint yet — local only.
    toast(`Удалено навсегда: ${ids.size}`);
  };

  const isMobile = useIsMobile();
  const activeFilters = (type !== "all" ? 1 : 0) + (SHOW_FAVORITES && favoritesOnly ? 1 : 0) + (bucket === "trash" ? 1 : 0);
  const effectiveView: ViewMode = isMobile ? "list" : view; // mobile is always list

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по названию проекта"
              aria-label="Поиск проектов"
              className="h-11 w-full rounded-lg border border-border bg-elevated pl-9 pr-3 text-sm outline-none transition focus:border-accent-green"
            />
          </div>
          {/* Mobile: single Фильтры button → bottom sheet */}
          <button
            type="button"
            onClick={() => setFilterSheet(true)}
            className="relative inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition hover:bg-white/5 sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Фильтры
            {activeFilters > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-green px-1 ds-micro font-bold text-on-accent">
                {activeFilters}
              </span>
            ) : null}
          </button>
        </div>

        {/* Desktop inline controls */}
        <div className="hidden items-center gap-3 sm:flex">
          <TypePills type={type} onType={setType} />
          <div className="ml-auto flex items-center gap-2">
            {SHOW_FAVORITES ? <FavToggle on={favoritesOnly} onToggle={() => setFavoritesOnly((v) => !v)} /> : null}
            <BucketToggle bucket={bucket} onBucket={setBucket} />
            <SortSelect sort={sort} onSort={setSort} />
            <ViewToggle view={view} onView={setView} />
          </div>
        </div>
      </div>

      {/* Body */}
      {projects === null ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <ProjectsEmpty bucket={bucket} filtered={Boolean(q || type !== "all" || favoritesOnly)} />
      ) : (
        <>
          {effectiveView === "grid" ? (
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {page.map((p) => (
                <ProjectGridCard
                  key={p.id}
                  p={p}
                  selected={selected.has(p.id)}
                  onSelect={() => toggleSel(setSelected, p.id)}
                  actions={{ openProject, openCard, duplicate, rename, download, trash, restore, hardDelete, toggleFav }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              {page.map((p) => (
                <ProjectListRow
                  key={p.id}
                  p={p}
                  selected={selected.has(p.id)}
                  onSelect={() => toggleSel(setSelected, p.id)}
                  actions={{ openProject, openCard, duplicate, rename, download, trash, restore, hardDelete, toggleFav }}
                />
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="h-px" />
        </>
      )}

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-popover px-3 py-2 shadow-xl">
            <span className="px-1 text-sm">Выделено: {selected.size}</span>
            {bucket === "trash" ? (
              // In the trash bucket the useful bulk actions are restore and
              // permanent delete — not another "В корзину" (which was a no-op).
              <>
                <button
                  type="button"
                  onClick={bulkRestore}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-green/15 px-3 py-1.5 text-sm text-accent-green transition hover:bg-accent-green/25"
                >
                  <RotateCcw className="h-4 w-4" /> Восстановить
                </button>
                <button
                  type="button"
                  onClick={bulkHardDelete}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--status-error)]/15 px-3 py-1.5 text-sm text-[color:var(--status-error)] transition hover:bg-[color:var(--status-error)]/25"
                >
                  <Trash2 className="h-4 w-4" /> Удалить навсегда
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={bulkTrash}
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--status-error)]/15 px-3 py-1.5 text-sm text-[color:var(--status-error)] transition hover:bg-[color:var(--status-error)]/25"
              >
                <Trash2 className="h-4 w-4" /> В корзину
              </button>
            )}
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Снять выделение" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile filter sheet */}
      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Фильтры и сортировка">
        <div className="flex flex-col gap-5">
          <SheetGroup label="Тип">
            <TypePills type={type} onType={setType} wrap />
          </SheetGroup>
          <SheetGroup label="Сортировка">
            <SortSelect sort={sort} onSort={setSort} full />
          </SheetGroup>
          <SheetGroup label="Показывать">
            <div className="flex flex-col gap-2">
              {SHOW_FAVORITES ? <FavToggle on={favoritesOnly} onToggle={() => setFavoritesOnly((v) => !v)} full /> : null}
              <BucketToggle bucket={bucket} onBucket={setBucket} full />
            </div>
          </SheetGroup>
          <button
            type="button"
            onClick={() => setFilterSheet(false)}
            className="min-h-12 w-full rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            Показать
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

type CardActions = {
  openProject: (p: Project) => void;
  openCard: (p: Project) => void;
  duplicate: (p: Project) => void;
  rename: (id: string, name: string) => void;
  download: (p: Project) => void;
  trash: (p: Project) => void;
  restore: (p: Project) => void;
  hardDelete: (p: Project) => void;
  toggleFav: (p: Project) => void;
};

function toggleSel(setSelected: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
  setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
}

// Shared preview (image / gradient / video play overlay) + type chip.
function Preview({ p, rounded }: { p: Project; rounded: string }) {
  const Icon = SECTION_BY_ID.get(p.type)!.icon;
  return (
    <div className={`relative overflow-hidden bg-background ${rounded}`}>
      {p.thumb ? (
        <img src={p.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full" style={{ background: p.gradient ?? "var(--bg-surface-hover)" }} />
      )}
      {p.type === "video" ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
        </span>
      ) : null}
      <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-accent-green backdrop-blur" title={SECTION_BY_ID.get(p.type)!.title}>
        <Icon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function ProjectGridCard({ p, selected, onSelect, actions }: { p: Project; selected: boolean; onSelect: () => void; actions: CardActions }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`group overflow-hidden rounded-xl border bg-card transition ${selected ? "border-accent-green ring-1 ring-accent-green" : "border-border hover:border-white/25"}`}>
      <button type="button" onClick={() => actions.openProject(p)} className="block w-full text-left">
        <div className="relative aspect-[4/3] w-full">
          <Preview p={p} rounded="absolute inset-0" />
          <span
            role="checkbox"
            aria-checked={selected}
            aria-label="Выделить"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelect(); } }}
            className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border text-xs transition ${selected ? "border-accent-green bg-accent-green text-on-accent" : "border-white/40 bg-black/40 text-transparent opacity-0 backdrop-blur group-hover:opacity-100"}`}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <EditableName p={p} editing={editing} setEditing={setEditing} onRename={actions.rename} />
          <p className="mt-0.5 truncate ds-caption">{p.meta}</p>
          <p className="ds-micro text-muted-foreground">{formatRelative(p.updatedAt)}</p>
        </div>
        {SHOW_FAVORITES ? (
          <button type="button" onClick={() => actions.toggleFav(p)} aria-label={p.favorite ? "Убрать из избранного" : "В избранное"} className="-mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground">
            <Heart className={`h-4 w-4 ${p.favorite ? "fill-accent-green text-accent-green" : ""}`} />
          </button>
        ) : null}
        <RowMenu p={p} onRename={() => setEditing(true)} actions={actions} />
      </div>
    </div>
  );
}

function ProjectListRow({ p, selected, onSelect, actions }: { p: Project; selected: boolean; onSelect: () => void; actions: CardActions }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border bg-card p-2 pr-1.5 transition sm:gap-3 ${selected ? "border-accent-green ring-1 ring-accent-green" : "border-border hover:border-white/25"}`}>
      <span
        role="checkbox"
        aria-checked={selected}
        aria-label="Выделить"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition after:absolute after:-inset-2 after:content-[''] ${selected ? "border-accent-green bg-accent-green text-on-accent" : "border-border text-transparent"}`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      {/* Thumb is a compact 48px square on mobile (48×64 on ≥sm) so the name band
          keeps more width on narrow screens without crushing photo previews. */}
      <button type="button" onClick={() => actions.openProject(p)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left sm:gap-3">
        <span className="block h-12 w-12 shrink-0 sm:w-16">
          <Preview p={p} rounded="h-full w-full rounded-md" />
        </span>
        <span className="min-w-0 flex-1">
          <EditableName p={p} editing={editing} setEditing={setEditing} onRename={actions.rename} />
          <span className="flex items-center gap-1.5 truncate ds-caption">
            <span>{p.meta}</span>
            <span>·</span>
            <span>{formatRelative(p.updatedAt)}</span>
          </span>
        </span>
      </button>
      {SHOW_FAVORITES ? (
        <button type="button" onClick={() => actions.toggleFav(p)} aria-label={p.favorite ? "Убрать из избранного" : "В избранное"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground max-sm:h-11 max-sm:w-11">
          <Heart className={`h-4 w-4 ${p.favorite ? "fill-accent-green text-accent-green" : ""}`} />
        </button>
      ) : null}
      <RowMenu p={p} onRename={() => setEditing(true)} actions={actions} />
    </div>
  );
}

function EditableName({ p, editing, setEditing, onRename }: { p: Project; editing: boolean; setEditing: (v: boolean) => void; onRename: (id: string, name: string) => void }) {
  const [draft, setDraft] = useState(p.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(p.name); requestAnimationFrame(() => ref.current?.select()); } }, [editing, p.name]);
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => { onRename(p.id, draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onRename(p.id, draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-md border border-accent-green/60 bg-elevated px-1.5 py-0.5 text-sm font-medium outline-none"
      />
    );
  }
  return <p className="truncate text-sm font-medium leading-tight">{p.name}</p>;
}

// ⋯ menu — desktop anchored popover + mobile bottom sheet, one open state.
function RowMenu({ p, onRename, actions }: { p: Project; onRename: () => void; actions: CardActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const inTrash = p.deleted;
  const items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = inTrash
    ? [
        { label: "Восстановить", icon: <RotateCcw className="h-4 w-4" />, onClick: () => actions.restore(p) },
        { label: "Удалить навсегда", icon: <Trash2 className="h-4 w-4" />, onClick: () => { if (confirm("Удалить проект навсегда?")) actions.hardDelete(p); }, danger: true },
      ]
    : [
        { label: "Открыть", icon: <ArrowLeft className="h-4 w-4 rotate-180" />, onClick: () => actions.openProject(p) },
        // Read-only card detail exists only for banners today; it is also the
        // sole entry point into the otherwise-orphaned /history/[cardId] page.
        ...(p.real && p.type === "banner"
          ? [{ label: "Открыть карточку", icon: <LayoutGrid className="h-4 w-4" />, onClick: () => actions.openCard(p) }]
          : []),
        { label: "Дублировать", icon: <Copy className="h-4 w-4" />, onClick: () => actions.duplicate(p) },
        { label: "Переименовать", icon: <Pencil className="h-4 w-4" />, onClick: onRename },
        { label: "Скачать", icon: <Download className="h-4 w-4" />, onClick: () => actions.download(p) },
        { label: "Удалить", icon: <Trash2 className="h-4 w-4" />, onClick: () => actions.trash(p), danger: true },
      ];

  const run = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Действия"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:h-11 max-sm:w-11"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 hidden w-52 rounded-xl border border-border bg-popover p-1.5 shadow-xl sm:block">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => run(it.onClick)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/5 ${it.danger ? "text-[color:var(--status-error)]" : "text-foreground"}`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
      <BottomSheet open={open} onClose={() => setOpen(false)} title={p.name}>
        <div className="flex flex-col">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => run(it.onClick)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-base transition hover:bg-white/5 ${it.danger ? "text-[color:var(--status-error)]" : "text-foreground"}`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function ProjectsEmpty({ bucket, filtered }: { bucket: "active" | "trash"; filtered: boolean }) {
  if (bucket === "trash") {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <Trash2 className="h-9 w-9 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Корзина пуста</p>
      </div>
    );
  }
  if (filtered) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <Search className="h-9 w-9 text-muted-foreground/40" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-sm font-medium">Ничего не найдено</p>
          <p className="ds-caption">Измените поиск или фильтры</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
      {/* Violet anticipation accent, consistent with the generators' empty
          states; the lime lives on the CTA below. */}
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--violet-tint)] text-brand-violet shadow-glow-violet">
        <LayoutGrid className="h-7 w-7" />
      </span>
      <div className="space-y-1">
        <p className="ds-h4">Здесь появятся ваши проекты</p>
        <p className="ds-caption">Всё, что вы создадите в любом из разделов, сохранится тут.</p>
      </div>
      <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]">
        <Plus className="h-4 w-4" /> Создать первый проект
      </Link>
    </div>
  );
}

// ── Tab 2: credits ────────────────────────────────────────────────────────────
function CreditsTab() {
  const router = useRouter();
  const [balance, setBalance] = useState<number>(8);
  const [filter, setFilter] = useState<"all" | "spend" | "topup">("all");
  const txs = useMemo(() => getMockCredits(), []);

  useEffect(() => {
    let cancelled = false;
    apiJson<{ profile?: { credits_balance?: number | string } }>("/api/me")
      .then((r) => { if (!cancelled) { const b = Number(r?.profile?.credits_balance); if (!Number.isNaN(b) && b > 0) setBalance(b); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();
  const spent30 = txs.filter((t) => t.kind === "spend" && now - +new Date(t.at) <= 30 * 24 * 3600_000).reduce((s, t) => s + t.amount, 0);
  const pct = Math.min(100, Math.round((spent30 / Math.max(1, spent30 + balance)) * 100));
  const rows = filter === "all" ? txs : txs.filter((t) => t.kind === filter);

  return (
    <div>
      {/* Mock notice */}
      <p className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--status-premium)]/30 bg-[color:var(--status-premium)]/10 px-2.5 py-1.5 ds-caption text-[color:var(--status-premium)]">
        Демо-данные — лог использования кредитов появится после подключения биллинга.
      </p>

      {/* Summary */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ds-caption">Текущий остаток</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${Number(balance) <= 20 ? "text-[color:var(--status-premium)]" : "text-accent-green"}`}
            >
              {balance} <span className="text-base font-normal text-muted-foreground">кредитов</span>
            </p>
          </div>
          <Link href="/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]">
            <Plus className="h-4 w-4" /> Пополнить
          </Link>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Потрачено за 30 дней</span>
            <span className="font-medium tabular-nums">{spent30} кредитов</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent-green" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-5 flex items-center gap-1.5">
        {(
          [
            ["all", "Все"],
            ["spend", "Списания"],
            ["topup", "Пополнения"],
          ] as ["all" | "spend" | "topup", string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${filter === id ? "bg-accent-green text-on-accent" : "border border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border py-16 text-center ds-caption">
          Здесь появится история использования кредитов
        </div>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {rows.map((t) => (
            <CreditRow key={t.id} t={t} onProject={t.projectId ? () => router.push("/history") : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreditRow({ t, onProject }: { t: CreditTx; onProject?: () => void }) {
  const isTopup = t.kind === "topup";
  const SecIcon = t.section ? SECTION_BY_ID.get(t.section)!.icon : null;
  return (
    <div className="flex items-center gap-3 bg-card px-3 py-3 sm:px-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isTopup ? "bg-accent-green/15 text-accent-green" : "bg-white/5 text-muted-foreground"}`}>
        {isTopup ? <Plus className="h-4 w-4" /> : SecIcon ? <SecIcon className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.label}</p>
        <p className="ds-caption">
          {formatDateTime(t.at)}
          {t.projectId && onProject ? (
            <>
              {" · "}
              <button type="button" onClick={onProject} className="text-accent-green underline-offset-2 hover:underline">
                открыть проект
              </button>
            </>
          ) : null}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${isTopup ? "text-accent-green" : "text-foreground"}`}>
        {isTopup ? "+" : "−"}
        {t.amount}
      </span>
    </div>
  );
}

// ── small controls ────────────────────────────────────────────────────────────
function TypePills({ type, onType, wrap }: { type: ProjectType | "all"; onType: (v: ProjectType | "all") => void; wrap?: boolean }) {
  const base = "min-h-9 rounded-lg px-3 text-sm font-medium transition";
  return (
    <div className={`flex items-center gap-1.5 ${wrap ? "flex-wrap" : ""}`}>
      <button type="button" onClick={() => onType("all")} className={`${base} ${type === "all" ? "bg-accent-green text-on-accent" : "border border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
        Все
      </button>
      {TYPES.map((t) => {
        const Icon = SECTION_BY_ID.get(t)!.icon;
        const active = type === t;
        return (
          <button key={t} type="button" onClick={() => onType(t)} className={`${base} inline-flex items-center gap-1.5 ${active ? "bg-accent-green text-on-accent" : "border border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
            <Icon className="h-3.5 w-3.5" />
            {TYPE_PLURAL[t]}
          </button>
        );
      })}
    </div>
  );
}

function SortSelect({ sort, onSort, full }: { sort: SortKey; onSort: (v: SortKey) => void; full?: boolean }) {
  return (
    <div className={`relative ${full ? "w-full" : ""}`}>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        aria-label="Сортировка"
        className={`h-11 appearance-none rounded-lg border border-border bg-elevated pl-3 pr-9 text-sm outline-none transition focus:border-accent-green ${full ? "w-full" : ""}`}
      >
        <option value="new">Сначала новые</option>
        <option value="old">Сначала старые</option>
        <option value="name">По названию</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function ViewToggle({ view, onView }: { view: ViewMode; onView: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {(
        [
          ["grid", LayoutGrid],
          ["list", ListIcon],
        ] as [ViewMode, typeof LayoutGrid][]
      ).map(([id, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => onView(id)}
          aria-label={id === "grid" ? "Сетка" : "Список"}
          aria-pressed={view === id}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition ${view === id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function FavToggle({ on, onToggle, full }: { on: boolean; onToggle: () => void; full?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${on ? "border-accent-green/50 bg-accent-green/10 text-accent-green" : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"} ${full ? "w-full" : ""}`}
    >
      <Star className={`h-4 w-4 ${on ? "fill-accent-green" : ""}`} /> Избранное
    </button>
  );
}

function BucketToggle({ bucket, onBucket, full }: { bucket: "active" | "trash"; onBucket: (v: "active" | "trash") => void; full?: boolean }) {
  return (
    <div className={`inline-flex rounded-lg border border-border p-0.5 ${full ? "w-full" : ""}`}>
      {(
        [
          ["active", "Активные"],
          ["trash", "Корзина"],
        ] as ["active" | "trash", string][]
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onBucket(id)}
          className={`min-h-8 rounded-md px-3 text-sm transition ${full ? "flex-1" : ""} ${bucket === id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── bottom sheet (mobile) ─────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <>
      <MobileScrim open={open} onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 sm:hidden ${open ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        {title ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="truncate ds-h4">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}

function SheetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 ds-label">{label}</p>
      {children}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
// Client-only breakpoint check (sm = 640px). Defaults to desktop on SSR/first
// paint; the projects list renders only after a client effect, so no mismatch.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

function mapRealCards(items: unknown[]): Project[] {
  return items.map((raw) => {
    const c = raw as Record<string, unknown>;
    const master = c.master as Record<string, unknown> | null | undefined;
    const w = master?.width as number | undefined;
    const h = master?.height as number | undefined;
    return {
      id: String(c.id ?? ""),
      type: "banner" as ProjectType,
      name: (c.name as string) || "Проект без названия",
      createdAt: (c.created_at as string) || new Date().toISOString(),
      updatedAt: (c.last_activity_at as string) || (c.updated_at as string) || new Date().toISOString(),
      favorite: Boolean(c.is_favorite),
      deleted: Boolean(c.deleted_at),
      thumb: (master?.image_url as string) || null,
      meta: w && h ? `${w}×${h}` : undefined,
      real: true,
    };
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
