"use client";

// Поле ТЗ на главной — вход в простой режим «Кампании». Текст, файлы ТЗ
// (.docx/.pdf/.txt) и картинки, галочки «что собрать», примеры. По кнопке ТЗ
// уходит в кампанию (lib/hubBrief): там разбор, план и цена — кредиты только
// после «Запускаем». Гость сначала входит, ТЗ его ждёт.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { DEFAULT_TZ_EXAMPLES } from "@/components/simple/TzInputBox";
import { useAuth } from "@/lib/auth-context";
import { putHubBrief } from "@/lib/hubBrief";
import { useT } from "@/lib/i18n";

const PARTS = ["banner", "landing", "playable", "email"] as const;
type Part = (typeof PARTS)[number];

const DRAFT_KEY = "dw_tz_draft_hub";

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

export function HomeBrief({ compact = false, id }: { compact?: boolean; id?: string }) {
  const t = useT();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ name: string; base64: string }[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [parts, setParts] = useState<Record<Part, boolean>>({ banner: true, landing: true, playable: true, email: true });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Черновик переживает перезагрузку и уход на вход.
  useEffect(() => {
    try {
      const d = window.localStorage.getItem(DRAFT_KEY);
      if (d) setText(d);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      if (text.trim()) window.localStorage.setItem(DRAFT_KEY, text);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, [text]);

  const addFiles = async (list: FileList | File[] | null) => {
    for (const f of Array.from(list ?? [])) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(t("hub.brief.tooBig"));
        continue;
      }
      const data = await readAsDataUrl(f);
      if (f.type.startsWith("image/")) setImages((p) => [...p, data].slice(0, 8));
      else setFiles((p) => [...p, { name: f.name, base64: data }].slice(0, 4));
    }
  };

  const hasInput = text.trim().length > 0 || files.length > 0 || images.length > 0;
  const anyPart = PARTS.some((p) => parts[p]);

  const submit = async () => {
    if (!hasInput || !anyPart || busy) return;
    setBusy(true);
    try {
      await putHubBrief({ text: text.trim(), files, images, options: { ...parts } });
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      router.push(isAuthenticated ? "/campaign" : "/login");
    } catch {
      toast.error(t("hub.brief.saveFailed"));
      setBusy(false);
    }
  };

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full"
    >
      <div
        className="rounded-2xl border border-border bg-[var(--bg-surface)] shadow-[0_18px_60px_-24px_rgba(0,0,0,0.9)] transition focus-within:border-accent-green/70 focus-within:shadow-[0_0_0_4px_rgba(198,255,61,0.10),0_18px_60px_-24px_rgba(0,0,0,0.9)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }}
      >
        <label className="sr-only" htmlFor={`${id ?? "hub"}-brief`}>
          {t("hub.brief.label")}
        </label>
        <textarea
          id={`${id ?? "hub"}-brief`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (imgs.length) {
              e.preventDefault();
              void addFiles(imgs);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={compact ? 2 : 3}
          placeholder={t("hub.brief.placeholder")}
          className="block w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-hint"
        />

        {files.length || images.length ? (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {files.map((f, i) => (
              <span key={f.name + i} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs">
                <FileText className="h-3.5 w-3.5" /> <span className="max-w-[160px] truncate">{f.name}</span>
                <button type="button" aria-label={t("hub.brief.remove")} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {images.map((src, i) => (
              <span key={i} className="relative">
                <img src={src} alt="" className="h-9 w-9 rounded-md object-cover" />
                <button
                  type="button"
                  aria-label={t("hub.brief.remove")}
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">{t("hub.brief.attach")}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".docx,.pdf,.txt,.md,image/*"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="ml-1 hidden text-xs text-hint sm:inline">{t("hub.brief.what")}</span>
          <div className="flex flex-wrap gap-1.5">
            {PARTS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={parts[p]}
                onClick={() => setParts((cur) => ({ ...cur, [p]: !cur[p] }))}
                className={
                  "inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium transition " +
                  (parts[p]
                    ? "border-accent-green/50 bg-[var(--lime-tint)] text-accent-green"
                    : "border-border text-hint line-through decoration-1 hover:text-muted-foreground")
                }
              >
                {t(`hub.brief.parts.${p}`)}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!hasInput || !anyPart || busy}
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("hub.brief.submit")}
            {busy ? null : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        {compact ? null : (
          <>
            <span className="text-hint">{t("hub.brief.examples")}</span>
            {DEFAULT_TZ_EXAMPLES.slice(0, 3).map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setText(ex.text)}
                className="rounded-full border border-border px-2.5 py-1 text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground"
              >
                {ex.label}
              </button>
            ))}
          </>
        )}
        <span className={"text-hint " + (compact ? "" : "basis-full sm:basis-auto sm:ml-auto")}>
          {isAuthenticated ? t("hub.brief.note") : t("hub.brief.guestNote")}
        </span>
      </div>
    </form>
  );
}
