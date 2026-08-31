"use client";

import { useEffect } from "react";

import { CrashLandingApp } from "@/components/CrashLandingApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function CrashPage() {
  useEffect(() => {
    document.title = "Crash-игра — Gen Go";
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
        <CrashLandingApp />
      </AppShell>
    </>
  );
}
