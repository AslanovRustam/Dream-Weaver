"use client";

// Простой режим баннер-генератора: ТЗ в любом виде → «Создать». Всё остальное
// решает движок ТЗ (src/lib/tz): что за задача, какой шаблон, тексты, размеры,
// референсы. Здесь только ввод, ход работы и карточка «Как я понял ТЗ» с
// проверкой результата по требованиям. Оркестровка — в ImageGenApp.
import { useRef, useState } from "react";
import { Check, FileText, ImagePlus, Link2, Loader2, Paperclip, Sparkles, X, XCircle } from "lucide-react";

import type { TzImage, TzLinkInfo, TzSource } from "@/lib/tz/ingest";
import type { TzJob } from "@/lib/tz/understand";

export type AutoPhase = "reading" | "planning" | "generating" | "checking" | "fixing" | "resizing" | "done" | "error";

export type AutoState = {
  phase: AutoPhase;
  error?: string;
  job?: TzJob;
  images?: TzImage[];
  links?: TzLinkInfo[];
  sources?: TzSource[];
  /** Какой баннер из задания делаем сейчас. */
  bannerIndex: number;
  templateName?: string;
  ideas?: string[];
  check?: { results: { id: string; ok: boolean; note: string }[]; faceCovered: boolean };
  retried?: boolean;
  /** Описание баннера от арт-директора — основа для попытки исправления. */
  prompt?: string;
  wantResizes: boolean;
};

export type SimpleInput = { text: string; files: { name: string; base64: string }[]; images: string[]; wantResizes: boolean };

const STEPS: { phase: AutoPhase; label: string }[] = [
  { phase: "reading", label: "Читаю ТЗ, файлы и ссылки" },
  { phase: "planning", label: "Выбираю шаблон и пишу описание баннера" },
  { phase: "generating", label: "Генерирую баннер" },
  { phase: "checking", label: "Проверяю баннер по требованиям ТЗ" },
  { phase: "resizing", label: "Делаю ресайзы под площадки" },
];
const ORDER: AutoPhase[] = ["reading", "planning", "generating", "checking", "fixing", "resizing", "done"];

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

const ROLE_LABEL: Record<string, string> = {
  style: "стиль",
  main: "главный визуал",
  brand: "бренд",
  character: "персонаж",
  layout: "композиция",
  irrelevant: "не используем",
};

