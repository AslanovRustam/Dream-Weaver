"use client";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { VideoGenApp } from "@/components/VideoGenApp";
import { useAuth } from "@/lib/auth-context";

export default function VideoPage() {
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
        <VideoGenApp />
      </AppShell>
    </>
  );
}
