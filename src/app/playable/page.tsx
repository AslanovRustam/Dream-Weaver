"use client";

import { AppHeader } from "@/components/AppHeader";
import { PlayableGenApp } from "@/components/PlayableGenApp";
import { useAuth } from "@/lib/auth-context";

export default function PlayablePage() {
  // Public for guests — see components/AuthGate.
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
      <PlayableGenApp />
    </>
  );
}
