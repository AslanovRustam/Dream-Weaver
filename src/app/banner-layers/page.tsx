"use client";

import { useEffect } from "react";

import { ImageGenApp } from "@/components/ImageGenApp";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export default function BannerLayersPage() {
  useEffect(() => {
    document.title = "Слои — GenGO";
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
        <ImageGenApp resizeMode="layers" />
      </AppShell>
    </>
  );
}
