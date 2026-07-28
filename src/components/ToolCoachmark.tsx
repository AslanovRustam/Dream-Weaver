"use client";

// One-time, per-tool welcome tip shown the first time a user opens a given
// section. Explains what THIS tool does (the Hub only gives a one-liner), then
// remembers dismissal in localStorage so it never nags again. A small floating
// card in the corner — never blocks the form.
import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";

import { isSectionHintSeen, onSectionHintSeen } from "@/lib/onboarding";

const TIPS: Record<string, { title: string; body: string }> = {
  banner: {
    title: "Баннер-генератор",
    body: "Опишите тематику — и получите готовые баннеры под разные форматы: соцсети, ставки, реклама.",
  },
  landing: {
    title: "Лендинг-генератор",
    body: "Соберите лендинг с нуля или на основе баннера: блоки, тексты и превью — всё в одном месте.",
  },
  playable: {
    title: "Плейбл-реклама",
    body: "Выберите игровую механику и соберите интерактивный playable — превью можно потрогать прямо здесь.",
  },
  video: {
    title: "Конструктор видео",
    body: "Соберите видео по шагам: сцена → скрипт → голос → музыка. Прогресс генерации виден в реальном времени.",
  },
};

export function ToolCoachmark({ section }: { section: string }) {
  const [show, setShow] = useState(false);
  const tip = TIPS[section];

  useEffect(() => {
    if (!tip) return;
    // Queue behind the header's section-switcher hint (lib/onboarding): firing
    // both at once covered the form and offered two rival "Понятно" buttons.
    // Re-check on dismissal so this appears the moment the first one is gone.
    const evaluate = () => {
      if (!isSectionHintSeen()) return;
      try {
        if (!window.localStorage.getItem(`dw:toolHint:${section}`)) setShow(true);
      } catch {
        /* ignore */
      }
    };
    evaluate();
    return onSectionHintSeen(evaluate);
  }, [section, tip]);

  if (!show || !tip) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(`dw:toolHint:${section}`, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Подсказка: ${tip.title}`}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-accent-green/40 bg-popover p-3 shadow-xl sm:left-4 sm:right-auto sm:mx-0"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
          <Lightbulb className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ds-h4">{tip.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{tip.body}</p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 rounded-md bg-accent-green px-3 py-1 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            Понятно
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть подсказку"
          className="relative shrink-0 text-muted-foreground transition after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
