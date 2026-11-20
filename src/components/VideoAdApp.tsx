"use client";

// «Видеореклама» — короткие ролики для Reels / TikTok / Shorts из готовых баннеров.
//
// Простой режим: выбрать креатив, отметить площадки, при желании одной фразой
// сказать, что должно происходить, — «Создать видео». Дальше сам: арт-директор
// смотрит на баннер и решает движение и звук (POST /api/video-ad/plan), ИИ
// оживляет баннер (POST /api/video-ad → опрос), браузер собирает каждый формат
// с концовкой-баннером (lib/videoAd/compose).
// Продвинутый: движок (ИИ / моушн без ИИ), качество, длина, звук, концовка,
// своё описание движения.
// Один ИИ-клип на баннер — сколько бы форматов ни заказали; пересборка форматов
// из готового клипа («Мои видео») бесплатна.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { Clapperboard, Download, Loader2, RefreshCw, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { refreshMe } from "@/components/AppHeader";
import { useAuthGate } from "@/components/AuthGate";
import { AutoSteps } from "@/components/simple/AutoSteps";
import { ModeSwitch } from "@/components/simple/ModeSwitch";
import { useToolMode } from "@/components/simple/useToolMode";
import { ApiError, apiFetch, apiJson } from "@/lib/api-client";
import { toDataUrl } from "@/lib/gifRender";
import { takeTzHandoff } from "@/lib/tz/handoff";
import { composeVideoAd, loadImage } from "@/lib/videoAd/compose";
import {
  aiSeconds,
  VIDEO_AD_DEFAULT_DURATION,
  VIDEO_AD_DURATIONS,
  VIDEO_AD_FORMAT_BY_ID,
  VIDEO_AD_FORMATS,
  VIDEO_AD_MODELS,
  videoAdCredits,
  type VideoAdEngine,
  type VideoAdFormatId,
  type VideoAdJob,
  type VideoAdPlan,
  type VideoAdQuality,
} from "@/lib/videoAd/spec";

type Source = { kind: "card" | "upload"; id?: string; name: string; image: string };
type CardItem = { id: string; name: string; master: { image_url: string | null } | null };
type Out = { status: "queued" | "running" | "done" | "error"; url?: string; blob?: Blob; p?: number; error?: string };
type Phase = "idle" | "planning" | "starting" | "generating" | "composing" | "done" | "error";

