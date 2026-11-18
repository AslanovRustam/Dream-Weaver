"use client";

// Правка словами после результата: «фон темнее», «персонаж — мужчина»,
// «кнопку крупнее». Инструмент перегенерирует с правкой и снова проверяет по ТЗ.
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

export function TzEditBox({
  onEdit,
  busy,
  costLabel,
  placeholder = "Что поправить? Например: фон темнее, персонаж — мужчина, кнопку крупнее",
  examples = ["Фон темнее", "Крупнее оффер", "Другой персонаж"],
}: {
  onEdit: (text: string) => void;
  busy?: boolean;
  /** «≈ 30 кр.» — цена одной правки. */
  costLabel?: string;
  placeholder?: string;
  examples?: string[];
}) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim() || busy) return;
    onEdit(text.trim());
    setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={send}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-green px-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Поправить
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-border px-2 py-0.5 hover:border-foreground/40 hover:text-foreground">
            {x}
          </button>
        ))}
        {costLabel ? <span>{costLabel}</span> : null}
      </div>
    </div>
  );
}
