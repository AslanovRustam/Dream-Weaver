"use client";
// GIF-генератор — отдельный инструмент: готовый баннер (из Истории или свой файл) →
// сеть → размеры → GIF каждого размера, собранные композицией слоёв (фон, персонаж
// отдельно, надписи и кнопка в стиле баннера — src/lib/bannerLayersRun.ts), под
// техтребования выбранной сети (src/lib/gifNetworks.ts). Слои генерируются один раз на
// баннер и сохраняются в карточку Истории; повторная сборка оттуда бесплатна.
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Download,
  FileArchive,
  ImagePlay,
  Loader2,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GifDialog } from "@/components/resize/GifDialog";
import { apiJson } from "@/lib/api-client";
import { gifLayersFor, type LayeredCtx, type SavedLayers } from "@/lib/bannerLayersRun";
import type { LayerSource } from "@/lib/bannerLayers";
import { buildGif, toDataUrl } from "@/lib/gifRender";
import {
  GIF_DEFAULT_SIZES,
  GIF_NETWORKS,
  GIF_NETWORK_BY_ID,
  GIF_SIZE_GROUPS,
  type GifCheck,
  type GifNetworkId,
} from "@/lib/gifNetworks";
import type { GeneratePayload } from "@/lib/imageGen";

type CardItem = {
  id: string;
  name: string;
  master: { image_url: string | null; width: number | null; height: number | null } | null;
};
type Source =
  | { kind: "card"; id: string; name: string; image: string }
  | { kind: "upload"; name: string; image: string };
type Result = {
  status: "queued" | "running" | "done" | "error";
  url?: string;
  bytes?: Uint8Array;
  kb?: number;
  checks?: GifCheck[];
  layers?: LayerSource;
  error?: string;
};

