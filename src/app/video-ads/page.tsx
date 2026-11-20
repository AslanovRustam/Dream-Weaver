"use client";

import { Suspense } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { SectionGate } from "@/components/SectionGate";
import { VideoAdApp } from "@/components/VideoAdApp";
import { useAuth } from "@/lib/auth-context";

export default function VideoAdsPage() {
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
        <SectionGate id="videoAd">
          <Suspense>
            <VideoAdApp />
          </Suspense>
        </SectionGate>
      </AppShell>
    </>
  );
}
