"use client";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { SectionGate } from "@/components/SectionGate";
import { PlayableApp } from "@/components/PlayableApp";
import { useAuth } from "@/lib/auth-context";

export default function PlayablePage() {
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
        <SectionGate id="playable">
          <PlayableApp />
        </SectionGate>
      </AppShell>
    </>
  );
}
