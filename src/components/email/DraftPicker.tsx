"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePlus2, FolderOpen, Loader2, Trash2 } from "lucide-react";

import type { DraftMeta } from "@/lib/emailDraftsStore";

/**
 * «Мои письма»: открыть сохранённое, начать новое, удалить лишнее.
 *
 * Раньше сохранённое письмо нельзя было открыть снова — генератор каждый раз
 * стартовал с чистого листа, а черновики видел только кабинет рассылок, и то
 * лишь чтобы выбрать письмо для кампании.
 */
export function DraftPicker({
  drafts,
  loading,
  currentId,
  onOpen,
  onNew,
  onDelete,
}: {
  drafts: DraftMeta[];
  loading: boolean;
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Клик мимо закрывает список — как у любого выпадающего меню.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const date = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-sm font-medium transition hover:border-accent-green/50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4 text-accent-green" />}
        Мои письма{drafts.length ? ` · ${drafts.length}` : ""}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <FilePlus2 className="h-4 w-4" />
        Новое письмо
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-[min(26rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          {drafts.length === 0 ? (
            <p className="px-3 py-4 text-center ds-caption">
              Сохранённых писем пока нет — нажмите «Сохранить письмо» внизу формы.
            </p>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                  d.id === currentId ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpen(d.id);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-foreground">
                    {d.subject || d.name || "Без темы"}
                  </span>
                  <span className="block truncate ds-caption">{date(d.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  aria-label={`Удалить «${d.subject || d.name || "Без темы"}»`}
                  title="Удалить"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-white/10 hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
