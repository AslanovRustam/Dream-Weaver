// ResizeBatchPanel — collapsible picker that lets the user select target
// pixel sizes for a resize batch. Shown under the main "Сгенерировать"
// button only when there is an approved master banner to adapt from.
//
// Groups are organised by USE CASE (social posts / Stories / YouTube / …),
// not by raw aspect ratio. Each size carries its own ratio so the batch
// runner can later bucket them into one i2i call per unique aspect.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-white/5"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Выбрать ресайз
          {selectedCount > 0 ? (
            <span className="rounded-full bg-accent-green/20 px-2 py-0.5 text-xs font-semibold text-accent-green">
              {selectedCount} из {totalAcross}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {selectedCount > 0 ? "размеры выбраны" : "развернуть"}
        </span>
      </button>

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
            </div>
            <div className="flex gap-2">
              {selectedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected(new Map())}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-white/5"
                  disabled={disabled}
                >
                  Сбросить
                </button>
              ) : null}
              <button
                type="button"
                onClick={launch}
                disabled={selectedCount === 0 || disabled}
                className="rounded-full bg-accent-green px-4 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Сгенерировать пакет
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
