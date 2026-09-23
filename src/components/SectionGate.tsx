"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";

import { isSectionEnabled } from "@/lib/mvp";

/**
 * Заглушка «Скоро» для раздела, который ещё не открыт.
 *
 * До этого «Скоро» жило только в навигации: пункт был серым, но сам адрес
 * отвечал всем, кто его наберёт или сохранил в закладках. Для раздела в
 * работе этого мало — недоделанный инструмент лучше не показывать вовсе.
 *
 * Флаг NEXT_PUBLIC_PREVIEW_SECTIONS подставляется во время сборки, поэтому
 * локально с ним в .env.local раздел открыт, а продакшен-сборка без него
 * закрыта — выключать потом нечего и нечему протечь.
 */
export function SectionGate({ id, children }: { id: string; children: React.ReactNode }) {
  if (isSectionEnabled(id)) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
      <Clock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="ds-h1">Скоро</h1>
      <p className="ds-body text-muted-foreground">
        Раздел ещё в работе и пока недоступен. Мы откроем его, когда он будет готов.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-accent-green/50 hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" /> На главную
      </Link>
    </div>
  );
}
