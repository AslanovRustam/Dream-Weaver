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
  AlertTriangle,
  Check,
  ChevronDown,
  ArrowLeft,
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";

import { BANNER_SIZE_GROUPS, sizeKey, type BannerSize } from "@/lib/bannerSizes";
import { resizeCredits, formatCredits } from "@/lib/credit-estimate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizeLightbox } from "./ResizeLightbox";
import type { BatchTile, GenerationStatus } from "@/lib/generation-context";

export type SelectedSize = BannerSize;

/** Russian plural: plural(1,"формат","формата","форматов") → "формат". */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

type Props = {
  disabled?: boolean;
  masterRatio?: string;
  /** Starts a batch for the given sizes (parent supplies the master image). */
  onLaunch: (sizes: SelectedSize[]) => void;
  /** Live batch tiles from the generation context. */
  tiles: BatchTile[];
  /** Live generation status from the context. */
  batchStatus: GenerationStatus;
  /** Re-run generation for a single tile in place. */
  onRegenerateTile?: (id: string) => void | Promise<void>;
  /** Remove a single tile from the batch. */
  onRemoveTile?: (id: string) => void;
  /** Abort the running batch (stops queued/in-flight tiles). */
  onCancel?: () => void;
};

type Phase = "select" | "generating" | "result";

function ruSeconds(n: number) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "секунда";
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return "секунды";
  return "секунд";
}

