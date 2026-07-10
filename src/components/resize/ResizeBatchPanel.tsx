// ResizeBatchPanel — a single modal that owns the ENTIRE resize-batch flow
// in three steps. Nothing about the batch is shown on the main screen.
//
//   1. select     — categories + checkboxes, "Сгенерировать пакет" / "Сбросить".
//   2. generating — one overall progress bar + "Сгенерировано X из N баннеров"
//                   + a dynamic ETA. No "Назад"/close while generating.
//   3. result     — "Скачать ZIP" (primary) + "Сгенерировать заново" (secondary)
//                   + a top "Назад" that returns to step 1 to change formats.
//
// Progress and ETA are derived from the REAL per-file batch status coming from
// the generation context (tiles flipping queued→running→done). The ETA is a
// live extrapolation from actual completions:
//     eta ≈ (elapsed / completedCount) × remainingCount
// i.e. the measured average time per finished banner times the number left.
// This is backend-agnostic — it works the same for the dev simulation and for
// real generation because it only measures observed completion times.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileArchive,
  Loader2,
  RefreshCw,
} from "lucide-react";
import JSZip from "jszip";

import { BANNER_SIZE_GROUPS, sizeKey, type BannerSize } from "@/lib/bannerSizes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BatchTile, GenerationStatus } from "@/lib/generation-context";

export type SelectedSize = BannerSize;

type Props = {
  disabled?: boolean;
  masterRatio?: string;
  /** Starts a batch for the given sizes (parent supplies the master image). */
  onLaunch: (sizes: SelectedSize[]) => void;
  /** Live batch tiles from the generation context. */
  tiles: BatchTile[];
  /** Live generation status from the context. */
  batchStatus: GenerationStatus;
};

type Phase = "select" | "generating" | "result";

function ruSeconds(n: number) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "секунда";
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return "секунды";
  return "секунд";
}

