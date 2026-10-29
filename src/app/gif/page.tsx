"use client";

import { useEffect } from "react";

import { GifGenApp } from "@/components/GifGenApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { SectionGate } from "@/components/SectionGate";
import { useAuth } from "@/lib/auth-context";

export default function GifPage() {
  useEffect(() => {
    document.title = "GIF-генератор — GenGO";
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
        <SectionGate id="gif">
          <GifGenApp />
        </SectionGate>
      </AppShell>
    </>
  );
}
