"use client";

import { useEffect } from "react";

import { AdsApp } from "@/components/AdsApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function AdsPage() {
  useEffect(() => {
    document.title = "Рекламные кабинеты — Gen Go";
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
        <AdsApp />
      </AppShell>
    </>
  );
}
