"use client";

// Canonical "back" control — ONE look across the whole product: a thin ArrowLeft
// + a muted label that brightens on hover (ghost: no border, no fill). Renders a
// Next <Link> when given `href`, otherwise a <button> for `onClick`. Use
// `className` for per-call layout only (outer margins, `lg:hidden`); tailwind-
// merge lets those win over the base.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

const BACK_BTN =
  "inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground";

export function BackButton({
  href,
  onClick,
  label = "Назад",
  className,
}: {
  href?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const inner = (
    <>
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cn(BACK_BTN, className)}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(BACK_BTN, className)}>
      {inner}
    </button>
  );
}
