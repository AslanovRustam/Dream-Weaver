"use client";

import { useEffect } from "react";

import { AdsApp } from "@/components/AdsApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { SectionGate } from "@/components/SectionGate";
import { useAuth } from "@/lib/auth-context";

export default function AdsPage() {
  useEffect(() => {
    document.title = "Рекламные кабинеты — GenGO";
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
        <SectionGate id="ads">
          <AdsApp />
        </SectionGate>
      </AppShell>
    </>
  );
}
