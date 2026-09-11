"use client";

import { useEffect } from "react";

import { SettingsApp } from "@/components/SettingsApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  useEffect(() => {
    document.title = "Интеграции — GenGO";
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
        <SettingsApp />
      </AppShell>
    </>
  );
}