export function SimpleBannerPanel({
  auto,
  busy,
  estimate,
  onRun,
  onMakeBanner,
}: {
  auto: AutoState | null;
  busy: boolean;
  /** «≈ 30 кр. за баннер, ресайз ≈ 2 кр.» */
  estimate: string;
  onRun: (input: SimpleInput) => void;
  onMakeBanner: (index: number) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ name: string; base64: string }[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [wantResizes, setWantResizes] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      if (f.size > 10 * 1024 * 1024) continue;
      const data = await readAsDataUrl(f);
      if (f.type.startsWith("image/")) setImages((p) => [...p, data].slice(0, 8));
      else setFiles((p) => [...p, { name: f.name, base64: data }].slice(0, 4));
    }
  };

  const canRun = !busy && (text.trim().length > 0 || files.length > 0 || images.length > 0);
  const job = auto?.job;
  const at = auto ? ORDER.indexOf(auto.phase === "error" ? "reading" : auto.phase) : -1;
  const checkOf = (id: string) => auto?.check?.results.find((r) => r.id === id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-2 block ds-h4">Что нужно сделать</label>
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
                const dt = new DataTransfer();
                imgs.forEach((f) => dt.items.add(f));
                void addFiles(dt.files);
              }
            }}
            rows={7}
            placeholder={"Напишите задачу своими словами или вставьте ТЗ целиком: оффер, гео, тексты, форматы, ссылки на сайт и референсы.\nМожно перетащить сюда файл ТЗ (.docx, .pdf) и картинки."}
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

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={wantResizes} onChange={(e) => setWantResizes(e.target.checked)} className="h-4 w-4 accent-[var(--accent-green)]" />
        Сразу сделать ресайзы под площадки из ТЗ
      </label>

      <button
        type="button"
        disabled={!canRun}
        onClick={() => onRun({ text, files, images, wantResizes })}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent-green px-6 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Работаю…" : "Создать"}
      </button>
      <p className="-mt-3 text-center text-xs text-muted-foreground">{estimate}</p>

      {auto ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm">
          {STEPS.filter((st) => st.phase !== "resizing" || auto.wantResizes).map((st) => {
            const i = ORDER.indexOf(st.phase);
            const done = at > i || auto.phase === "done";
            const now = !done && (auto.phase === st.phase || (st.phase === "checking" && auto.phase === "fixing"));
            return (
              <div key={st.phase} className={`flex items-center gap-2 ${done || now ? "" : "text-muted-foreground"}`}>
                {done ? (
                  <Check className="h-4 w-4 text-accent-green" />
                ) : now && auto.phase !== "error" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                {st.phase === "checking" && auto.phase === "fixing" ? "Исправляю то, что не прошло проверку" : st.label}
              </div>
            );
          })}
          {auto.phase === "error" ? <p className="text-destructive">{auto.error}</p> : null}
        </div>
      ) : null}

      {job ? (
        <div className="flex flex-col gap-4 rounded-xl border border-accent-green/30 bg-accent-green/5 p-4 text-sm">
          <h3 className="ds-h4">Как я понял ТЗ</h3>
          <p>{job.summary}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {job.offer ? (
              <>
                <dt className="text-muted-foreground">Оффер</dt>
                <dd>{job.offer}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Язык / гео</dt>
            <dd>
              {job.language}
              {job.geo ? ` · ${job.geo}` : ""}
            </dd>
            {job.brand.name ? (
              <>
                <dt className="text-muted-foreground">Бренд</dt>
                <dd>{job.brand.name}</dd>
              </>
            ) : null}
            {auto?.templateName ? (
              <>
                <dt className="text-muted-foreground">Шаблон</dt>
                <dd>
                  {auto.templateName}
                  {job.banners[auto.bannerIndex]?.presetWhy ? ` — ${job.banners[auto.bannerIndex].presetWhy}` : ""}
                </dd>
              </>
            ) : null}
            {job.sizes.length ? (
              <>
                <dt className="text-muted-foreground">Размеры</dt>
                <dd>{job.sizes.map((s) => `${s.w}×${s.h}${s.label ? ` (${s.label})` : ""}`).join(", ")}</dd>
              </>
            ) : null}
          </dl>

          {auto?.images?.length ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Референсы</div>
              <div className="flex flex-wrap gap-2">
                {auto.images.map((im) => {
                  const r = job.images.find((x) => x.id === im.id);
                  return (
                    <div key={im.id} className="w-20" title={r?.note || im.from}>
                      <img src={im.src} alt="" className="h-14 w-20 rounded-md object-cover" />
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{ROLE_LABEL[r?.role ?? "style"]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {auto?.links?.length ? (
            <div className="flex flex-col gap-1 text-xs">
              {auto.links.map((l) => (
                <div key={l.url} className="flex items-start gap-1.5">
                  <Link2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${l.ok ? "text-accent-green" : "text-destructive"}`} />
                  <span className="min-w-0 break-all">
                    {l.url}
                    <span className="text-muted-foreground">
                      {" — "}
                      {l.ok ? job.links.find((x) => x.url === l.url)?.note || l.name : `не открылась: ${l.error}`}
                      {l.ok && l.error ? ` (${l.error})` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {job.banners.length > 1 ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Креативы в ТЗ: {job.banners.length}</div>
              <div className="flex flex-col gap-1.5">
                {job.banners.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className={i === auto?.bannerIndex ? "font-medium" : ""}>
                      {i + 1}. {b.name} · {b.aspect}
                    </span>
                    {i !== auto?.bannerIndex ? (
                      <button type="button" disabled={busy} onClick={() => onMakeBanner(i)} className="rounded-md border border-border px-2 py-0.5 hover:border-foreground/40 disabled:opacity-50">
                        Сделать
                      </button>
                    ) : (
                      <span className="text-accent-green">текущий</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {job.requirements.length ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Требования ТЗ{auto?.check ? " — проверка готового баннера" : ""}</div>
              <ul className="flex flex-col gap-1 text-xs">
                {job.requirements.map((r) => {
                  const c = checkOf(r.id);
                  return (
                    <li key={r.id} className="flex items-start gap-1.5">
                      {c ? (
                        c.ok ? (
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        )
                      ) : (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                      )}
                      <span>
                        {r.text}
                        {c && !c.ok && c.note ? <span className="text-destructive"> — {c.note}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {auto?.check?.faceCovered ? <p className="mt-1 text-xs text-destructive">Надпись или кнопка закрывает лицо персонажа.</p> : null}
            </div>
          ) : null}

          {job.assumptions.length ? (
            <div className="text-xs">
              <div className="mb-1 text-muted-foreground">Чего не было в ТЗ — решил сам</div>
              <ul className="list-disc pl-4">
                {job.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {job.cannot.length ? (
            <div className="text-xs">
              <div className="mb-1 text-muted-foreground">Что не сделать как написано</div>
              <ul className="list-disc pl-4">
                {job.cannot.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {auto?.sources?.some((s) => !s.ok || s.note) ? (
            <div className="text-xs text-muted-foreground">
              {auto.sources
                .filter((s) => !s.ok || s.note)
                .map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <ImagePlus className="h-3 w-3" /> {s.name}: {s.note ?? "не прочитано"}
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
