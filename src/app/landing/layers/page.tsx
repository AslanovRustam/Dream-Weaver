"use client";

// Лендинг из баннера по слоям: живой первый экран из слоёв раздела «Слои», блоки landingKit ниже.
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { LayeredLandingApp } from "@/components/LayeredLandingApp";
import { useAuth } from "@/lib/auth-context";

export default function LandingLayersPage() {
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
        <LayeredLandingApp />
      </AppShell>
    </>
  );
}
