"use client";

// Кампания: один бриф — лендинг, плейбл, письмо и баннер в одном стиле.
import { useEffect } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { CampaignApp } from "@/components/CampaignApp";
import { useAuth } from "@/lib/auth-context";

export default function CampaignPage() {
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
        <CampaignApp />
      </AppShell>
    </>
  );
}
