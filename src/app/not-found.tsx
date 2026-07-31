import Link from "next/link";

// Ported from __root.tsx NotFoundComponent.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="ds-aurora" aria-hidden />
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Страница, которую вы ищете, не существует или была перемещена.
        </p>
        <div className="mt-6">
          <Link href="/" className="ds-btn ds-btn-primary min-h-11 px-4">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
