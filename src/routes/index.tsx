import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ImageGenApp } from "@/components/ImageGenApp";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Image Generator" },
      {
        name: "description",
        content: "Generate AI images with presets, prompts, and aspect ratios.",
      },
    ],
  }),
});

function Index() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  // Anonymous visitors bounce to /login. After login they always land on /
  // (the generation page), so no need for a redirect hint in the URL.
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [loading, isAuthenticated, navigate]);

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
