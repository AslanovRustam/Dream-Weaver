"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";

import { checkHeroImage, HERO_RULES } from "@/lib/emailHeroRules";

/**
 * Требования к hero-баннеру и мягкая проверка загруженного.
 *
 * Ничего не блокирует: баннер «не по правилам» письмо не ломает, он просто
 * хуже выглядит у части получателей — решать человеку. Пока картинки нет,
 * список требований свёрнут: он нужен тому, кто идёт её готовить, и мешает
 * тому, кто просто нажмёт «Сгенерировать».
 */
export function HeroRules({ meta }: { meta: { width: number; height: number; bytes: number } | null }) {
  const [open, setOpen] = useState(false);
  const hints = meta ? checkHeroImage(meta) : [];

  return (
    <div className="mt-2">
      {meta ? (
        <p className="ds-caption">
          {meta.width}×{meta.height} px, {Math.round(meta.bytes / 1024)} КБ
        </p>
      ) : null}

      {hints.map((h) => (
        <p
          key={h.text}
          className={`mt-1 flex items-start gap-1.5 ds-caption ${h.level === "warn" ? "text-amber-400" : ""}`}
        >
          {h.level === "warn" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{h.text}</span>
        </p>
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 flex items-center gap-1 ds-caption transition hover:text-foreground"
      >
        Рекомендации
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
          {HERO_RULES.map((r) => (
            <li key={r} className="ds-caption">
              {r}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
