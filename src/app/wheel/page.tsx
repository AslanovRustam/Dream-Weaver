"use client";

import { useEffect } from "react";

import { WheelLandingApp } from "@/components/WheelLandingApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function WheelPage() {
  useEffect(() => {
    document.title = "Колесо фортуны — Gen Go";
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
        <WheelLandingApp />
      </AppShell>
    </>
  );
}
