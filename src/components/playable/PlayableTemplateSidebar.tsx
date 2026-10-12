"use client";

// Левая колонка редактора плейблов — как PresetSidebar у баннеров: «К
// шаблонам» ведёт в полный каталог (там поиск), ниже все сцены, чтобы
// переключаться, не уходя из редактора.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayableTile } from "@/components/playable/PlayableTemplateCatalog";
import { PLAYABLE_CATALOG, PLAYABLE_TEMPLATES_ROUTE } from "@/lib/playableCatalog";

export function PlayableTemplateSidebar({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:min-w-[220px] lg:flex-[2] lg:rounded-2xl lg:border">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="ds-h4">Шаблоны</h2>
        </div>
        <div className="px-4 pb-2 pt-2">
          <Link
            href={PLAYABLE_TEMPLATES_ROUTE}
            className="flex h-12 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition hover:border-accent-green/40 hover:bg-white/5"
          >
            <ArrowLeft size={16} className="shrink-0 text-accent-green" />
            <span className="min-w-0 flex-1 truncate">К шаблонам</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <div className="grid grid-cols-1 gap-2">
            {PLAYABLE_CATALOG.map((item) => (
              <PlayableTile key={item.id} item={item} selected={item.id === value} onSelect={() => onPick(item.id)} compact />
            ))}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
