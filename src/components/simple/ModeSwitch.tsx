"use client";

// Переключатель «Простой / Продвинутый» — одинаковый во всех инструментах.
import type { ToolMode } from "./useToolMode";

export function ModeSwitch({ mode, onChange, className = "" }: { mode: ToolMode; onChange: (m: ToolMode) => void; className?: string }) {
  return (
    <div className={`flex overflow-hidden rounded-lg border border-border text-sm ${className}`} role="tablist" aria-label="Режим">
      {(
        [
          { id: "simple", label: "Простой" },
          { id: "advanced", label: "Продвинутый" },
        ] as const
      ).map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => onChange(m.id)}
          className={`flex-1 px-3 py-2 transition ${mode === m.id ? "bg-white/10 font-medium text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