export function ResizeBatchPanel({
  disabled,
  onLaunch,
  tiles,
  batchStatus,
  onRegenerateTile,
  onRemoveTile,
  onCancel,
}: Props) {
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
  // Frozen estimate of the TOTAL batch duration. Refreshed only when a tile
  // actually finishes (processed changes) — never on the 1s tick — so the ETA
  // counts DOWN between completions instead of inflating with wall-clock.
  const estTotalMsRef = useRef<number | null>(null);
  const lastProcessedRef = useRef(0);
  // Which finished tile is open in the fullscreen viewer (null = none). Kept
  // separate from the modal so opening it never resets the batch/scroll.
  const [viewTile, setViewTile] = useState<BatchTile | null>(null);
  // Tile pending a delete confirmation (null = no confirm shown).
  const [confirmDelete, setConfirmDelete] = useState<BatchTile | null>(null);

  const selectedCount = selected.size;
  const totalAcross = useMemo(() => BANNER_SIZE_GROUPS.reduce((s, g) => s + g.sizes.length, 0), []);
  // Price is charged per SELECTED FORMAT (each resize costs the same flat 1.5 кр).
  const packageCredits = useMemo(() => resizeCredits(selected.size), [selected]);

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

  // Refresh the total-duration estimate ONLY when a tile finishes. Extrapolate
  // from the average time per completed tile: estTotal ≈ (elapsed / processed) × total.
  // Between completions this stays frozen, so the ETA below counts down.
  useEffect(() => {
    if (phase !== "generating" || !startRef.current) return;
    if (processed > 0 && processed !== lastProcessedRef.current) {
      lastProcessedRef.current = processed;
      const elapsed = Date.now() - startRef.current;
      estTotalMsRef.current = (elapsed / processed) * total;
    }
  }, [processed, total, phase]);

  // If the batch was wiped mid-run (e.g. a new master), don't get stuck on a
  // stale "generating" screen. On the RESULT screen we deliberately stay put
  // even at zero tiles (the user deleted the last format) and show an explicit
  // empty state instead of silently snapping back to the format picker.
  const effectivePhase: Phase =
    phase === "generating" && total === 0 && !isRunning ? "select" : phase;
  const closable = effectivePhase !== "generating";

  // The select step is large (fills most of the viewport) so the full format
  // catalogue is visible with minimal scrolling. Generation/result stay compact.
  // On phones (<sm) every step is a full-screen sheet; from sm up it's the
  // centred card sized per step.
  const contentSize =
    effectivePhase === "select"
      ? "sm:h-[88vh] sm:max-h-[90vh] sm:w-[90vw] sm:max-w-6xl"
      : "sm:max-h-[85vh] sm:w-full sm:max-w-2xl";
  // Full-screen on mobile: overrides Radix's centred/translated positioning.
  const mobileFullscreen =
    "max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none";

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
          className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-0.5 transition hover:bg-white/5 max-sm:min-h-11 ${
            isOn ? "bg-accent-green/10" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={isOn}
            onChange={() => toggleSize(s)}
            className="h-3.5 w-3.5 shrink-0 accent-[color:var(--color-accent-green,#9bff58)] max-sm:h-5 max-sm:w-5"
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
    estTotalMsRef.current = null;
    lastProcessedRef.current = 0;
    setPhase("generating");
    onLaunch(ordered);
  };

  const regenerate = () => {
    const ordered = orderedSelected();
    if (ordered.length === 0) return;
    startRef.current = Date.now();
    estTotalMsRef.current = null;
    lastProcessedRef.current = 0;
    setPhase("generating");
    onLaunch(ordered);
  };

  // Re-run only the sizes that errored (cheaper than a full re-generate).
  const retryFailed = () => {
    const failed = tiles.filter((t) => t.status === "error").map((t) => t.size);
    if (failed.length === 0) return;
    startRef.current = Date.now();
    estTotalMsRef.current = null;
    lastProcessedRef.current = 0;
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
      toast.success(`Скачали ZIP · ${ready.length} ${plural(ready.length, "формат", "формата", "форматов")}`);
    } catch {
      toast.error("Не удалось собрать ZIP. Попробуйте ещё раз.");
    } finally {
      setZipping(false);
    }
  };

  // Live progress + ETA. Count terminal tiles (done + error), not just done —
  // otherwise an errored bucket never advances the bar, so it stalls (e.g. at
  // 70%) and then the modal jumps straight to the result once everything is
  // terminal, never visually reaching 100%.
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const remaining = total - processed;
  // Count DOWN from the frozen total estimate: eta = estTotal − elapsed. Never
  // grows between completions (only the tick advances elapsed, shrinking eta).
  const etaSecRounded =
    remaining > 0 && startRef.current && estTotalMsRef.current != null
      ? Math.max(1, Math.round((estTotalMsRef.current - (Date.now() - startRef.current)) / 1000))
      : null;
  const canZip = doneCount >= 1 && !zipping;

  return (
    <div className="mt-3 flex justify-start max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:mt-4">
      {/* Trigger — compact secondary button (primary is the green "Сгенерировать").
          On mobile it becomes the full-width sticky CTA for this screen. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-12 max-lg:w-full max-lg:text-base max-lg:shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
      >
        Выбрать ресайзы
        {selectedCount > 0 ? (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-on-accent">
            {selectedCount}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-on-accent/50" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          // Never close the batch modal while the fullscreen viewer or a delete
          // confirmation is open (Escape/click there must only dismiss that
          // layer), or mid-generation.
          if (!v && (viewTile || confirmDelete || !closable)) return;
          setOpen(v);
        }}
      >
        <DialogContent
          // No close "✕" anywhere in the resize flow — every step exits via its
          // own "Назад" (select → back to banner, result → back to select).
          // Generating step already hides it (not closable).
          hideClose={!closable || effectivePhase === "select" || effectivePhase === "result"}
          onEscapeKeyDown={(e) => {
            if (viewTile || confirmDelete || !closable) {
              e.preventDefault();
              if (confirmDelete) setConfirmDelete(null);
            }
          }}
          onInteractOutside={(e) => {
            if (viewTile || confirmDelete || !closable) e.preventDefault();
          }}
          className={`flex ${contentSize} ${mobileFullscreen} flex-col gap-0 rounded-2xl border border-border bg-panel p-0`}
        >
          {/* ---------- STEP 1: SELECT ---------- */}
          {effectivePhase === "select" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4 max-sm:px-3">
                {/* "Назад" closes the picker back to the banner — same single-exit
                    pattern as the other screens (the "✕" is hidden). */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mx-2 mb-3 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Назад
                </button>
                <DialogTitle className="ds-h4 text-left">
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
                            <span className="shrink-0 rounded-full bg-accent-green/20 px-1.5 py-0.5 ds-micro font-semibold text-accent-green">
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
                          className="shrink-0 rounded px-2 py-0.5 text-sm text-muted-foreground hover:bg-white/10"
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

              {selectedCount === 0 ? (
                <p className="shrink-0 px-4 pt-2 text-center text-xs text-muted-foreground">
                  Выберите хотя бы один формат, чтобы продолжить
                </p>
              ) : null}
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 max-sm:justify-stretch">
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelected(new Map())}
                    className="ds-btn ds-btn-secondary px-5 py-2.5 max-sm:min-h-12 max-sm:flex-1"
                    disabled={disabled}
                  >
                    Сбросить
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startBatch}
                  disabled={selectedCount === 0 || disabled}
                  className="ds-btn ds-btn-primary px-5 py-2.5 max-sm:min-h-12 max-sm:flex-[2]"
                >
                  Сгенерировать пакет
                  {selectedCount > 0 ? ` · ${formatCredits(packageCredits)}` : ""}
                </button>
              </div>
            </>
          ) : null}

          {/* ---------- STEP 2: GENERATING ---------- */}
          {effectivePhase === "generating" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                <DialogTitle className="ds-h4 text-left">Генерация пакета</DialogTitle>
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
                    Сгенерировано {doneCount} из {total} форматов
                    {errorCount ? ` · ${errorCount} с ошибкой` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {etaSecRounded == null
                      ? "Оцениваем оставшееся время…"
                      : `Осталось ~${etaSecRounded} ${ruSeconds(etaSecRounded)}`}
                  </p>
                  {onCancel ? (
                    <button
                      type="button"
                      onClick={() => onCancel()}
                      className="ds-btn ds-btn-secondary mt-6 px-5 py-2.5 max-sm:min-h-12 max-sm:w-full"
                    >
                      Отменить
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {/* ---------- STEP 3: RESULT ---------- */}
          {effectivePhase === "result" ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4 max-sm:px-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={backToSelect}
                    className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Назад
                  </button>
                  {/* Direct exit from the result — the natural end of the flow.
                      "Назад" only steps back to the format picker; without this
                      the user had to go back then close to leave. */}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="-mr-2 inline-flex min-h-11 w-fit items-center rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-white/5"
                  >
                    Готово
                  </button>
                </div>
                <DialogTitle className="ds-h4 flex items-center gap-2 text-left">
                  {total === 0 ? (
                    <>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Trash2 className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                      Все форматы удалены
                    </>
                  ) : doneCount === 0 ? (
                    <>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--status-error)] text-white">
                        <AlertTriangle className="h-3 w-3" strokeWidth={3} />
                      </span>
                      Не удалось создать пакет
                    </>
                  ) : errorCount > 0 ? (
                    <>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--status-premium)] text-on-accent">
                        <AlertTriangle className="h-3 w-3" strokeWidth={3} />
                      </span>
                      Пакет готов частично
                    </>
                  ) : (
                    <>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green text-on-accent">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      Пакет готов
                    </>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {total === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm font-medium text-foreground">Вы удалили все форматы</p>
                    <p className="text-xs text-muted-foreground">
                      Нажмите «Назад», чтобы выбрать форматы и создать пакет заново.
                    </p>
                  </div>
                ) : (
                  <>
                <p className="mb-3 px-1 text-xs text-muted-foreground">
                  Готово {doneCount} из {total} форматов
                  {errorCount ? ` · ${errorCount} с ошибкой` : ""}
                </p>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                  {tiles.map((t) => {
                    const running = t.status === "running";
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center gap-3 px-3 py-2.5 transition ${
                          running ? "opacity-70" : ""
                        }`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          {running ? (
                            <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
                          ) : t.status === "done" ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green text-on-accent">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          ) : (
                            <span
                              className="text-xs text-[color:var(--status-error,#ff5c5c)]"
                              title={t.error || "Ошибка генерации"}
                            >
                              ✕
                            </span>
                          )}
                        </span>
                        <div className="flex min-w-0 flex-1 items-baseline gap-2">
                          <span className="font-mono text-sm tabular-nums">
                            {t.size.w}×{t.size.h}
                          </span>
                          {t.status === "error" ? (
                            <span
                              className="truncate text-xs text-[color:var(--status-error)]"
                              title={t.error || "Ошибка генерации"}
                            >
                              {t.error || "Ошибка генерации"}
                            </span>
                          ) : (
                            <span className="truncate text-xs text-muted-foreground">
                              {t.size.label || (t.size.w / t.size.h >= 1 ? "горизонт." : "вертик.")}
                            </span>
                          )}
                        </div>

                        {running ? (
                          <span className="shrink-0 text-xs text-muted-foreground">Генерация…</span>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {t.status === "done" && t.dataUrl ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setViewTile(t)}
                                  className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:h-11 max-sm:w-11"
                                  title="Просмотреть"
                                  aria-label={`Просмотреть ${t.size.w}×${t.size.h}`}
                                >
                                  <Eye className="h-3.5 w-3.5 max-sm:h-5 max-sm:w-5" />
                                </button>
                                {/* Per-tile download — visible on desktop; on
                                    mobile it moves into the "⋯" menu to save row
                                    width. */}
                                <a
                                  href={t.dataUrl}
                                  download={`banner-${t.size.w}x${t.size.h}.jpg`}
                                  onClick={() => toast.success(`Скачали формат ${t.size.w}×${t.size.h}`)}
                                  className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:hidden"
                                  title="Скачать"
                                  aria-label={`Скачать ${t.size.w}×${t.size.h}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </>
                            ) : null}

                            {/* "⋯" menu — round dark translucent, matching the
                                master-preview overflow button. */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Ещё — ${t.size.w}×${t.size.h}`}
                                  title="Ещё"
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 max-sm:h-11 max-sm:w-11"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                sideOffset={8}
                                className="w-52 rounded-xl border-border bg-popover p-1.5 text-foreground max-sm:w-56"
                              >
                                {/* Download lives here on mobile only (the row
                                    button is hidden < sm). Neutral action first. */}
                                {t.status === "done" && t.dataUrl ? (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const a = document.createElement("a");
                                      a.href = t.dataUrl as string;
                                      a.download = `banner-${t.size.w}x${t.size.h}.jpg`;
                                      document.body.appendChild(a);
                                      a.click();
                                      a.remove();
                                      toast.success(`Скачали формат ${t.size.w}×${t.size.h}`);
                                    }}
                                    className="gap-2.5 rounded-lg px-2.5 py-2 text-base focus:bg-white/10 focus:text-foreground sm:hidden max-sm:py-3"
                                  >
                                    <Download className="h-5 w-5 text-muted-foreground" />
                                    Скачать
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  onClick={() => {
                                    toast(`Перегенерируем формат ${t.size.w}×${t.size.h}…`);
                                    void onRegenerateTile?.(t.id);
                                  }}
                                  className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
                                >
                                  <RefreshCw className="h-4 w-4 text-muted-foreground max-sm:h-5 max-sm:w-5" />
                                  Перегенерировать
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem
                                  onClick={() => setConfirmDelete(t)}
                                  className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)] max-sm:py-3 max-sm:text-base"
                                >
                                  <Trash2 className="h-4 w-4 max-sm:h-5 max-sm:w-5" />
                                  Удалить
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                  </>
                )}
              </div>

              {total === 0 ? null : (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 max-sm:flex-wrap max-sm:justify-stretch">
                {errorCount > 0 ? (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="mr-auto inline-flex items-center justify-center gap-1.5 rounded-md border border-[color:var(--status-error)]/40 px-4 py-2.5 text-sm text-[color:var(--status-error)] transition hover:bg-[color:var(--status-error)]/10 max-sm:min-h-12 max-sm:w-full"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Повторить упавшие ({errorCount})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={regenerate}
                  className="ds-btn ds-btn-secondary px-5 py-2.5 max-sm:min-h-12 max-sm:flex-1"
                >
                  Сгенерировать заново
                </button>
                <button
                  type="button"
                  onClick={downloadZip}
                  disabled={!canZip}
                  className="ds-btn ds-btn-primary px-5 py-2.5 max-sm:min-h-12 max-sm:flex-[2]"
                >
                  <FileArchive className="h-4 w-4" />
                  {zipping ? "Архивируем…" : "Скачать ZIP"}
                </button>
              </div>
              )}
            </>
          ) : null}

          {/* Delete confirmation — an in-modal overlay so it never tears down
              the batch modal; only removes the one card on confirm. */}
          {confirmDelete ? (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setConfirmDelete(null)}
            >
              <div
                className="w-full max-w-xs rounded-2xl border border-border bg-panel p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="ds-h4 mb-1">Удалить этот формат из пакета?</p>
                <p className="mb-4 text-xs text-muted-foreground">
                  {confirmDelete.size.w}×{confirmDelete.size.h}
                  {confirmDelete.size.label ? ` · ${confirmDelete.size.label}` : ""}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="ds-btn ds-btn-secondary px-4 py-2 text-sm"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { w, h } = confirmDelete.size;
                      onRemoveTile?.(confirmDelete.id);
                      setConfirmDelete(null);
                      toast.success(`Формат ${w}×${h} удалён из пакета`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--status-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {viewTile ? (
        <ResizeLightbox tile={viewTile} onClose={() => setViewTile(null)} />
      ) : null}
    </div>
  );
}
