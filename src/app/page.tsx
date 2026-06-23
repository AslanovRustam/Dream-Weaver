"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ImageGenApp } from "@/components/ImageGenApp";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

export default function Index() {
  useEffect(() => {
    document.title = "Image Generator";
  }, []);

  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Anonymous visitors bounce to /login. After login they always land on /
  // (the generation page), so no need for a redirect hint in the URL.
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
