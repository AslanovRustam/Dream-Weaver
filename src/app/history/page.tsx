"use client";

// /history — two-tab История ("Мои проекты" + "Использование кредитов").
// Auth guard + header live here; all section logic is in <HistoryApp />.
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { GuestWall } from "@/components/AuthGate";
import { HistoryApp } from "@/components/HistoryApp";
import { useAuth } from "@/lib/auth-context";
import { useAppRole } from "@/lib/roles";

export default function HistoryPage() {
  useEffect(() => {
    document.title = "История — Gen Go";
  }, []);

  const { loading } = useAuth();
  // Gate on the product role, not on the raw session: the dev bypass hands out
  // a fake session, so "guest" has to come from lib/roles.
  const { isGuest } = useAppRole();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
        <p className="text-sm">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground">
      <div className="ds-aurora" aria-hidden />
      <AppHeader />
      {isGuest ? (
        <GuestWall
          title="История доступна после регистрации"
          description="Здесь будут ваши проекты и лог использования кредитов."
        />
      ) : (
        <HistoryApp />
      )}
    </div>
  );
}
