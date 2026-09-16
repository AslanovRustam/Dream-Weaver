"use client";

// Full-page banner template catalog (/banner/templates) — the entry point of
// the banner generator. Same look as the landing generator's template panel
// (LandingTemplateSidebar): "Шаблоны" header, search box with a funnel
// category filter, accordion categories, preview+name tiles. This is the ONLY
// place with template search + filtering; the in-editor PresetSidebar just
// switches between templates and links back here.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";

import { MobileScrim } from "@/components/MobileScrim";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORIES, PRESETS, type Preset } from "@/components/PresetSidebar";

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

const CATEGORY_OPTIONS = [
  { id: "all", label: "Все категории" },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

function CatalogTile({
  preset,
  selected,
  onSelect,
}: {
  preset: Preset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={`group relative flex flex-col gap-1.5 overflow-hidden rounded-lg border p-1.5 text-left transition ${
            selected
              ? "border-accent-green shadow-[0_0_30px_rgba(198,255,61,0.16)]"
              : "border-border hover:bg-[var(--bg-surface-hover)]"
          }`}
        >
          <div
            className="aspect-[4/3] w-full rounded-md bg-cover bg-center"
            style={
              preset.preview
                ? { backgroundImage: `url(${preset.preview})`, backgroundColor: "#0b0d12" }
                : { background: preset.gradient }
            }
          />
          <p className="truncate text-xs font-medium">{preset.name}</p>
          {preset.isNew && !selected && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-accent-green px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-on-accent">
              Новое
            </span>
          )}
          {selected && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-green p-0.5 text-on-accent">
              <Check size={10} />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-left">
        <p className="font-medium">{preset.name}</p>
        <p className="mt-0.5 text-muted-foreground">{preset.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function BannerTemplateCatalog() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.id, true])),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draftCategory, setDraftCategory] = useState("all");
  // The template the editor is currently on (persisted by ImageGenApp) —
  // shown as the selected tile, like the landing panel marks its pick.
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dw_preset");
      if (stored && PRESET_BY_ID.has(stored)) setCurrentId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filterActive = categoryFilter !== "all";
  const draftLabel =
    CATEGORY_OPTIONS.find((o) => o.id === draftCategory)?.label ?? "Все категории";
  const appliedLabel = CATEGORY_OPTIONS.find((o) => o.id === categoryFilter)?.label ?? "";

  const closeFilter = () => {
    setFilterOpen(false);
    setCatMenuOpen(false);
  };
  const clearFilter = () => {
    setCategoryFilter("all");
    setDraftCategory("all");
    closeFilter();
  };
  const openFilter = () => {
    setDraftCategory(categoryFilter);
    setFilterOpen((o) => !o);
    setCatMenuOpen(false);
  };

  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) closeFilter();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterOpen]);

  const groups = useMemo(
    () =>
      CATEGORIES.filter((cat) => categoryFilter === "all" || cat.id === categoryFilter)
        .map((cat) => ({
          ...cat,
          presets: cat.presetIds
            .map((id) => PRESET_BY_ID.get(id))
            .filter((p): p is Preset => Boolean(p))
            .filter(
              (p) =>
                !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
            ),
        }))
        .filter((cat) => cat.presets.length > 0),
    [q, categoryFilter],
  );

  const pick = (p: Preset) => {
    try {
      window.localStorage.setItem("dw_preset", p.id);
    } catch {
      /* ignore */
    }
    router.push(`/banner?preset=${encodeURIComponent(p.id)}`);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex w-full flex-col bg-background text-foreground lg:h-[calc(100vh-4rem-1px)] lg:p-3">
        <h1 className="sr-only">Шаблоны баннеров</h1>
        <aside className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-border bg-panel lg:rounded-2xl lg:border">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="ds-h4">Шаблоны</h2>
          </div>
          <div ref={filterRef} className="relative px-4 pb-2 pt-2">
            <div className="flex h-12 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green">
              <Search size={16} className="shrink-0 text-foreground/70" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по шаблонам"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/70 focus:outline-none"
              />
              <button
                type="button"
                onClick={openFilter}
                aria-label="Фильтр"
                aria-expanded={filterOpen}
                className={`relative -mr-1 flex shrink-0 items-center justify-center rounded-md p-1 transition after:absolute after:-inset-2.5 after:content-[''] ${
                  filterActive || filterOpen
                    ? "text-accent-green"
                    : "text-foreground/70 hover:text-foreground"
                }`}
              >
                <Filter size={16} />
                {filterActive && (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
                )}
              </button>
            </div>

            {filterActive && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={clearFilter}
                  className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-foreground transition hover:bg-white/10"
                >
                  {appliedLabel}
                  <X size={12} className="text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={clearFilter}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Очистить
                </button>
              </div>
            )}

            <MobileScrim open={filterOpen} onClose={closeFilter} />
            {filterOpen && (
              <div className="absolute left-4 right-4 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-3 text-foreground shadow-xl sm:left-auto sm:w-72">
                <p className="mb-2 ds-h4">Категория</p>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCatMenuOpen((o) => !o)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
                  >
                    <span>{draftLabel}</span>
                    <ChevronDown
                      size={16}
                      className={`text-muted-foreground transition ${catMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {catMenuOpen && (
                    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                      {CATEGORY_OPTIONS.map((opt) => {
                        const active = draftCategory === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setDraftCategory(opt.id);
                              setCategoryFilter(opt.id);
                              closeFilter();
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                              active
                                ? "bg-accent-green/15 text-accent-green"
                                : "text-foreground hover:bg-white/10"
                            }`}
                          >
                            {opt.label}
                            {active && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {groups.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
                <Search className="h-7 w-7 text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
                  <p className="ds-caption">
                    {q
                      ? `По запросу «${query.trim()}» шаблонов нет`
                      : "В этой категории пока нет шаблонов"}
                  </p>
                </div>
                {(searching || filterActive) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      clearFilter();
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-3">
              {groups.map((cat) => {
                const isExpanded = searching || expanded[cat.id];
                return (
                  <div
                    key={cat.id}
                    className="overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                      }
                      aria-expanded={Boolean(isExpanded)}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <span className="flex-1 truncate text-sm font-semibold">
                        {cat.label}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          ({cat.presets.length})
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-border p-2.5">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                          {cat.presets.map((p) => (
                            <CatalogTile
                              key={p.id}
                              preset={p}
                              selected={p.id === currentId}
                              onSelect={() => pick(p)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </TooltipProvider>
  );
}
