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
  const [applied, setApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null);
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
      let payload: Record<string, unknown> = { product };
      if (mode === "file") {
        if (!file) {
          setError("Выберите файл");
          setLoading(false);
          return;
        }
        payload = { product, fileBase64: await fileToBase64(file), fileName: file.name };
      } else {
        if (!text.trim()) {
          setError("Вставьте текст ТЗ");
          setLoading(false);
          return;
        }
        payload = { product, text };
      }
      const res = await fetch("/api/parse-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Не удалось разобрать ТЗ");
        return;
      }
      setResult(data as BriefResult);
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
          <p className="ds-caption">
            Извлечено полей: <span className="font-semibold text-foreground">{fieldCount}</span>
          </p>
          {fieldCount > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(result.fields).map((k) => (
                <span key={k} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                  {labelFor(k)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Явных полей не найдено — можно сгенерировать по общему смыслу ТЗ.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                onApply(result.fields);
                setApplied(true);
              }}
              disabled={fieldCount === 0}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-accent-green/50 hover:bg-white/5 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4 text-accent-green" />
              {applied ? "Поля заполнены" : "Заполнить поля"}
            </button>
            <button
              type="button"
              onClick={() => onGenerate(result)}
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
