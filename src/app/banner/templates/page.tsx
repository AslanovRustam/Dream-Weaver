"use client";

import { useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { BannerTemplateCatalog } from "@/components/BannerTemplateCatalog";
import { useAuth } from "@/lib/auth-context";

// Entry point of the banner generator: the template catalog. Picking a tile
// routes to the editor (/banner?preset=<id>); the editor's sidebar links back.
export default function BannerTemplatesPage() {
  useEffect(() => {
    document.title = "Шаблоны баннеров — GenGO";
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
        <BannerTemplateCatalog />
      </AppShell>
    </>
  );
}
