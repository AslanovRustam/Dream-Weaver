"use client";

import { X } from "lucide-react";

import { MobileScrim } from "@/components/MobileScrim";

// Mobile bottom sheet (slides up from the bottom edge, ≤sm only). Extracted from
// История so the same sheet backs every mobile overflow menu / filter panel —
// one grabber, one optional title row, one animation.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <MobileScrim open={open} onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 sm:hidden ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        {title ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="truncate ds-h4">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}
