"use client";

// Header QUICK-SWITCHER for the active workspace — icon only (briefcase), built
// on the same pattern as the language switcher: a compact icon trigger opening a
// tidy dropdown. The list shows the user's spaces with a check on the active
// one; picking a space switches it and the dropdown auto-closes (Radix closes on
// select — same as the Hub "Поиск по шаблонам"). NO editing here: full
// management (create / rename / delete) lives in the "Мой Workspace" section
// (avatar menu -> /workspace).

import { Briefcase, Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceAvatar } from "@/components/WorkspaceAvatar";

export function WorkspaceSwitcher({ onSelect }: { onSelect: (id: string) => void }) {
  const t = useT();
  const { workspaces, activeId, active, ready } = useWorkspace();

  // Hidden until the store has loaded (and for guests, who have no spaces).
  if (!ready || workspaces.length === 0) return null;

  return (
    <DropdownMenu scrimIntensity="light">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("workspace.switch")}
          title={`${t("workspace.switch")}: ${active?.name ?? ""}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white/5 px-2 py-1.5 text-muted-foreground transition hover:border-white/25 hover:bg-white/10 hover:text-foreground max-sm:min-h-11 max-sm:px-2.5"
        >
          <Briefcase className="h-4 w-4 shrink-0 text-[color:var(--violet-400)]" />
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-xl border-border bg-popover p-1.5 text-foreground max-sm:w-[calc(100vw-2rem)]"
      >
        <p className="px-2.5 pb-1 pt-1 ds-overline">{t("workspace.all")}</p>
        <div className="max-h-72 overflow-y-auto">
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
                  <WorkspaceAvatar ws={w} size={22} />
                  <span className="min-w-0 truncate">{w.name}</span>
                </span>
                {isActive ? (
                  <Check className="h-4 w-4 shrink-0 text-[color:var(--brand-violet)]" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