export function ResizeBatchPanel({ disabled, masterRatio, onLaunch, tiles, batchStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("select");
  const [selected, setSelected] = useState<Map<string, SelectedSize>>(new Map());
  // All categories expanded by default so the user sees every format at once
  // (they can still collapse any group). The two web-banner data groups are
  // shown merged under the "web-banners" display id.
  // All categories expanded by default. The two web-banner data groups are
  // shown merged under the "web-banners" display id.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const g of BANNER_SIZE_GROUPS) {
      if (g.id === "web-horizontal" || g.id === "web-vertical") ids.add("web-banners");
      else ids.add(g.id);
    }
    return ids;
  });
  const [zipping, setZipping] = useState(false);
  const [, setTick] = useState(0);
  const startRef = useRef<number | null>(null);

  const selectedCount = selected.size;
  const totalAcross = useMemo(() => BANNER_SIZE_GROUPS.reduce((s, g) => s + g.sizes.length, 0), []);

  const total = tiles.length;
  const doneCount = tiles.filter((t) => t.status === "done").length;
  const errorCount = tiles.filter((t) => t.status === "error").length;
  const processed = doneCount + errorCount;
  const isRunning = batchStatus === "batch_running";

  // Drive step transitions off the real batch status.
  useEffect(() => {
    if (isRunning) setPhase("generating");
    else if (total > 0 && processed === total) setPhase((p) => (p === "generating" ? "result" : p));
  }, [isRunning, total, processed]);

  // Tick once a second while generating so the ETA counts down between
  // individual file completions.
  useEffect(() => {
    if (phase !== "generating") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // If the batch state was wiped elsewhere (e.g. a new master), never get
  // stuck on a stale generating/result screen.
  const effectivePhase: Phase = phase !== "select" && total === 0 && !isRunning ? "select" : phase;
  const closable = effectivePhase !== "generating";

  // The select step is large (fills most of the viewport) so the full format
  // catalogue is visible with minimal scrolling. Generation/result stay compact.
  const contentSize =
    effectivePhase === "select"
      ? "h-[88vh] max-h-[90vh] w-[90vw] max-w-6xl"
      : "max-h-[85vh] w-full max-w-2xl";

  const toggleSize = (size: BannerSize) => {
    const k = sizeKey(size);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, size);
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSizes = (sizes: BannerSize[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      sizes.forEach((s) => next.set(sizeKey(s), s));
      return next;
    });
  };

  const clearSizes = (sizes: BannerSize[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      sizes.forEach((s) => next.delete(sizeKey(s)));
      return next;
    });
  };

  // The two web-banner data groups are merged into one "Баннеры для сайта"
  // category that splits into Горизонтальные / Вертикальные subsections.
  type DisplaySubgroup = { title: string; sizes: BannerSize[] };
  type DisplayGroup = {
    id: string;
    title: string;
    subtitle?: string;
    sizes: BannerSize[];
    subgroups?: DisplaySubgroup[];
  };
  const displayGroups = useMemo<DisplayGroup[]>(() => {
    const out: DisplayGroup[] = [];
    let webDone = false;
    for (const g of BANNER_SIZE_GROUPS) {
      if (g.id === "web-horizontal" || g.id === "web-vertical") {
        if (webDone) continue;
        const h = BANNER_SIZE_GROUPS.find((x) => x.id === "web-horizontal");
        const v = BANNER_SIZE_GROUPS.find((x) => x.id === "web-vertical");
        const subgroups: DisplaySubgroup[] = [];
        if (h) subgroups.push({ title: "Горизонтальные", sizes: h.sizes });
        if (v) subgroups.push({ title: "Вертикальные", sizes: v.sizes });
        out.push({
          id: "web-banners",
          title: "Баннеры для сайта",
          subtitle: "Heroes, display-реклама, сайдбары",
          sizes: subgroups.flatMap((s) => s.sizes),
          subgroups,
        });
        webDone = true;
      } else {
        out.push({ id: g.id, title: g.title, subtitle: g.subtitle, sizes: g.sizes });
      }
    }
    return out;
  }, []);

  const renderSize = (s: BannerSize) => {
    const k = sizeKey(s);
    const isOn = selected.has(k);
    return (
      <li key={k}>
        <label
          className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-0.5 transition hover:bg-white/5 ${
            isOn ? "bg-accent-green/10" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={isOn}
            onChange={() => toggleSize(s)}
            className="h-3.5 w-3.5 shrink-0 accent-[color:var(--color-accent-green,#9bff58)]"
          />
          {/* Named sizes: purpose = primary (foreground, lighter weight), pixels
              = secondary (muted, right). Unnamed sizes: the pixels ARE the id. */}
          {s.label ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span
                title={s.label}
                className="min-w-0 truncate text-[13px] font-normal text-foreground"
              >
                {s.label}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {s.w}×{s.h}
              </span>
            </span>
          ) : (
            <span className="flex-1 font-mono text-[13px] tabular-nums text-foreground">
              {s.w}×{s.h}
            </span>
          )}
        </label>
      </li>
    );
  };

  // Selected sizes in catalog order — predictable queue for the user.
  const orderedSelected = (): SelectedSize[] => {
    const ordered: SelectedSize[] = [];
    BANNER_SIZE_GROUPS.forEach((g) =>
      g.sizes.forEach((s) => {
        if (selected.has(sizeKey(s))) ordered.push(s);
      }),
    );
    return ordered;
  };

  const startBatch = () => {
    const ordered = orderedSelected();
    if (ordered.length === 0 || disabled) return;
    startRef.current = Date.now();
    setPhase("generating");
    onLaunch(ordered);
  };

  const regenerate = () => {
    const ordered = orderedSelected();
    if (ordered.length === 0) return;
    startRef.current = Date.now();
    setPhase("generating");
    onLaunch(ordered);
  };

  // Re-run only the sizes that errored (cheaper than a full re-generate).
  const retryFailed = () => {
    const failed = tiles.filter((t) => t.status === "error").map((t) => t.size);
    if (failed.length === 0) return;
    startRef.current = Date.now();
    setPhase("generating");
    onLaunch(failed);
  };

  const backToSelect = () => {
    // Keep the finished tiles in context (harmless — nothing renders them on
    // the main screen); the next run replaces them. Just switch the step so
    // the modal stays open and the current selection is preserved.
    setPhase("select");
  };

  const downloadZip = async () => {
    const ready = tiles.filter((t) => t.status === "done" && t.dataUrl);
    if (ready.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const t of ready) {
        const m = (t.dataUrl as string).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) continue;
        const ext = m[1].toLowerCase() === "image/jpeg" ? "jpg" : m[1].split("/")[1] || "png";
        const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        zip.file(`banner-${t.size.w}x${t.size.h}.${ext}`, bin);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const firstHash = (() => {
        const d = ready[0]?.dataUrl ?? "";
        let h = 0;
        for (let i = 0; i < d.length; i += 257) h = ((h << 5) - h + d.charCodeAt(i)) | 0;
        return Math.abs(h).toString(36);
      })();
      const a = document.createElement("a");
      a.href = url;
      a.download = `banners-${ready.length}sz-${firstHash}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 5000);
    } finally {
      setZipping(false);
    }
  };

  // Live progress + ETA (see file header for the formula).
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const remaining = total - doneCount;
  const etaSecRounded =
    doneCount > 0 && remaining > 0 && startRef.current
      ? Math.max(1, Math.round((Date.now() - startRef.current) / doneCount / 1000 * remaining))
      : null;
  const canZip = doneCount >= 1 && !zipping;

  return (
    <div className="mt-3 flex justify-start">
      {/* Trigger — compact secondary button (primary is the green "Сгенерировать"). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Выбрать ресайзы
        {selectedCount > 0 ? (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-black">
            {selectedCount}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-black/50" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && !closable) return; // no closing mid-generation
          setOpen(v);
        }}
      >
        <DialogContent
          hideClose={!closable}
          onEscapeKeyDown={(e) => {
            if (!closable) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!closable) e.preventDefault();
          }}
          className={`flex ${contentSize} flex-col gap-0 rounded-2xl border border-border bg-panel p-0`}
        >
          {/* ---------- STEP 1: SELECT ---------- */}
          {effectivePhase === "select" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                <DialogTitle className="ds-h2 text-left">
                  Выбрать ресайз
                  {selectedCount > 0 ? (
                    <span className="ml-2 rounded-full bg-accent-green/20 px-2 py-0.5 text-xs font-semibold text-accent-green">
                      {selectedCount} из {totalAcross}
                    </span>
                  ) : null}
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {displayGroups.map((g) => {
                  const isExpanded = expandedGroups.has(g.id);
                  const selectedInGroup = g.sizes.filter((s) => selected.has(sizeKey(s))).length;
                  const allSelected = selectedInGroup === g.sizes.length;
                  return (
                    <div key={g.id} className="rounded-md border border-border/60 bg-background/60">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate font-medium">{g.title}</span>
                            {g.subtitle ? <span className="ds-caption truncate">{g.subtitle}</span> : null}
                          </span>
                          {selectedInGroup > 0 ? (
                            <span className="shrink-0 rounded-full bg-accent-green/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">
                              {selectedInGroup}/{g.sizes.length}
                            </span>
                          ) : null}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (allSelected) clearSizes(g.sizes);
                            else selectAllSizes(g.sizes);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (allSelected) clearSizes(g.sizes);
                            else selectAllSizes(g.sizes);
                          }}
                          className="shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-white/10"
                        >
                          {allSelected ? "снять все" : "выбрать все"}
                        </span>
                      </button>
                      {isExpanded ? (
                        g.subgroups ? (
                          <div className="space-y-2.5 px-3 pb-3 pt-3">
                            {g.subgroups.map((sg) => (
                              <div key={sg.title}>
                                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {sg.title}
                                </p>
                                <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                  {sg.sizes.map(renderSize)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 px-3 pb-3 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {g.sizes.map(renderSize)}
                          </ul>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelected(new Map())}
                    className="ds-btn ds-btn-secondary px-5 py-2.5"
                    disabled={disabled}
                  >
                    Сбросить
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startBatch}
                  disabled={selectedCount === 0 || disabled}
                  className="ds-btn ds-btn-primary px-5 py-2.5"
                >
                  Сгенерировать пакет
                </button>
              </div>
            </>
          ) : null}

          {/* ---------- STEP 2: GENERATING ---------- */}
          {effectivePhase === "generating" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                <DialogTitle className="ds-h2 text-left">Генерация пакета</DialogTitle>
              </DialogHeader>

              <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
                <Loader2 className="h-9 w-9 animate-spin text-accent-green" />
                <div className="w-full max-w-sm">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-accent-green transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-4 text-sm font-medium">
                    Сгенерировано {doneCount} из {total} баннеров
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {etaSecRounded == null
                      ? "Оцениваем оставшееся время…"
                      : `Осталось ~${etaSecRounded} ${ruSeconds(etaSecRounded)}`}
                  </p>
                </div>
              </div>
            </>
          ) : null}

          {/* ---------- STEP 3: RESULT ---------- */}
          {effectivePhase === "result" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                <button
                  type="button"
                  onClick={backToSelect}
                  className="mb-2 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Назад
                </button>
                <DialogTitle className="ds-h2 flex items-center gap-2 text-left">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green text-black">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  Пакет готов
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-3 px-1 text-xs text-muted-foreground">
                  Готово {doneCount} из {total} форматов
                  {errorCount ? ` · ${errorCount} с ошибкой` : ""}
                </p>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                  {tiles.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {t.status === "done" ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green text-black">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="text-xs text-[color:var(--status-error,#ff5c5c)]">✕</span>
                        )}
                      </span>
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="font-mono text-sm tabular-nums">
                          {t.size.w}×{t.size.h}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t.size.label || (t.size.w / t.size.h >= 1 ? "горизонт." : "вертик.")}
                        </span>
                      </div>
                      {t.status === "done" && t.dataUrl ? (
                        <a
                          href={t.dataUrl}
                          download={`banner-${t.size.w}x${t.size.h}.jpg`}
                          className="inline-flex shrink-0 items-center rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                          title="Скачать"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                {errorCount > 0 ? (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-[color:var(--status-error)]/40 px-4 py-2.5 text-sm text-[color:var(--status-error)] transition hover:bg-[color:var(--status-error)]/10"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Повторить упавшие ({errorCount})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={regenerate}
                  className="ds-btn ds-btn-secondary px-5 py-2.5"
                >
                  Сгенерировать заново
                </button>
                <button
                  type="button"
                  onClick={downloadZip}
                  disabled={!canZip}
                  className="ds-btn ds-btn-primary px-5 py-2.5"
                >
                  <FileArchive className="h-4 w-4" />
                  {zipping ? "Архивируем…" : "Скачать ZIP"}
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
