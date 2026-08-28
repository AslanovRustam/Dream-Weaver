"use client";

import { useEffect } from "react";

import { SlotLandingApp } from "@/components/SlotLandingApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function SlotPage() {
  useEffect(() => {
    document.title = "Слот-машина — Gen Go";
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
        <SlotLandingApp />
      </AppShell>
    </>
  );
}
