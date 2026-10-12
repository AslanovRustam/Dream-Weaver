"use client";

// Каталог плейблов (/playable/templates) — вход в генератор, как
// /banner/templates у баннеров: заголовок «Шаблоны», поиск, плитки «превью +
// название». Все шаблоны — премиум-сцены; плитка открывает редактор
// (/playable?pick=<id>), а его левая колонка ведёт обратно сюда.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { track } from "@/lib/analytics";
import { PLAYABLE_CATALOG, PLAYABLE_CATALOG_BY_ID, PLAYABLE_PICK_KEY, type PlayableCatalogItem } from "@/lib/playableCatalog";

export function PlayableTile({
  item,
  selected,
  onSelect,
  compact,
}: {
  item: PlayableCatalogItem;
  selected: boolean;
  onSelect: () => void;
  /** В колонке редактора — описание в подсказке, плитка плотнее. */
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
      <div className="aspect-[3/4] w-full rounded-md bg-[#0b0d12] bg-cover bg-center" style={{ backgroundImage: `url(${item.preview})` }} />
      <p className="truncate text-xs font-medium">{item.name}</p>
      {compact ? null : <p className="-mt-1 line-clamp-2 ds-caption">{item.description}</p>}
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
  const items = useMemo(
    () => PLAYABLE_CATALOG.filter((i) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    [q],
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
            <h2 className="ds-h4">
              Шаблоны <span className="ml-1 font-normal text-muted-foreground">({PLAYABLE_CATALOG.length})</span>
            </h2>
          </div>
          <div className="px-4 pb-2 pt-2">
            <div className="flex h-12 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green">
              <Search size={16} className="shrink-0 text-foreground/70" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по шаблонам"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/70 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
                <Search className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
                <p className="ds-caption">По запросу «{query.trim()}» шаблонов нет</p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5"
                >
                  Сбросить
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {items.map((item) => (
                  <PlayableTile key={item.id} item={item} selected={item.id === currentId} onSelect={() => pick(item)} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </TooltipProvider>
  );
}
