"use client";

// Header control for the ACTIVE workspace (company/client). Deliberately a
// separate, self-standing element from the section switcher (Баннер/Лендинг/…):
// it lives in the right cluster (Canva's "account corner"), carries the VIOLET
// accent where the section switcher carries lime, and is logo-led (company
// avatar) rather than tool-icon-led — so the two never read as the same thing.

import Link from "next/link";
import { Check, ChevronDown, Settings } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace-context";
import type { Workspace } from "@/lib/workspaces";

// Company logo, or a violet initial chip when none is set.
export function WorkspaceAvatar({ ws, size = 22 }: { ws: Workspace | null; size?: number }) {
  const style = { width: size, height: size } as const;
  if (ws?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={ws.logo}
        alt=""
        className="shrink-0 rounded-md object-cover"
        style={style}
      />
    );
  }
  const letter = (ws?.name?.trim()?.[0] || "?").toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ ...style, backgroundImage: "var(--grad-violet)", fontSize: Math.round(size * 0.5) }}
    >
      {letter}
    </span>
  );
}

export function WorkspaceSwitcher({ onSelect }: { onSelect: (id: string) => void }) {
  const t = useT();
  const { workspaces, activeId, active, ready } = useWorkspace();

  // Hidden until the store has loaded (and for guests, who have no spaces).
  if (!ready || workspaces.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("workspace.switch")}
          title={`${t("workspace.switch")}: ${active?.name ?? ""}`}
          className="group inline-flex min-h-9 max-w-[190px] shrink-0 items-center gap-2 rounded-lg border border-[color:var(--brand-violet)]/30 bg-[color:var(--brand-violet)]/10 px-2 py-1.5 transition hover:border-[color:var(--brand-violet)]/55 hover:bg-[color:var(--brand-violet)]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-violet)]/40 max-sm:min-h-11"
        >
          <WorkspaceAvatar ws={active} size={20} />
          <span className="hidden max-w-[110px] truncate text-sm font-semibold text-foreground sm:inline">
            {active?.name}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[color:var(--violet-400)] transition group-hover:text-[color:var(--brand-violet)] max-sm:h-5 max-sm:w-5"
            strokeWidth={2.5}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl border-border bg-popover p-1.5 text-foreground max-sm:w-[calc(100vw-2rem)]"
      >
        <p className="px-2.5 pb-1 pt-1 ds-overline">{t("workspace.all")}</p>
        <div className="max-h-64 overflow-y-auto">
          {workspaces.map((w) => {
            const isActive = w.id === activeId;
            return (
              <DropdownMenuItem
                key={w.id}
                onClick={() => onSelect(w.id)}
                className={`justify-between gap-2.5 rounded-lg px-2 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base ${
                  isActive ? "bg-white/5" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <WorkspaceAvatar ws={w} size={24} />
                  <span className="min-w-0 truncate">{w.name}</span>
                </span>
                {isActive ? (
                  <Check className="h-4 w-4 shrink-0 text-[color:var(--brand-violet)]" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          asChild
          className="rounded-lg px-2 py-2 text-sm text-muted-foreground focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
        >
          <Link href="/account#workspaces" className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/5">
              <Settings className="h-4 w-4" />
            </span>
            {t("workspace.manage")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
