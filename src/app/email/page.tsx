"use client";

import { useEffect } from "react";

import { EmailGenApp } from "@/components/EmailGenApp";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

export default function EmailPage() {
  useEffect(() => {
    document.title = "Генератор писем — Gen Go";
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
      <EmailGenApp />
    </>
  );
}
