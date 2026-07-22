"use client";

import { useEffect } from "react";

import { ImageGenApp } from "@/components/ImageGenApp";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

export default function BannerPage() {
  useEffect(() => {
    document.title = "Баннер-генератор — Dream Weaver Studio";
  }, []);

  // Public for guests — the whole configuration UI is browsable without an
  // account; the gate fires only on "Сгенерировать" (see components/AuthGate).
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
      <ImageGenApp />
    </>
  );
}
