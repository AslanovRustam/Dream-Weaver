"use client";

// Guest gating. Everything a guest may look at stays reachable; the moment a
// guest tries to DO something that needs an account (generate, save, open the
// history / account), this modal takes over instead of a silent redirect.
//
// Usage:
//   const { requireAuth, isGuest } = useAuthGate();
//   <button onClick={() => requireAuth(startGeneration)}>Сгенерировать</button>
// or, for a whole page, render <GuestWall/> instead of the page body.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Sparkles, UserPlus, X } from "lucide-react";

import { useAppRole } from "@/lib/roles";

type GateValue = {
  isGuest: boolean;
  /** Runs `action` for signed-in users; opens the register modal for guests. */
  requireAuth: (action: () => void) => void;
  /** Opens the register modal directly, with an optional custom explanation. */
  openGate: (reason?: string) => void;
};

const GateContext = createContext<GateValue | null>(null);

const DEFAULT_REASON = "Создавайте креативы, сохраняйте проекты и получайте кредиты.";

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { isGuest } = useAppRole();
  const [reason, setReason] = useState<string | null>(null);

  const openGate = useCallback((r?: string) => setReason(r || DEFAULT_REASON), []);
  const requireAuth = useCallback(
    (action: () => void) => {
      if (isGuest) setReason(DEFAULT_REASON);
      else action();
    },
    [isGuest],
  );

  const value = useMemo<GateValue>(
    () => ({ isGuest, requireAuth, openGate }),
    [isGuest, requireAuth, openGate],
  );

  return (
    <GateContext.Provider value={value}>
      {children}
      {reason !== null ? <GateModal reason={reason} onClose={() => setReason(null)} /> : null}
    </GateContext.Provider>
  );
}

export function useAuthGate(): GateValue {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useAuthGate must be used inside <AuthGateProvider>");
  return ctx;
}

function GateModal({ reason, onClose }: { reason: string; onClose: () => void }) {
  const router = useRouter();
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-popover p-5 text-center shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground max-sm:h-11 max-sm:w-11"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-green/15 text-accent-green">
          <Sparkles className="h-6 w-6" />
        </span>
        <h2 id="gate-title" className="ds-h2 text-lg">
          Зарегистрируйтесь, чтобы продолжить
        </h2>
        <p className="mx-auto mt-1.5 max-w-xs ds-caption">{reason}</p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => go("/login?mode=signup")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            <UserPlus className="h-4 w-4" />
            Зарегистрироваться
          </button>
          <button
            type="button"
            onClick={() => go("/login")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition hover:bg-white/5"
          >
            <LogIn className="h-4 w-4" />
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-page stand-in for sections a guest may not open at all. */
export function GuestWall({
  title = "Раздел доступен после регистрации",
  description = "Здесь хранятся ваши проекты и кредиты — создайте аккаунт, чтобы получить доступ.",
}: {
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-green/15 text-accent-green">
        <Sparkles className="h-7 w-7" />
      </span>
      <h1 className="ds-h1 text-xl">{title}</h1>
      <p className="mt-2 ds-caption">{description}</p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={() => router.push("/login?mode=signup")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-green px-5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
        >
          <UserPlus className="h-4 w-4" />
          Зарегистрироваться
        </button>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-foreground transition hover:bg-white/5"
        >
          <LogIn className="h-4 w-4" />
          Войти
        </button>
      </div>
    </div>
  );
}
