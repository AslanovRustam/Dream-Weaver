"use client";

import { useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { PlayableTemplateCatalog } from "@/components/playable/PlayableTemplateCatalog";
import { useAuth } from "@/lib/auth-context";

// Вход в генератор плейблов — каталог шаблонов, как /banner/templates.
// Плитка открывает редактор (/playable?pick=<id>), а его левая колонка ведёт обратно.
export default function PlayableTemplatesPage() {
  useEffect(() => {
    document.title = "Шаблоны плейблов — GenGO";
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
        <PlayableTemplateCatalog />
      </AppShell>
    </>
  );
}
