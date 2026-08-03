"use client";

// App-wide confirmation dialog — one branded, themeable modal that replaces the
// native window.confirm() scattered across generators, История and admin. Styled
// exactly like the unsaved-changes modal (one-row buttons, equal width on
// mobile). Imperative API so it drops in where confirm() used to be:
//
//   const confirm = useConfirm();
//   if (await confirm({ title: "…", body: "…", destructive: true })) { … }
//
// Rule of thumb for callers: gate IRREVERSIBLE actions (permanent delete, reset,
// regenerate that discards work) through this; reversible actions (move to trash)
// should just act + toast, no confirm.

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    // If a confirm is somehow already open, resolve it negatively first.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(options);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={opts !== null} onOpenChange={(o) => { if (!o) settle(false); }}>
        <DialogContent hideClose className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6">
          <DialogTitle className="ds-h4">{opts?.title}</DialogTitle>
          {opts?.body ? (
            <p className="mt-2 text-sm text-muted-foreground">{opts.body}</p>
          ) : null}
          {/* One row on every breakpoint — matches the unsaved-changes modal. */}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => settle(false)}
              className="min-h-11 flex-1 whitespace-nowrap rounded-lg border border-[color:var(--border-strong)] px-4 text-sm font-medium text-muted-foreground transition hover:bg-[var(--overlay-hover)] hover:text-foreground sm:flex-none sm:px-5"
            >
              {opts?.cancelLabel ?? "Отмена"}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={
                opts?.destructive
                  ? "min-h-11 flex-1 whitespace-nowrap rounded-lg px-4 text-sm font-semibold text-white transition hover:opacity-90 sm:flex-none sm:px-5"
                  : "min-h-11 flex-1 whitespace-nowrap rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] sm:flex-none sm:px-5"
              }
              style={opts?.destructive ? { backgroundColor: "var(--status-error)" } : undefined}
            >
              {opts?.confirmLabel ?? "Продолжить"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
