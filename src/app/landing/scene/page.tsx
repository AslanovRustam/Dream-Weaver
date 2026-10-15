"use client";

// Лендинг на премиум-сцене: сцена плейбла первым экраном, блоки landingKit под ней.
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { PlayableApp } from "@/components/PlayableApp";
import { useAuth } from "@/lib/auth-context";

export default function LandingScenePage() {
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
        <PlayableApp mode="landing" />
      </AppShell>
    </>
  );
}
