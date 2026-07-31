"use client";

import { useEffect } from "react";

// Ported from __root.tsx ErrorComponent. Next.js route-segment error
// boundary: receives { error, reset }. "Try again" calls reset() (re-renders
// the segment) instead of TanStack's router.invalidate().
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="ds-aurora" aria-hidden />
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Страница не загрузилась
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Что-то пошло не так с нашей стороны. Попробуйте обновить страницу или вернуться на главную.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => reset()} className="ds-btn ds-btn-primary min-h-11 px-4">
            Обновить
          </button>
          <a href="/" className="ds-btn ds-btn-secondary min-h-11 px-4">
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}
