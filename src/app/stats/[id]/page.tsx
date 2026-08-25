"use client";

import { useEffect } from "react";

import { CampaignDetail } from "@/components/CampaignDetail";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function CampaignPage() {
  useEffect(() => {
    document.title = "Кампания — Gen Go";
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
        <CampaignDetail />
      </AppShell>
    </>
  );
}