const NET_KEY = "gengo.gif.network";
/** Цена первой сборки слоёв на баннер: персонаж + лист надписей (по 23) + фон. */
const FIRST_BUILD_CREDITS = 48;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`;

function savedNetwork(): GifNetworkId {
  try {
    const v = localStorage.getItem(NET_KEY);
    if (v && GIF_NETWORK_BY_ID.has(v as GifNetworkId)) return v as GifNetworkId;
  } catch {
    /* приватный режим */
  }
  return "google";
}

/** Свой файл → data URL не больше 1536 px по длинной стороне (модели больше не нужно). */
async function fileToDataUrl(file: File): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1536 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GifGenApp() {
  const [cards, setCards] = useState<CardItem[] | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [netId, setNetId] = useState<GifNetworkId>("google");
  useEffect(() => setNetId(savedNetwork()), []);
  const net = GIF_NETWORK_BY_ID.get(netId)!;
  const [sizes, setSizes] = useState<Set<string>>(new Set(GIF_DEFAULT_SIZES));
  // Есть ли у карточки сохранённые слои (тогда сборка бесплатна): null — ещё не знаем.
  const [savedReady, setSavedReady] = useState<boolean | null>(null);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [running, setRunning] = useState(false);
  const [tune, setTune] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Свой файл сразу становится карточкой Истории: слои GIF сохранятся в неё, и повторная
  // сборка будет бесплатной и после перезагрузки. Не сохранилось — работаем с файлом как есть.
  async function upload(file: File) {
    setUploading(true);
    try {
      const img = await fileToDataUrl(file);
      try {
        const r = await apiJson<{ card_id: string; image_url: string; name: string }>(
          "/api/history/upload-card",
          {
            method: "POST",
            body: JSON.stringify({ image: img.src, name: file.name, width: img.w, height: img.h }),
          },
        );
        setCards((prev) => [
          {
            id: r.card_id,
            name: r.name,
            master: { image_url: r.image_url, width: img.w, height: img.h },
          },
          ...(prev ?? []),
        ]);
        setSource({ kind: "card", id: r.card_id, name: r.name, image: img.src });
      } catch (e) {
        toast.warning("Не удалось сохранить баннер в Историю — слои будут только до перезагрузки", {
          description: e instanceof Error ? e.message : String(e),
        });
        setSource({ kind: "upload", name: file.name, image: img.src });
      }
    } catch {
      toast.error("Не удалось открыть картинку");
    } finally {
      setUploading(false);
    }
  }
  // Контекст слоёв на выбранный баннер: подложки, персонаж и надписи кэшируются в нём.
  const ctxRef = useRef<{ key: string; ctx: LayeredCtx } | null>(null);
  const saved = useRef<Promise<SavedLayers | null> | null>(null);

  useEffect(() => {
    apiJson<{ items: CardItem[] }>("/api/history?limit=36")
      .then((r) => setCards(r.items.filter((c) => c.master?.image_url)))
      .catch(() => setCards([]));
  }, []);

  // Выбрали карточку — узнаём, есть ли у неё сохранённые слои.
  useEffect(() => {
    setResults(new Map());
    saved.current = null;
    setSavedReady(null);
    if (source?.kind !== "card") return void setSavedReady(false);
    const p = apiJson<{ layers: SavedLayers | null }>(`/api/history/${source.id}/layers`)
      .then((r) => r.layers)
      .catch(() => null);
    saved.current = p;
    let off = false;
    p.then((l) => !off && setSavedReady(!!(l?.hero && l?.art?.length)));
    return () => {
      off = true;
    };
  }, [source]);

  // GIF освобождаем, только когда их ссылки ушли из результатов (пересборка, смена баннера),
  // и все — при уходе со страницы. Отзывать на каждое обновление нельзя: превью ещё на экране.
  const liveUrls = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set([...results.values()].map((r) => r.url).filter((u): u is string => !!u));
    for (const u of liveUrls.current) if (!now.has(u)) URL.revokeObjectURL(u);
    liveUrls.current = now;
  }, [results]);
  useEffect(() => () => liveUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const pickNet = (id: GifNetworkId) => {
    setNetId(id);
    try {
      localStorage.setItem(NET_KEY, id);
    } catch {
      /* приватный режим */
    }
  };
  const accepts = (k: string) => !net.sizes || net.sizes.includes(k);
  const chosen = useMemo(
    () => GIF_SIZE_GROUPS.flatMap((g) => g.sizes).filter((k) => sizes.has(k) && accepts(k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizes, net],
  );
  const toggle = (k: string) =>
    setSizes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function ctxFor(src: Source): Promise<LayeredCtx> {
    const key = `${src.kind}|${src.kind === "card" ? src.id : src.image.length}`;
    if (ctxRef.current?.key === key) return ctxRef.current.ctx;
    let base = {} as GeneratePayload;
    if (src.kind === "card") {
      const r = await apiJson<{ card: { form_snapshot: Record<string, unknown> } }>(
        `/api/history/${src.id}`,
      ).catch(() => null);
      base = { ...(r?.card.form_snapshot ?? {}), card_id: src.id } as unknown as GeneratePayload;
    }
    const ctx: LayeredCtx = {
      master: await toDataUrl(src.image),
      base,
      plates: new Map(),
      epoch: Date.now(),
      cardId: src.kind === "card" ? src.id : undefined,
      saved: src.kind === "card" && saved.current ? () => saved.current! : undefined,
    };
    ctxRef.current = { key, ctx };
    return ctx;
  }

  const setResult = (k: string, r: Result) => setResults((prev) => new Map(prev).set(k, r));

  async function run() {
    if (!source || !chosen.length) return;
    setRunning(true);
    setResults(new Map(chosen.map((k) => [k, { status: "queued" } as Result])));
    try {
      const ctx = await ctxFor(source);
      for (const k of chosen) {
        const [w, h] = k.split("x").map(Number);
        setResult(k, { status: "running" });
        try {
          const layers = await gifLayersFor({ w, h }, ctx);
          const g = await buildGif({ net, w, h, layers, src: ctx.master });
          const url = URL.createObjectURL(new Blob([g.bytes as BlobPart], { type: "image/gif" }));
          setResult(k, {
            status: "done",
            url,
            bytes: g.bytes,
            kb: g.bytes.length / 1024,
            checks: g.checks,
            layers,
          });
        } catch (e) {
          setResult(k, { status: "error", error: e instanceof Error ? e.message : String(e) });
        }
        // Кодирование — в основном потоке: даём интерфейсу перерисоваться между размерами.
        await new Promise((r) => setTimeout(r, 0));
      }
      setSavedReady(source.kind === "card" ? true : savedReady);
    } catch (e) {
      toast.error("Не удалось собрать GIF", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }

  async function zipAll() {
    const done = [...results.entries()].filter(([, r]) => r.status === "done" && r.bytes);
    if (!done.length) return;
    const zip = new JSZip();
    const report = [`GIF под «${net.label}» — ${net.rules}`, ""];
    for (const [k, r] of done) {
      zip.file(`banner-${k}.gif`, r.bytes!);
      const ok = r.checks!.every((c) => c.ok);
      report.push(
        `${ok ? "✓" : "✗"} banner-${k}.gif — ${r.checks!.map((c) => (c.ok ? "" : "НЕ: ") + c.label).join("; ")}`,
      );
    }
    zip.file("ТТ.txt", report.join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gif-${netId}-${done.length}sz.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 5000);
    toast.success(`Скачали ZIP · ${done.length} GIF`);
  }

  const doneCount = [...results.values()].filter((r) => r.status === "done").length;
  const price = source?.kind === "card" && savedReady ? 0 : FIRST_BUILD_CREDITS;
  const tuning = tune ? results.get(tune) : undefined;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="ds-h3 flex items-center gap-2">
            <ImagePlay className="h-6 w-6 text-accent-green" /> GIF-генератор
          </h1>
          <p className="ds-caption mt-1 text-muted-foreground">
            Из готового баннера — анимированные GIF под рекламную сеть: фон, персонаж и надписи
            отдельными слоями, движение и вес — под требования сети.
          </p>
        </div>

        <section>
          <div className="ds-caption mb-2 text-muted-foreground">1. Баннер</div>
          {source ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{source.name}</div>
                <div className="ds-caption text-muted-foreground">
                  {source.kind === "card"
                    ? savedReady
                      ? "Слои уже в Истории"
                      : savedReady === null
                        ? "Проверяем слои…"
                        : "Слои соберём при первой сборке"
                    : "Свой файл"}
                </div>
              </div>
              <button
                type="button"
                className="ds-btn ds-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setSource(null)}
                disabled={running}
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
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
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
                <p className="ds-caption text-muted-foreground">
                  В Истории пока нет баннеров — создайте его в Баннер-генераторе.
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      onClick={() =>
                        setSource({
                          kind: "card",
                          id: c.id,
                          name: c.name,
                          image: c.master!.image_url!,
                        })
                      }
                      className="overflow-hidden rounded-lg border border-border hover:border-accent-green"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.master!.image_url!}
                        alt={c.name}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="ds-caption mb-2 text-muted-foreground">2. Куда пойдёт</div>
          <div className="flex flex-wrap gap-2">
            {GIF_NETWORKS.map((n) => (
              <button
                key={n.id}
                type="button"
                title={n.hint}
                className={chip(netId === n.id)}
                onClick={() => pickNet(n.id)}
                disabled={running}
              >
                {n.label}
              </button>
            ))}
          </div>
          <p className="ds-caption mt-2 text-muted-foreground">
            {net.hint}. {net.rules}
          </p>
        </section>

        <section>
          <div className="ds-caption mb-2 text-muted-foreground">3. Размеры</div>
          {GIF_SIZE_GROUPS.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="ds-caption mb-1 text-muted-foreground/70">{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.sizes.map((k) => {
                  const ok = accepts(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!ok || running}
                      title={ok ? undefined : `${net.label} такой размер не принимает`}
                      onClick={() => toggle(k)}
                      className={`${chip(ok && sizes.has(k))} ${ok ? "" : "cursor-not-allowed line-through opacity-40"} px-2.5 py-1 text-xs`}
                    >
                      {k.replace("x", "×")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <button
          type="button"
          onClick={run}
          disabled={!source || !chosen.length || running}
          className="ds-btn ds-btn-primary flex items-center justify-center gap-2 px-5 py-3"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlay className="h-4 w-4" />
          )}
          {running ? "Собираем GIF…" : `Собрать ${chosen.length} GIF`}
          {!running && source ? (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">
              {price ? `≈ ${price} кр.` : "бесплатно"}
            </span>
          ) : null}
        </button>
        {source && price ? (
          <p className="ds-caption -mt-3 text-muted-foreground">
            Первая сборка: персонаж и надписи в стиле баннера (по ≈ 23 кр.) и фон. Дальше —
            бесплатно
            {source.kind === "card" ? ": слои сохранятся в карточку Истории." : " до перезагрузки страницы."}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        {results.size === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-center text-muted-foreground">
            <ImagePlay className="h-14 w-14 opacity-30" />
            <div className="ds-caption max-w-xs">
              Выберите баннер, сеть и размеры — здесь появятся GIF с проверкой по требованиям сети.
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Готово {doneCount} из {results.size} · под «{net.label}»
              </div>
              <button
                type="button"
                onClick={zipAll}
                disabled={!doneCount || running}
                className="ds-btn ds-btn-secondary flex items-center gap-2 px-4 py-2 text-sm"
              >
                <FileArchive className="h-4 w-4" /> Скачать всё ZIP
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...results.entries()].map(([k, r]) => {
                const ok = r.checks?.every((c) => c.ok);
                return (
                  <div
                    key={k}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <b className="font-mono">{k.replace("x", "×")}</b>
                      {r.status === "done" ? (
                        <span
                          className={`flex items-center gap-1 text-xs ${ok ? "text-accent-green" : "text-[color:var(--status-error)]"}`}
                        >
                          {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {r.kb!.toFixed(0)} КБ · {ok ? "подходит" : "не проходит"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-h-28 items-center justify-center rounded-lg bg-black/40 p-2">
                      {r.status === "done" && r.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.url}
                          alt={k}
                          className="h-auto max-h-64 max-w-full object-contain"
                        />
                      ) : r.status === "error" ? (
                        <span className="ds-caption text-[color:var(--status-error)]">
                          {r.error}
                        </span>
                      ) : r.status === "running" ? (
                        <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
                      ) : (
                        <span className="ds-caption text-muted-foreground">в очереди</span>
                      )}
                    </div>
                    {r.status === "done" && r.checks && !ok ? (
                      <ul className="ds-caption text-muted-foreground">
                        {r.checks
                          .filter((c) => !c.ok)
                          .map((c) => (
                            <li key={c.label}>✗ {c.label}</li>
                          ))}
                      </ul>
                    ) : null}
                    {r.status === "done" ? (
                      <div className="flex gap-2">
                        <a
                          href={r.url}
                          download={`banner-${k}-${netId}.gif`}
                          className="ds-btn ds-btn-primary flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-sm"
                        >
                          <Download className="h-4 w-4" /> Скачать
                        </a>
                        <button
                          type="button"
                          onClick={() => setTune(k)}
                          className="ds-btn ds-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm"
                          title="Сценарий, повторы, эффекты"
                        >
                          <Settings2 className="h-4 w-4" /> Настроить
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {tune && tuning?.layers && source ? (
        <GifDialog
          open
          onOpenChange={(v) => !v && setTune(null)}
          src={ctxRef.current?.ctx.master ?? source.image}
          size={{ w: Number(tune.split("x")[0]), h: Number(tune.split("x")[1]) }}
          layers={tuning.layers}
        />
      ) : null}
    </div>
  );
}
