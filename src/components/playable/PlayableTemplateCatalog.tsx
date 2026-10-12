"use client";

// Каталог плейблов (/playable/templates) — вход в генератор плейблов, как
// /banner/templates у баннеров: заголовок «Шаблоны», поиск с фильтром по
// категории, категории-аккордеоны, плитки «превью + название». Плитка
// открывает редактор с этим шаблоном (/playable?pick=<id>); левая колонка
// редактора переключает шаблоны и ведёт обратно сюда.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";

import { MobileScrim } from "@/components/MobileScrim";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { track } from "@/lib/analytics";
import {
  PLAYABLE_CATALOG,
  PLAYABLE_CATALOG_BY_ID,
  PLAYABLE_CATEGORIES,
  PLAYABLE_PICK_KEY,
  type PlayableCatalogItem,
} from "@/lib/playableCatalog";

const CATEGORY_OPTIONS = [{ id: "all", label: "Все категории" }, ...PLAYABLE_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))];

export function PlayableTile({
  item,
  selected,
  onSelect,
  compact,
}: {
  item: PlayableCatalogItem;
  selected: boolean;
  onSelect: () => void;
  /** В колонке редактора — без подсказки-тултипа, плотнее. */
  compact?: boolean;
}) {
  const tile = (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border p-1.5 text-left transition ${
        selected ? "border-accent-green shadow-[0_0_30px_rgba(198,255,61,0.16)]" : "border-border hover:bg-[var(--bg-surface-hover)]"
      }`}
    >
      <div
        className="aspect-[3/4] w-full rounded-md bg-[#0b0d12] bg-cover bg-center"
        style={{ backgroundImage: `url(${item.preview})` }}
      />
      <p className="truncate text-xs font-medium">{item.name}</p>
      {compact ? null : <p className="-mt-1 line-clamp-2 ds-caption">{item.description}</p>}
      {item.isNew && !selected ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent-green px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-on-accent">
          Премиум
        </span>
      ) : null}
      {selected ? (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-green p-0.5 text-on-accent">
          <Check size={10} />
        </span>
      ) : null}
    </button>
  );
  if (!compact) return tile;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] text-left">
        <p className="font-medium">{item.name}</p>
        <p className="mt-0.5 text-muted-foreground">{item.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function PlayableTemplateCatalog() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PLAYABLE_CATEGORIES.map((c) => [c.id, true])),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PLAYABLE_PICK_KEY);
      if (stored && PLAYABLE_CATALOG_BY_ID.has(stored)) setCurrentId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filterActive = categoryFilter !== "all";
  const appliedLabel = CATEGORY_OPTIONS.find((o) => o.id === categoryFilter)?.label ?? "";

  const closeFilter = () => {
    setFilterOpen(false);
    setCatMenuOpen(false);
  };
  const clearFilter = () => {
    setCategoryFilter("all");
    closeFilter();
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
      PLAYABLE_CATEGORIES.filter((cat) => categoryFilter === "all" || cat.id === categoryFilter)
        .map((cat) => ({
          ...cat,
          items: PLAYABLE_CATALOG.filter((i) => i.category === cat.id).filter(
            (i) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
          ),
        }))
        .filter((cat) => cat.items.length > 0),
    [q, categoryFilter],
  );

  const pick = (item: PlayableCatalogItem) => {
    track("template_selected", { preset: item.id, section: "playable" });
    try {
      window.localStorage.setItem(PLAYABLE_PICK_KEY, item.id);
    } catch {
      /* ignore */
    }
    router.push(`/playable?pick=${encodeURIComponent(item.id)}`);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex w-full flex-col bg-background text-foreground lg:h-[calc(100vh-4rem-1px)] lg:p-3">
        <h1 className="sr-only">Шаблоны плейблов</h1>
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
                onClick={() => {
                  setFilterOpen((o) => !o);
                  setCatMenuOpen(false);
                }}
                aria-label="Фильтр"
                aria-expanded={filterOpen}
                className={`relative -mr-1 flex shrink-0 items-center justify-center rounded-md p-1 transition after:absolute after:-inset-2.5 after:content-[''] ${
                  filterActive || filterOpen ? "text-accent-green" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                <Filter size={16} />
                {filterActive && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />}
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
                <button type="button" onClick={clearFilter} className="text-xs text-muted-foreground transition hover:text-foreground">
                  Очистить
                </button>
              </div>
            )}

            <MobileScrim open={filterOpen} onClose={closeFilter} />
            {filterOpen && (
              <div className="absolute left-4 right-4 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-3 text-foreground shadow-xl sm:left-auto sm:w-72">
                <p className="mb-2 ds-h4">Категория</p>
                <button
                  type="button"
                  onClick={() => setCatMenuOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
                >
                  <span>{CATEGORY_OPTIONS.find((o) => o.id === categoryFilter)?.label}</span>
                  <ChevronDown size={16} className={`text-muted-foreground transition ${catMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {catMenuOpen && (
                  <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                    {CATEGORY_OPTIONS.map((opt) => {
                      const active = categoryFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setCategoryFilter(opt.id);
                            closeFilter();
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                            active ? "bg-accent-green/15 text-accent-green" : "text-foreground hover:bg-white/10"
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
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {groups.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
                <Search className="h-7 w-7 text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
                  <p className="ds-caption">{q ? `По запросу «${query.trim()}» шаблонов нет` : "В этой категории пока нет шаблонов"}</p>
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
                  <div key={cat.id} className="overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)]">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      aria-expanded={Boolean(isExpanded)}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <span className="flex-1 truncate text-sm font-semibold">
                        {cat.label}
                        <span className="ml-1.5 font-normal text-muted-foreground">({cat.items.length})</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-border p-2.5">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                          {cat.items.map((item) => (
                            <PlayableTile key={item.id} item={item} selected={item.id === currentId} onSelect={() => pick(item)} />
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
