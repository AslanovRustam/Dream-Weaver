// ResizeBatchPanel — collapsible picker that lets the user select target
// pixel sizes for a resize batch. Shown under the main "Сгенерировать"
// button only when there is an approved master banner to adapt from.
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

export type SelectedSize = BannerSize;

type Props = {
  disabled?: boolean;
  /**
   * Aspect ratio of the existing master. Sizes with this ratio skip the
   * i2i call (they're cropped directly from the master) — so the cost
   * counter must not count this ratio as a "unique" billable aspect.
   */
  masterRatio?: string;
  /** Called when "Сгенерировать пакет" is clicked. */
  onLaunch: (sizes: SelectedSize[]) => void;
};

export function ResizeBatchPanel({ disabled, masterRatio, onLaunch }: Props) {
  const [open, setOpen] = useState(false);
  // sizeKey -> size
  const [selected, setSelected] = useState<Map<string, SelectedSize>>(new Map());
  // Which use-case groups are expanded inside the panel.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;

  const totalAcross = useMemo(() => BANNER_SIZE_GROUPS.reduce((s, g) => s + g.sizes.length, 0), []);

  // Number of UNIQUE aspect ratios in the current selection MINUS the
  // master's aspect (if present) — that one is free, derived from the
  // existing master via crop without a new i2i call.
  const billableAspects = useMemo(() => {
    const set = new Set<string>();
    selected.forEach((s) => set.add(s.ratio));
    if (masterRatio) set.delete(masterRatio);
    return set.size;
  }, [selected, masterRatio]);

  const hasFreeMasterCrops = useMemo(() => {
    if (!masterRatio) return false;
    for (const s of selected.values()) if (s.ratio === masterRatio) return true;
    return false;
  }, [selected, masterRatio]);

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

  const selectAllInGroup = (id: string) => {
    const g = BANNER_SIZE_GROUPS.find((x) => x.id === id);
    if (!g) return;
    setSelected((prev) => {
      const next = new Map(prev);
      g.sizes.forEach((s) => next.set(sizeKey(s), s));
      return next;
    });
  };

  const clearGroup = (id: string) => {
    const g = BANNER_SIZE_GROUPS.find((x) => x.id === id);
    if (!g) return;
    setSelected((prev) => {
      const next = new Map(prev);
      g.sizes.forEach((s) => next.delete(sizeKey(s)));
      return next;
    });
  };

  const launch = () => {
    if (selectedCount === 0 || disabled) return;
    // Preserve the order in which sizes appear in the catalog so the
    // queue is predictable for the user.
    const ordered: SelectedSize[] = [];
    BANNER_SIZE_GROUPS.forEach((g) => {
      g.sizes.forEach((s) => {
        const k = sizeKey(s);
        if (selected.has(k)) ordered.push(s);
      });
    });
    onLaunch(ordered);
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40">
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

      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          {BANNER_SIZE_GROUPS.map((g) => {
            const isExpanded = expandedGroups.has(g.id);
            const selectedInGroup = g.sizes.filter((s) => selected.has(sizeKey(s))).length;
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
                      {g.subtitle ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {g.subtitle}
                        </span>
                      ) : null}
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
                      if (selectedInGroup === g.sizes.length) clearGroup(g.id);
                      else selectAllInGroup(g.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedInGroup === g.sizes.length) clearGroup(g.id);
                      else selectAllInGroup(g.id);
                    }}
                    className="shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-white/10"
                  >
                    {selectedInGroup === g.sizes.length ? "снять все" : "выбрать все"}
                  </span>
                </button>
                {isExpanded ? (
                  <ul className="grid gap-1 px-3 pb-3 pt-1 sm:grid-cols-2">
                    {g.sizes.map((s) => {
                      const k = sizeKey(s);
                      const isOn = selected.has(k);
                      return (
                        <li key={k}>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5 ${
                              isOn ? "bg-accent-green/10" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleSize(s)}
                              className="h-3.5 w-3.5 accent-[color:var(--color-accent-green,#9bff58)]"
                            />
                            <span className="font-mono text-xs tabular-nums">
                              {s.w}×{s.h}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{s.ratio}</span>
                            {s.label ? (
                              <span className="truncate text-xs text-muted-foreground">
                                — {s.label}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Выбрано <span className="text-foreground">{selectedCount}</span> размер(ов). Генераций
              потребуется <span className="text-foreground">{billableAspects}</span>{" "}
              {billableAspects === 1
                ? "(одна i2i по новой пропорции)"
                : "(по одной i2i на новую пропорцию)"}
              {hasFreeMasterCrops ? (
                <>
                  {" "}
                  · размеры в пропорции мастера ({masterRatio}) получаются бесплатно из текущей
                  картинки.
                </>
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
