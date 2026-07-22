"use client";

// Product-facing roles for UI gating: guest / user / admin.
//
// This is a VIEW over the existing RBAC (lib/rbac.ts), NOT a replacement:
//   guest = no session · user = role "user" · admin = any staff role.
// Server-side authorisation still comes from rbac.ts capabilities — this
// module only decides what the UI offers, never what the API allows.
//
// Because the local dev build has no backend (every /api/* call 401s), a
// dev-only override lets all three scenarios be exercised without one. It is
// gated behind NEXT_PUBLIC_DEV_AUTH_BYPASS so it can never leak to production.
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";

export type AppRole = "guest" | "user" | "admin";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
const KEY = "dw:devRole";
const listeners = new Set<() => void>();

function readOverride(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "guest" || v === "user" || v === "admin" ? v : null;
  } catch {
    return null; // storage blocked — behave as if unset
  }
}

/** Dev-only: force a role so guest/user/admin can be previewed without a backend. */
export function setDevRole(role: AppRole | null) {
  try {
    if (role) window.localStorage.setItem(KEY, role);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — nothing to persist */
  }
  listeners.forEach((l) => l());
}

export function devRoleAvailable() {
  return DEV_BYPASS;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDevRole(): AppRole | null {
  return useSyncExternalStore(subscribe, readOverride, () => null);
}

export type AppRoleState = {
  role: AppRole;
  isGuest: boolean;
  isAdmin: boolean;
  /** True while we still don't know whether an authed user is staff. */
  loading: boolean;
};

export function useAppRole(): AppRoleState {
  const { isAuthenticated, loading } = useAuth();
  const devRole = useDevRole();
  const [staff, setStaff] = useState(false);
  const [checked, setChecked] = useState(false);
  // useSyncExternalStore serves the SERVER snapshot (null) on the hydrating
  // render, so the dev override is not visible for one tick. Without this flag
  // a redirect guard would fire against a momentarily-wrong role.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (devRole || loading || !isAuthenticated) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    apiJson<{ profile?: { role?: string }; is_super_admin?: boolean }>("/api/me")
      .then((r) => {
        if (cancelled) return;
        const role = r?.profile?.role;
        // Any non-"user" staff role (support/moderator/admin/superadmin) opens
        // the admin entry point; the panel itself re-checks capabilities.
        setStaff(Boolean(r?.is_super_admin) || (typeof role === "string" && role !== "user"));
      })
      .catch(() => {
        /* unreachable backend → stay a plain user */
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [devRole, loading, isAuthenticated]);

  if (DEV_BYPASS && !mounted) {
    return { role: "user", isGuest: false, isAdmin: false, loading: true };
  }

  if (DEV_BYPASS && devRole) {
    return {
      role: devRole,
      isGuest: devRole === "guest",
      isAdmin: devRole === "admin",
      loading: false,
    };
  }

  const role: AppRole = !isAuthenticated ? "guest" : staff ? "admin" : "user";
  return {
    role,
    isGuest: role === "guest",
    isAdmin: role === "admin",
    loading: loading || (isAuthenticated && !checked),
  };
}
