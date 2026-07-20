"use client";

// /history — two-tab История ("Мои проекты" + "Использование кредитов").
// Auth guard + header live here; all section logic is in <HistoryApp />.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { HistoryApp } from "@/components/HistoryApp";
import { useAuth } from "@/lib/auth-context";

export default function HistoryPage() {
  useEffect(() => {
    document.title = "История — Dream Weaver Studio";
  }, []);

  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
        <p className="text-sm">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <HistoryApp />
    </div>
  );
}
