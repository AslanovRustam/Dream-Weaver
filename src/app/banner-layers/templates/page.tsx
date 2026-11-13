"use client";

import { useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { BannerTemplateCatalog } from "@/components/BannerTemplateCatalog";
import { useAuth } from "@/lib/auth-context";

// Вход в «Слои»: тот же каталог шаблонов, выбор открывает /banner-layers.
export default function LayersTemplatesPage() {
  useEffect(() => {
    document.title = "Слои · Шаблоны — GenGO";
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
        <BannerTemplateCatalog editorRoute="/banner-layers" />
      </AppShell>
    </>
  );
}
