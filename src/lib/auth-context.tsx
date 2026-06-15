// React context for the current Supabase session.
// Subscribes to onAuthStateChange so any login/logout in any tab updates UI.
//
// Exposed via useAuth(): { session, user, loading, isAuthenticated, signOut }.
// Profile/balance live in a sibling hook (useProfile) that hits /api/me.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getBrowserClient } from "./supabase/browser";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supa = getBrowserClient();
    let mounted = true;

    // 1. Read whatever is in storage already (sync-ish via promise).
    supa.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    // 2. Subscribe — Supabase auto-refreshes tokens and emits SIGNED_IN/OUT.
    const { data: sub } = supa.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: !!session,
      signOut: async () => {
        await getBrowserClient().auth.signOut();
      },
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
