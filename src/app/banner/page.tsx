"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ImageGenApp } from "@/components/ImageGenApp";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

export default function BannerPage() {
  useEffect(() => {
    document.title = "Баннер-генератор — Dream Weaver Studio";
  }, []);

  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
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
