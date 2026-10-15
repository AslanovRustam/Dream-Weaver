"use client";

// Готовые темы лендинга-механики: одна плитка — цвет, заголовок на языке
// лендинга, фон, набор парящих объектов и подсказка для ИИ-фона разом.
// Что меняется в самой механике (акцент, заголовок, фон, тема), делает
// редактор в onApply и возвращает, как это откатить; объекты — здесь,
// через extras. После применения — тост с «Вернуть».
import { useMemo } from "react";
import { toast } from "sonner";

import { landingThemesFor, themeBackground, type LandingTheme } from "@/lib/landingThemes";
import type { LandingExtras, LandingKind } from "@/lib/landingKit";

const ICON: Record<string, string> = {
  halloween: "🎃",
  newyear: "🎁",
  egypt: "🏺",
  neon: "💜",
  wildwest: "🤠",
  ocean: "🐚",
  stadium: "⚽",
  derby: "🔥",
  champions: "⭐",
  final: "🏆",
};

export function ThemeStrip({
  kind,
  extras,
  onExtras,
  onApply,
}: {
  kind: LandingKind;
  extras: LandingExtras;
  onExtras: (x: LandingExtras) => void;
  /** Применить к механике (акцент, заголовок, фон, тема); вернуть откат. */
  onApply: (t: LandingTheme, headline: string, bg: string) => () => void;
}) {
  const themes = useMemo(() => landingThemesFor(kind).map((t) => ({ t, bg: themeBackground(t.id) })), [kind]);
  const active = extras.look.floatTheme;

  const apply = (t: LandingTheme, bg: string) => {
    const before = extras;
    const undo = onApply(t, t.headline[extras.lang] ?? t.headline.ru, bg);
    onExtras({ ...extras, look: { ...extras.look, floaters: true, floatTheme: t.id, floatImgs: undefined } });
    toast.success(`Тема «${t.name}»: цвет, заголовок, фон и объекты`, {
      action: {
        label: "Вернуть",
        onClick: () => {
          undo();
          onExtras(before);
        },
      },
    });
  };

  return (
    <div>
      <p className="mb-1.5 ds-caption">Готовые темы — цвет, заголовок, фон и объекты одним нажатием</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {themes.map(({ t, bg }) => (
          <button
            key={t.id}
            type="button"
            onClick={() => apply(t, bg)}
            aria-pressed={active === t.id}
            title={t.name}
            className={`relative flex h-20 w-24 shrink-0 flex-col justify-end overflow-hidden rounded-lg border p-1.5 text-left transition ${
              active === t.id ? "border-accent-green shadow-[0_0_20px_rgba(198,255,61,0.18)]" : "border-border hover:border-white/30"
            }`}
            style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <span className="absolute right-1.5 top-1 text-lg leading-none drop-shadow">{ICON[t.id] ?? "✨"}</span>
            <span className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-1 ring-white/50" style={{ background: t.accent }} />
            <span className="relative truncate rounded bg-black/55 px-1 py-0.5 text-[11px] font-semibold text-white">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
