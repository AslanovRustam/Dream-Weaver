"use client";

// Ввод простого режима — одинаковый во всех инструментах: ТЗ в любом виде
// (текст, вставка, файлы .docx/.pdf/.txt, картинки — перетащить, вставить,
// выбрать), галочки «что нужно» конкретного инструмента и «Создать».
import { useRef, useState, type ReactNode } from "react";
import { FileText, Loader2, Paperclip, Sparkles, X } from "lucide-react";

import type { TzRunInput } from "@/lib/tz/client";

export type TzOption = { id: string; label: string; default?: boolean };

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

export function TzInputBox({
  onRun,
  busy,
  estimate,
  options = [],
  label = "Что нужно сделать",
  placeholder = "Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, тексты, форматы, ссылки на сайт и референсы.\nМожно перетащить сюда файл ТЗ (.docx, .pdf) и картинки.",
  cta = "Создать",
  extra,
}: {
  onRun: (input: TzRunInput) => void;
  busy: boolean;
  /** Строка под кнопкой: примерная цена. */
  estimate?: string;
  options?: TzOption[];
  label?: string;
  placeholder?: string;
  cta?: string;
  /** Что-то своё инструмента между галочками и кнопкой. */
  extra?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ name: string; base64: string }[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [opts, setOpts] = useState<Record<string, boolean>>(() => Object.fromEntries(options.map((o) => [o.id, o.default ?? true])));
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | File[] | null) => {
    for (const f of Array.from(list ?? [])) {
      if (f.size > 10 * 1024 * 1024) continue;
      const data = await readAsDataUrl(f);
      if (f.type.startsWith("image/")) setImages((p) => [...p, data].slice(0, 8));
      else setFiles((p) => [...p, { name: f.name, base64: data }].slice(0, 4));
    }
  };

  const canRun = !busy && (text.trim().length > 0 || files.length > 0 || images.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-2 block ds-h4">{label}</label>
        <div
          className="rounded-xl border border-border bg-background/40 focus-within:border-foreground/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                void addFiles(imgs);
              }
            }}
            rows={7}
            placeholder={placeholder}
            className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm outline-none"
          />
          {files.length || images.length ? (
            <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
              {files.map((f, i) => (
                <span key={f.name + i} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5" /> {f.name}
                  <button type="button" aria-label="Убрать файл" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {images.map((src, i) => (
                <span key={i} className="relative">
                  <img src={src} alt="" className="h-10 w-10 rounded-md object-cover" />
                  <button
                    type="button"
                    aria-label="Убрать картинку"
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" /> Файл ТЗ или картинка
            </button>
            <span className="text-xs text-muted-foreground">ссылки в тексте откроем сами</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".docx,.pdf,.txt,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {options.length ? (
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!opts[o.id]}
                onChange={(e) => setOpts((p) => ({ ...p, [o.id]: e.target.checked }))}
                className="h-4 w-4 accent-[var(--accent-green)]"
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}

      {extra}

      <button
        type="button"
        disabled={!canRun}
        onClick={() => onRun({ text, files, images, options: opts })}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent-green px-6 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Работаю…" : cta}
      </button>
      {estimate ? <p className="-mt-3 text-center text-xs text-muted-foreground">{estimate}</p> : null}
    </div>
  );
}
