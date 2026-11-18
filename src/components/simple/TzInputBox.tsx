"use client";

// Ввод простого режима — одинаковый во всех инструментах: ТЗ в любом виде
// (текст, вставка, файлы .docx/.pdf/.txt, картинки — перетащить, вставить,
// выбрать), галочки «что нужно» конкретного инструмента и «Создать».
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, History, Loader2, Paperclip, Sparkles, X } from "lucide-react";

import { loadLastTz, type LastTz, type TzRunInput } from "@/lib/tz/client";

export type TzOption = { id: string; label: string; default?: boolean };

/** Пример ТЗ под полем: клик подставляет текст. */
export type TzExample = { label: string; text: string };

/** Примеры по умолчанию — iGaming-задачи, которые понимают все инструменты. */
export const DEFAULT_TZ_EXAMPLES: TzExample[] = [
  {
    label: "Бонус на депозит",
    text: "Акция для Узбекистана: 100% на первый депозит до 5 000 000 сум + 50 фриспинов. Тексты на узбекском, кнопка «O'ynash». Стиль — восточная сказка: ночь, золото, лампа джинна. 18+.",
  },
  {
    label: "Финал Лиги чемпионов",
    text: "Промо ставок на финал Лиги чемпионов, Реал — Боруссия, 1 июня. Фрибет 500 ₽ за первую ставку. Русский язык, динамичный стадион, вспышки, золото кубка. Кнопка «Сделать ставку». 18+.",
  },
  {
    label: "Хэллоуин в казино",
    text: "Хэллоуинский турнир в казино: призовой фонд €10 000 и 200 фриспинов на слот. Английский язык. Тыквы, туман, фиолетово-оранжевые неоновые огни, ведьма-маскот. Кнопка «Join now».",
  },
  {
    label: "Новый слот",
    text: "Анонс нового слота «Sweet Bonanza Xmas»: 100 фриспинов новым игрокам. Новогодние сладости, снег, яркие конфеты. Русский и казахский рынок, тексты на русском. 18+.",
  },
];

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "только что" : m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`;
};

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

export function TzInputBox({
  tool,
  examples = DEFAULT_TZ_EXAMPLES,
  onRun,
  busy,
  estimate,
  options = [],
  label = "Что нужно сделать",
  placeholder = "Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, тексты, форматы, ссылки на сайт и референсы.\nМожно перетащить сюда файл ТЗ (.docx, .pdf) и картинки.",
  cta = "Создать",
  extra,
}: {
  /** id инструмента: черновик ТЗ и «последнее ТЗ из другого инструмента». */
  tool?: string;
  examples?: TzExample[];
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
  const [last, setLast] = useState<LastTz | null>(null);
  const draftKey = tool ? `dw_tz_draft_${tool}` : "";

  // Черновик текста ТЗ — переживает перезагрузку и уход в другой раздел.
  useEffect(() => {
    if (!draftKey) return;
    try {
      const d = window.localStorage.getItem(draftKey);
      if (d) setText(d);
    } catch {
      /* ignore */
    }
    void loadLastTz().then((l) => setLast(l && l.tool !== tool ? l : null));
  }, [draftKey, tool]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (text.trim()) window.localStorage.setItem(draftKey, text);
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey, text]);
  const useLast = () => {
    if (!last) return;
    setText(last.input.text);
    setFiles(last.input.files);
    setImages(last.input.images);
    setLast(null);
  };

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
        {last && !text.trim() ? (
          <button
            type="button"
            onClick={useLast}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/5 px-3 py-2 text-left text-xs transition hover:bg-accent-green/10"
          >
            <History className="h-3.5 w-3.5 shrink-0 text-accent-green" />
            <span className="min-w-0 flex-1 truncate">
              Продолжить по ТЗ из «{last.toolLabel}» · {ago(last.at)}: {last.input.text.slice(0, 80)}
            </span>
            <span className="shrink-0 text-accent-green">Подставить</span>
          </button>
        ) : null}
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

      {!text.trim() && !files.length && !images.length && examples.length ? (
        <div className="-mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Например:</span>
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setText(ex.text)}
              className="rounded-full border border-border px-2.5 py-1 transition hover:border-foreground/40 hover:bg-white/5"
            >
              {ex.label}
            </button>
          ))}
        </div>
      ) : null}

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