const POLL_MS = 5_000;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`;

/** Свой файл → data URL не больше 2048 px по длинной стороне. */
async function fileToDataUrl(file: Blob): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function VideoAdApp() {
  const { requireAuth } = useAuthGate();
  const params = useSearchParams();
  const [toolMode, setToolMode, showToolMode] = useToolMode("videoAd");
  const simple = toolMode === "simple";

  const [cards, setCards] = useState<CardItem[] | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [formats, setFormats] = useState<Set<VideoAdFormatId>>(new Set(["9:16"]));
  const [engine, setEngine] = useState<VideoAdEngine>("ai");
  const [quality, setQuality] = useState<VideoAdQuality>("fast");
  const [total, setTotal] = useState<number>(VIDEO_AD_DEFAULT_DURATION);
  const [audio, setAudio] = useState(true);
  const [endCard, setEndCard] = useState(true);
  const [wish, setWish] = useState("");
  const [brief, setBrief] = useState("");
  const [plan, setPlan] = useState<VideoAdPlan | null>(null);
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<VideoAdJob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [outs, setOuts] = useState<Map<VideoAdFormatId, Out>>(new Map());
  const [jobs, setJobs] = useState<VideoAdJob[]>([]);
  const runId = useRef(0);
  const busy = phase === "planning" || phase === "starting" || phase === "generating" || phase === "composing";

  // ---- данные ----
  const loadJobs = useCallback(() => {
    apiJson<{ jobs: VideoAdJob[] }>("/api/video-ad")
      .then((r) => setJobs(r.jobs))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    apiJson<{ items: CardItem[] }>("/api/history?limit=36")
      .then((r) => setCards(r.items.filter((c) => c.master?.image_url)))
      .catch(() => setCards([]));
    loadJobs();
  }, [loadJobs]);

  // ?card=… — баннер из Истории / баннер-генератора.
  const cardParam = params.get("card");
  useEffect(() => {
    if (!cardParam || cards === null || source) return;
    const c = cards.find((x) => x.id === cardParam);
    if (c?.master?.image_url) return setSource({ kind: "card", id: c.id, name: c.name, image: c.master.image_url });
    apiJson<{ card: { id: string; name: string; master?: { image_url?: string | null } | null } }>(`/api/history/${cardParam}`)
      .then((r) => r.card.master?.image_url && setSource({ kind: "card", id: r.card.id, name: r.card.name, image: r.card.master.image_url }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardParam, cards]);

  // Передача из другого инструмента («Видео из этого баннера»): простой режим и сразу в работу.
  const handoffTaken = useRef(false);
  useEffect(() => {
    if (handoffTaken.current) return;
    handoffTaken.current = true;
    void (async () => {
      const h = await takeTzHandoff("videoAd").catch(() => null);
      const img = h?.decided?.image;
      if (!h || typeof img !== "string") return;
      const j = h.understood.job;
      const b = [j.summary, j.offer ? `Оффер: ${j.offer}` : "", j.style?.direction ? `Стиль: ${j.style.direction}` : ""].filter(Boolean).join("\n");
      showToolMode("simple");
      const src: Source = { kind: "upload", name: j.brand?.name || "Баннер из ТЗ", image: img };
      setSource(src);
      setBrief(b);
      void runSimple(src, b);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Видео живут в blob: — освобождаем при замене и уходе.
  const live = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set([...outs.values()].map((o) => o.url).filter((u): u is string => !!u));
    for (const u of live.current) if (!now.has(u)) URL.revokeObjectURL(u);
    live.current = now;
  }, [outs]);
  useEffect(() => () => live.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Таймер ожидания клипа.
  useEffect(() => {
    if (phase !== "generating") return;
    const t0 = Date.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- действия ----
  async function upload(file: File) {
    setUploading(true);
    try {
      const img = await fileToDataUrl(file);
      try {
        const r = await apiJson<{ card_id: string; image_url: string; name: string }>("/api/history/upload-card", {
          method: "POST",
          body: JSON.stringify({ image: img.src, name: file.name, width: img.w, height: img.h }),
        });
        setCards((prev) => [{ id: r.card_id, name: r.name, master: { image_url: r.image_url } }, ...(prev ?? [])]);
        setSource({ kind: "card", id: r.card_id, name: r.name, image: r.image_url });
      } catch {
        setSource({ kind: "upload", name: file.name, image: img.src });
      }
      setPlan(null);
    } catch {
      toast.error("Не удалось открыть картинку");
    } finally {
      setUploading(false);
    }
  }

  async function makePlan(src: Source, w: string, b: string): Promise<VideoAdPlan> {
    const p = await apiJson<VideoAdPlan>("/api/video-ad/plan", {
      method: "POST",
      body: JSON.stringify({ image: src.image, wish: w, brief: b }),
    });
    setPlan(p);
    setPrompt(p.prompt);
    return p;
  }

  async function suggest() {
    if (!source) return;
    setPlanning(true);
    try {
      const p = await makePlan(source, wish, brief);
      setAudio(p.audio);
      setEndCard(p.endCard);
      setTotal(p.duration);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  /** Дождаться клипа: опрос до done / failed. */
  async function waitClip(j: VideoAdJob, my: number): Promise<VideoAdJob> {
    let cur = j;
    while (!cur.ready) {
      if (cur.status === "failed") throw new Error(`${cur.error || "Видео не получилось"}. Кредиты возвращены.`);
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (runId.current !== my) throw new DOMException("Отменено", "AbortError");
      try {
        cur = (await apiJson<{ job: VideoAdJob }>(`/api/video-ad/${cur.id}`)).job;
        setJob(cur);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) throw new Error("Задание не найдено");
        // сеть мигнула — спросим ещё раз
      }
    }
    return cur;
  }

  /** Собрать форматы из клипа (или моушн без клипа). */
  async function composeAll(a: { image: string; clip?: Blob; formats: VideoAdFormatId[]; total: number; endCard: boolean }, my: number) {
    setPhase("composing");
    setOuts(new Map(a.formats.map((f) => [f, { status: "queued" } as Out])));
    const banner = await loadImage(await toDataUrl(a.image));
    for (const f of a.formats) {
      if (runId.current !== my) return;
      const spec = VIDEO_AD_FORMAT_BY_ID.get(f)!;
      setOuts((m) => new Map(m).set(f, { status: "running", p: 0 }));
      try {
        const blob = await composeVideoAd({
          w: spec.w,
          h: spec.h,
          total: a.total,
          endCard: a.endCard,
          banner,
          clip: a.clip,
          onProgress: (p) => setOuts((m) => new Map(m).set(f, { status: "running", p })),
        });
        setOuts((m) => new Map(m).set(f, { status: "done", blob, url: URL.createObjectURL(blob) }));
      } catch (e) {
        setOuts((m) => new Map(m).set(f, { status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    }
    setPhase("done");
  }

  async function fetchClip(id: string): Promise<Blob> {
    const res = await apiFetch(`/api/video-ad/${id}/clip`);
    if (!res.ok) throw new Error("Не удалось забрать клип");
    return res.blob();
  }

  /** Весь путь: (план) → клип → форматы. */
  async function run(a: {
    src: Source;
    engine: VideoAdEngine;
    quality: VideoAdQuality;
    total: number;
    audio: boolean;
    endCard: boolean;
    formats: VideoAdFormatId[];
    prompt?: string;
    plan?: VideoAdPlan | null;
    wish: string;
    brief: string;
  }) {
    const my = ++runId.current;
    setError(null);
    setJob(null);
    setElapsed(0);
    setOuts(new Map());
    try {
      if (a.engine === "motion") return await composeAll({ image: a.src.image, formats: a.formats, total: a.total, endCard: a.endCard }, my);
      let p = a.plan ?? null;
      let text = a.prompt?.trim() || "";
      if (!text) {
        setPhase("planning");
        p = await makePlan(a.src, a.wish, a.brief);
        text = p.prompt;
      }
      if (runId.current !== my) return;
      setPhase("starting");
      const r = await apiJson<{ job: VideoAdJob }>("/api/video-ad", {
        method: "POST",
        body: JSON.stringify({
          image: a.src.image,
          cardId: a.src.kind === "card" ? a.src.id : undefined,
          prompt: text,
          quality: a.quality,
          total: a.total,
          audio: a.audio,
          endCard: a.endCard,
          formats: a.formats,
          title: p?.title || a.src.name,
          idea: p?.idea,
        }),
      });
      refreshMe();
      setJob(r.job);
      setPhase("generating");
      loadJobs();
      const done = await waitClip(r.job, my);
      loadJobs();
      const clip = await fetchClip(done.id);
      await composeAll({ image: done.image_url, clip, formats: a.formats, total: a.total, endCard: a.endCard }, my);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (runId.current !== my) return;
      const msg = e instanceof ApiError && e.status === 402 ? "Не хватает кредитов — пополните баланс" : e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
      refreshMe();
      loadJobs();
    }
  }

  function runSimple(src = source, b = brief) {
    if (!src) return;
    const fs = [...formats];
    // Простой режим: «Быстро», 10 с (или 6, если арт-директор решил короче), звук и концовка — по плану.
    void (async () => {
      const my = runId.current + 1;
      setPhase("planning");
      setError(null);
      setOuts(new Map());
      setJob(null);
      try {
        const p = await makePlan(src, wish, b);
        if (runId.current + 1 !== my) return;
        await run({
          src,
          engine: "ai",
          quality: "fast",
          total: Math.min(p.duration, 10),
          audio: p.audio,
          endCard: true,
          formats: fs,
          prompt: p.prompt,
          plan: p,
          wish,
          brief: b,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }

  function runAdvanced() {
    if (!source) return;
    void run({ src: source, engine, quality, total, audio, endCard, formats: [...formats], prompt, plan, wish, brief });
  }

  /** «Мои видео»: открыть готовый клип (пересборка форматов бесплатна) или дождаться идущего. */
  async function openJob(j: VideoAdJob) {
    const my = ++runId.current;
    setError(null);
    setJob(j);
    setOuts(new Map());
    setSource({ kind: j.card_id ? "card" : "upload", id: j.card_id ?? undefined, name: j.title || "Баннер", image: j.image_url });
    try {
      let cur = j;
      if (!cur.ready) {
        if (cur.status === "failed") throw new Error(`${cur.error || "Видео не получилось"}. Кредиты возвращены.`);
        setElapsed((Date.now() - Date.parse(cur.created_at)) / 1000);
        setPhase("generating");
        cur = await waitClip(cur, my);
        loadJobs();
      }
      const clip = await fetchClip(cur.id);
      await composeAll({ image: cur.image_url, clip, formats: cur.recipe.formats, total: cur.recipe.total, endCard: cur.recipe.endCard }, my);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  // Вернулись на страницу, а клип ещё делается — подхватываем.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || busy || !jobs.length) return;
    resumed.current = true;
    const j = jobs.find((x) => x.status === "pending" || x.status === "saving");
    if (j && Date.now() - Date.parse(j.created_at) < 30 * 60_000) void openJob(j);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  async function zipAll() {
    const done = [...outs.entries()].filter(([, o]) => o.blob);
    const zip = new JSZip();
    for (const [f, o] of done) zip.file(`video-${f.replace(":", "x")}.mp4`, o.blob!);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    download(url, `video-ads-${done.length}.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---- цена ----
  const simpleCredits = videoAdCredits("fast", aiSeconds(10, true));
  const advCredits = engine === "motion" ? 0 : videoAdCredits(quality, aiSeconds(total, endCard));
  const toggleFormat = (f: VideoAdFormatId) =>
    setFormats((prev) => {
      const n = new Set(prev);
      if (n.has(f)) {
        if (n.size > 1) n.delete(f);
      } else n.add(f);
      return n;
    });
  const orderedFormats = useMemo(() => VIDEO_AD_FORMATS.filter((f) => formats.has(f.id)), [formats]);

  // ---- вёрстка ----
  const picker = (
    <section>
      <div className="ds-caption mb-2 text-muted-foreground">1. Креатив</div>
      {source ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{source.name}</div>
            <div className="ds-caption text-muted-foreground">{source.kind === "card" ? "Из Истории" : "Свой файл"}</div>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn-secondary px-3 py-1.5 text-sm"
            onClick={() => {
              setSource(null);
              setPlan(null);
              setPrompt("");
            }}
            disabled={busy}
          >
            Сменить
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-white/5"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Сохраняем в Историю…" : "Загрузить свой баннер"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <div className="ds-caption text-muted-foreground">или из Истории:</div>
          {cards === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : cards.length === 0 ? (
            <p className="ds-caption text-muted-foreground">В Истории пока нет баннеров — создайте его в разделе «Баннеры».</p>
          ) : (
            <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  onClick={() => {
                    setSource({ kind: "card", id: c.id, name: c.name, image: c.master!.image_url! });
                    setPlan(null);
                    setPrompt("");
                  }}
                  className="overflow-hidden rounded-lg border border-border hover:border-accent-green"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.master!.image_url!} alt={c.name} className="aspect-square w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const formatPicker = (
    <section>
      <div className="ds-caption mb-2 text-muted-foreground">2. Где будет крутиться</div>
      <div className="flex flex-col gap-1.5">
        {VIDEO_AD_FORMATS.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5">
            <input type="checkbox" checked={formats.has(f.id)} onChange={() => toggleFormat(f.id)} disabled={busy} className="accent-[var(--accent-green)]" />
            <span className="font-medium">{f.label}</span>
            <span className="ds-caption ml-auto text-muted-foreground">{f.where}</span>
          </label>
        ))}
      </div>
      <p className="ds-caption mt-1.5 text-muted-foreground">Форматы собираются из одного ролика — за каждый лишний платить не нужно.</p>
    </section>
  );

  const steps = [
    { id: "planning", label: "Смотрю баннер и решаю, что оживить" },
    { id: "generating", label: "ИИ оживляет баннер (обычно 1–3 минуты)" },
    { id: "composing", label: "Собираю форматы и концовку с баннером" },
  ];
  const stepNow = phase === "starting" ? "generating" : phase === "planning" || phase === "generating" || phase === "composing" ? phase : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="ds-h3 flex items-center gap-2">
            <Clapperboard className="h-6 w-6 text-accent-green" /> Видеореклама
          </h1>
          <p className="ds-caption mt-1 text-muted-foreground">
            Короткие ролики для Reels, TikTok и Shorts из ваших баннеров: ИИ оживляет креатив, а в конце — сам баннер, чтобы
            оффер и кнопка читались точно.
          </p>
        </div>

        <ModeSwitch mode={toolMode} onChange={setToolMode} />

        {picker}
        {formatPicker}

        {simple ? (
          <>
            <section>
              <div className="ds-caption mb-2 text-muted-foreground">3. Что должно происходить — необязательно</div>
              <textarea
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                disabled={busy}
                rows={3}
                placeholder="Например: монеты сыплются, персонаж подмигивает, камера медленно наезжает"
                className="w-full rounded-xl border border-border bg-background/40 p-3 text-sm outline-none focus:border-accent-green/60"
              />
              {brief ? <p className="ds-caption mt-1 text-muted-foreground">Учту ТЗ из прошлого инструмента.</p> : null}
            </section>
            <button
              type="button"
              onClick={() => requireAuth(() => runSimple())}
              disabled={!source || busy}
              className="ds-btn ds-btn-primary flex items-center justify-center gap-2 px-5 py-3"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Делаю видео…" : "Создать видео"}
              {!busy && source ? <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">≈ {simpleCredits} кр.</span> : null}
            </button>
            <p className="ds-caption -mt-3 text-muted-foreground">
              10 секунд со звуком, концовка — ваш баннер. Если видео не получится, кредиты вернутся.
            </p>
          </>
        ) : (
          <>
            <section>
              <div className="ds-caption mb-2 text-muted-foreground">3. Как оживить</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(engine === "ai")} onClick={() => setEngine("ai")} disabled={busy}>
                  ИИ-оживление
                </button>
                <button type="button" className={chip(engine === "motion")} onClick={() => setEngine("motion")} disabled={busy}>
                  Моушн без ИИ · бесплатно
                </button>
              </div>
              {engine === "ai" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.keys(VIDEO_AD_MODELS) as VideoAdQuality[]).map((q) => (
                    <button key={q} type="button" title={VIDEO_AD_MODELS[q].hint} className={chip(quality === q)} onClick={() => setQuality(q)} disabled={busy}>
                      {VIDEO_AD_MODELS[q].label} <span className="text-xs opacity-70">· {VIDEO_AD_MODELS[q].hint}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ds-caption mt-2 text-muted-foreground">Наезд камеры, вспышка на старте, блик и искры по баннеру — собирается прямо в браузере.</p>
              )}
            </section>

            <section>
              <div className="ds-caption mb-2 text-muted-foreground">4. Длина и концовка</div>
              <div className="flex flex-wrap gap-2">
                {VIDEO_AD_DURATIONS.map((d) => (
                  <button key={d} type="button" className={chip(total === d)} onClick={() => setTotal(d)} disabled={busy}>
                    {d} с
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={endCard} onChange={(e) => setEndCard(e.target.checked)} disabled={busy} />
                Концовка 2 с — исходный баннер (оффер и кнопка без искажений)
              </label>
              {engine === "ai" ? (
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} disabled={busy} />
                  Звук: музыка и эффекты от ИИ
                </label>
              ) : null}
            </section>

            {engine === "ai" ? (
              <section>
                <div className="ds-caption mb-2 flex items-center justify-between text-muted-foreground">
                  <span>5. Движение</span>
                  <button
                    type="button"
                    onClick={() => requireAuth(() => void suggest())}
                    disabled={!source || planning || busy}
                    className="flex items-center gap-1 text-xs text-accent-green hover:underline disabled:opacity-50"
                  >
                    {planning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Придумать по баннеру
                  </button>
                </div>
                {plan ? (
                  <p className="ds-caption mb-1.5 text-foreground/80">
                    <b>{plan.title}.</b> {plan.idea}
                  </p>
                ) : null}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={busy}
                  rows={5}
                  placeholder="Пусто — придумаю сам по баннеру. Можно по-русски: что движется, как едет камера."
                  className="w-full rounded-xl border border-border bg-background/40 p-3 text-sm outline-none focus:border-accent-green/60"
                />
              </section>
            ) : null}

            <button
              type="button"
              onClick={() => requireAuth(runAdvanced)}
              disabled={!source || busy}
              className="ds-btn ds-btn-primary flex items-center justify-center gap-2 px-5 py-3"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {busy ? "Делаю видео…" : `Создать ${orderedFormats.length > 1 ? `${orderedFormats.length} формата` : "видео"}`}
              {!busy && source ? (
                <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">{advCredits ? `≈ ${advCredits} кр.` : "бесплатно"}</span>
              ) : null}
            </button>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {phase !== "idle" && (simple || engine === "ai" || phase === "error") && phase !== "done" ? (
          <AutoSteps
            steps={steps}
            current={stepNow}
            error={error ?? undefined}
            log={
              phase === "generating"
                ? [`Прошло ${fmtTime(elapsed)}${job ? ` · ${job.seconds} с видео, ${job.credits} кр.` : ""}`]
                : phase === "composing"
                  ? orderedFormats.map((f) => {
                      const o = outs.get(f.id);
                      return `${f.label}: ${o?.status === "done" ? "готово" : o?.status === "running" ? `${Math.round((o.p ?? 0) * 100)}%` : o?.status === "error" ? "ошибка" : "в очереди"}`;
                    })
                  : []
            }
            onRetry={source ? () => (simple ? runSimple() : runAdvanced()) : undefined}
          />
        ) : null}

        {outs.size === 0 && phase !== "error" ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-4 text-center text-muted-foreground">
            {source ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={source.image} alt="" className={`max-h-72 max-w-full rounded-lg object-contain ${busy ? "animate-pulse" : ""}`} />
            ) : (
              <Clapperboard className="h-10 w-10" />
            )}
            <p className="text-sm">{source ? (busy ? "Скоро здесь будет видео" : "Нажмите «Создать видео»") : "Выберите баннер — сделаем из него ролик"}</p>
          </div>
        ) : null}

        {outs.size ? (
          <div>
            {plan && phase === "done" ? (
              <p className="mb-2 text-sm text-foreground/80">
                <b>{plan.title}.</b> {plan.idea}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...outs.entries()].map(([f, o]) => {
                const spec = VIDEO_AD_FORMAT_BY_ID.get(f)!;
                return (
                  <div key={f} className="flex flex-col gap-2 rounded-2xl border border-border p-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{spec.label}</span>
                      <span className="ds-caption text-muted-foreground">{spec.w}×{spec.h}</span>
                    </div>
                    <div className="flex items-center justify-center overflow-hidden rounded-lg bg-black/40" style={{ aspectRatio: `${spec.w} / ${spec.h}`, maxHeight: 520 }}>
                      {o.url ? (
                        <video src={o.url} controls playsInline loop autoPlay muted className="h-full w-full object-contain" />
                      ) : o.status === "error" ? (
                        <p className="p-3 text-center text-xs text-destructive">{o.error}</p>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          {o.status === "running" ? `${Math.round((o.p ?? 0) * 100)}%` : "в очереди"}
                        </div>
                      )}
                    </div>
                    {o.url ? (
                      <button
                        type="button"
                        onClick={() => download(o.url!, `video-${f.replace(":", "x")}.mp4`)}
                        className="ds-btn ds-btn-secondary flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm"
                      >
                        <Download className="h-4 w-4" /> MP4 · {((o.blob?.size ?? 0) / 1024 / 1024).toFixed(1)} МБ
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {[...outs.values()].filter((o) => o.blob).length > 1 ? (
              <button type="button" onClick={() => void zipAll()} className="ds-btn ds-btn-secondary mt-3 flex items-center gap-1.5 px-4 py-2 text-sm">
                <Download className="h-4 w-4" /> Скачать все ZIP
              </button>
            ) : null}
          </div>
        ) : null}

        {jobs.length ? (
          <section className="mt-2">
            <div className="ds-caption mb-2 flex items-center justify-between text-muted-foreground">
              <span>Мои видео — пересборка форматов бесплатна</span>
              <button type="button" onClick={loadJobs} className="flex items-center gap-1 hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> Обновить
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  disabled={busy || j.status === "failed"}
                  onClick={() => void openJob(j)}
                  title={j.error ?? j.recipe.idea ?? j.title}
                  className="flex flex-col overflow-hidden rounded-lg border border-border text-left text-xs transition hover:border-accent-green disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={j.image_url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  <div className="p-1.5">
                    <div className="truncate font-medium">{j.title || "Видео"}</div>
                    <div className="text-muted-foreground">
                      {j.status === "done" ? `${j.recipe.total} с · ${j.recipe.formats.join(", ")}` : j.status === "failed" ? "не вышло · кредиты вернули" : "делается…"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
