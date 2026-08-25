"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Sparkles, Upload, Wand2, X } from "lucide-react";

import { BRIEF_SCHEMAS, type BriefResult } from "@/lib/briefSchemas";
import type { SectionId } from "@/lib/sections";

// Reusable "upload a brief (ТЗ)" panel. Accepts a pasted text or a .txt/.docx/.pdf
// file, sends it to /api/parse-brief, and offers two outcomes: fill the form
// fields, or generate the product from the brief.
export function BriefUploader({
  product,
  onApply,
  onGenerate,
}: {
  product: SectionId;
  onApply: (fields: Record<string, string>) => void;
  onGenerate: (result: BriefResult) => void;
}) {
  const schema = BRIEF_SCHEMAS[product];
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BriefResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleField = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Only the fields the user kept ticked.
  const pickSelected = () =>
    Object.fromEntries(
      Object.entries(result?.fields ?? {}).filter(([k]) => selected.has(k)),
    ) as Record<string, string>;

  const reset = () => {
    setResult(null);
    setSelected(new Set());
    setError("");
    setApplied(false);
  };

  const fileToBase64 = (f: File) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(f);
    });

  const parse = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const base: Record<string, unknown> = { product };
      let payload: Record<string, unknown> = base;
      if (mode === "file") {
        if (!file) {
          setError("Выберите файл");
          setLoading(false);
          return;
        }
        payload = { ...base, fileBase64: await fileToBase64(file), fileName: file.name };
      } else {
        if (!text.trim()) {
          setError("Вставьте текст ТЗ");
          setLoading(false);
          return;
        }
        payload = { ...base, text };
      }
      const res = await fetch("/api/parse-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          [data?.error || "Не удалось разобрать ТЗ", data?.detail]
            .filter(Boolean)
            .join(" — "),
        );
        return;
      }
      const parsed = data as BriefResult;
      setResult(parsed);
      setSelected(new Set(Object.keys(parsed.fields || {})));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  };

  const fieldCount = result ? Object.keys(result.fields).length : 0;
  const labelFor = (key: string) => schema.fields.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Загрузить ТЗ</p>
          <p className="ds-caption">ИИ прочитает бриф и заполнит поля или сгенерирует продукт.</p>
        </div>
      </div>

      {/* Intake */}
      <div className="mt-3">
        <div className="mb-2 flex rounded-lg border border-border p-0.5 text-xs">
          {([["file", "Файл"], ["text", "Текст"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={`min-h-8 flex-1 rounded-md px-3 font-medium transition ${
                mode === m ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.docx,.pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                reset();
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-elevated px-3 py-2.5 text-left text-sm transition hover:border-accent-green/50"
            >
              <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.name : "Выбрать .docx / .pdf / .txt"}
              </span>
              {file ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    reset();
                  }}
                  aria-label="Убрать файл"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </span>
              ) : null}
            </button>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              reset();
            }}
            rows={4}
            placeholder="Вставьте текст ТЗ…"
            className="min-h-[92px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green"
          />
        )}

        <button
          type="button"
          onClick={parse}
          disabled={loading}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Разбираю ТЗ…" : "Разобрать ТЗ"}
        </button>

        {error ? <p className="mt-2 text-xs text-[color:var(--status-error)]">{error}</p> : null}
      </div>

      {/* Result + two outcomes */}
      {result ? (
        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="ds-caption">
              Извлечено полей:{" "}
              <span className="font-semibold text-foreground">{selected.size}</span>
              {fieldCount > 0 ? <span className="text-hint"> / {fieldCount}</span> : null}
            </p>
            {fieldCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setSelected((prev) =>
                    prev.size === fieldCount ? new Set() : new Set(Object.keys(result.fields)),
                  )
                }
                className="text-xs font-medium text-accent-green transition hover:text-[var(--accent-hover)]"
              >
                {selected.size === fieldCount ? "Снять все" : "Выбрать все"}
              </button>
            ) : null}
          </div>
          {fieldCount > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {Object.entries(result.fields).map(([k, v]) => {
                const on = selected.has(k);
                return (
                  <li key={k}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleField(k)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand-lime)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-foreground">{labelFor(k)}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={v}>
                          {v}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Явных полей не найдено — можно сгенерировать по общему смыслу ТЗ.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                onApply(pickSelected());
                setApplied(true);
              }}
              disabled={selected.size === 0}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-accent-green/50 hover:bg-white/5 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4 text-accent-green" />
              {applied ? "Поля заполнены" : "Заполнить выбранные"}
            </button>
            <button
              type="button"
              onClick={() => onGenerate({ ...result, fields: pickSelected() })}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
            >
              <Sparkles className="h-4 w-4" />
              Сгенерировать продукт
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
