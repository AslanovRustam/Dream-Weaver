"use client";

// Shared overflow ("⋯") menu for list rows. One pattern everywhere:
//   • desktop → Radix DropdownMenu (auto-flips / stays on-screen near edges)
//   • mobile  → bottom sheet with large 48px rows + a title
// Replaces История's bespoke popover (which didn't flip near the viewport edge)
// and unifies it with the Workspace list menu. Callers pass a plain items array.

import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useState } from "react";

export type RowAction = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

const TRIGGER_CLS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:h-11 max-sm:w-11";

export function RowActionMenu({
  items,
  title,
  ariaLabel = "Действия",
}: {
  items: RowAction[];
  title?: string;
  ariaLabel?: string;
}) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setSheetOpen(true);
          }}
          className={TRIGGER_CLS}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={title}>
          <div className="flex flex-col">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setSheetOpen(false);
                  it.onClick();
                }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-base transition hover:bg-white/5 disabled:opacity-40 ${
                  it.danger ? "text-[color:var(--status-error)]" : "text-foreground"
                }`}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          className={TRIGGER_CLS}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-52 rounded-xl border-border bg-popover p-1.5 text-foreground"
      >
        {items.map((it) => (
          <DropdownMenuItem
            key={it.label}
            disabled={it.disabled}
            onClick={(e) => {
              e.stopPropagation();
              it.onClick();
            }}
            className={`gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
              it.danger
                ? "text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)]"
                : "focus:bg-white/10 focus:text-foreground"
            }`}
          >
            {it.icon}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
