"use client";

// Страница сгенерированной кампании: все материалы, скачать, открыть в редакторе.
import { Suspense, useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { CampaignView } from "@/components/CampaignView";
import { useAuth } from "@/lib/auth-context";

export default function CampaignViewPage() {
  useEffect(() => {
    document.title = "Кампания — GenGO";
  }, []);
  const { loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Загрузка…</div>;
  }
  return (
    <>
      <AppHeader />
      <AppShell>
        {/* useSearchParams() — внутри Suspense (требование Next при пререндере). */}
        <Suspense>
          <CampaignView />
        </Suspense>
      </AppShell>
    </>
  );
}
