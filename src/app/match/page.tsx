"use client";

import { useEffect } from "react";

import { MatchLandingApp } from "@/components/MatchLandingApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function MatchPage() {
  useEffect(() => {
    document.title = "Матч-прогноз — GenGO";
  }, []);

  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  return (
    <>
      <AppHeader />
      <AppShell>
        <MatchLandingApp />
      </AppShell>
    </>
  );
}
