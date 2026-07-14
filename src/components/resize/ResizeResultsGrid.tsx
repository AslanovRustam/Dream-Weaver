// ResizeResultsGrid — tiles for each requested size in the resize batch.
// Mounted as soon as a batch starts; stays visible until the master is
// re-generated (the parent calls batch.reset() to clear it).
//
// Each tile shows: status badge + preview/spinner/error + per-tile
// download. Above the grid there's a "Download all (.zip)" button that
// becomes active when at least two tiles are done.
import { useState } from "react";
import { Download, FileArchive, Loader2, Maximize2, RefreshCw, Sparkles, X } from "lucide-react";
import JSZip from "jszip";

import type { BatchTile } from "@/lib/generation-context";

type Props = {
  tiles: BatchTile[];
  isRunning: boolean;
  onCancel?: () => void;
  onClear?: () => void;
};

export function ResizeResultsGrid({ tiles, isRunning, onCancel, onClear }: Props) {
  const [zipping, setZipping] = useState(false);

  if (tiles.length === 0) return null;

  const doneCount = tiles.filter((t) => t.status === "done").length;
  const errorCount = tiles.filter((t) => t.status === "error").length;
  const runningTile = tiles.find((t) => t.status === "running");
  const canZip = doneCount >= 2 && !zipping;

  // Cost summary: every UNIQUE aspect that differs from the master
  // costs ONE i2i API call (shared by all siblings of that aspect).
  // Tiles of the master's aspect are free client scales. We expose
  // these numbers so the user sees what they actually paid for.
  const bucketTiles = tiles.filter((t) => t.kind === "scale_from_bucket");
  const apiCallCount = new Set(bucketTiles.map((t) => t.size.ratio)).size;
  const freeScaleCount = tiles.length - bucketTiles.length;

  const downloadAll = async () => {
    const ready = tiles.filter((t) => t.status === "done" && t.dataUrl);
    if (ready.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const t of ready) {
        // Strip data: prefix, decode base64 → bytes for the archive.
        const m = (t.dataUrl as string).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) continue;
        const ext = m[1].toLowerCase() === "image/jpeg" ? "jpg" : m[1].split("/")[1] || "png";
        const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        zip.file(`banner-${t.size.w}x${t.size.h}.${ext}`, bin);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      // Build a filename that's unique per CONTENT, not just time —
      // some browsers (Chromium / Opera) suggest the most recent file
      // with a matching name from history, which felt like "cached zip"
      // to the user. We hash the first tile's data so different batches
      // get different filenames even if generated milliseconds apart.
      const firstHash = (() => {
        const d = ready[0]?.dataUrl ?? "";
        let h = 0;
        for (let i = 0; i < d.length; i += 257) {
          h = ((h << 5) - h + d.charCodeAt(i)) | 0;
        }
        return Math.abs(h).toString(36);
      })();
      const a = document.createElement("a");
      a.href = url;
      a.download = `banners-${ready.length}sz-${firstHash}-${Date.now()}.zip`;
      // Force the click to happen on a fully-attached element. Some
      // browsers refuse anonymous a.click() when the node isn't in DOM.
      document.body.appendChild(a);
      a.click();
      // Defer revoking the blob URL until after the browser actually
      // starts the download — revoking too early can give an empty/old
      // file on slower download dialogs.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 5000);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-border bg-background/40 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">Ресайз пакета</span>
          <span className="ml-2 text-muted-foreground">
            {doneCount}/{tiles.length} готово
            {errorCount > 0 ? ` • ${errorCount} с ошибкой` : ""}
            {runningTile ? ` • сейчас ${runningTile.size.w}×${runningTile.size.h}` : ""}
          </span>
          {tiles.length > 0 && (
            <span
              className="ml-2 text-xs text-muted-foreground"
              title="API-вызовы — оплачиваются. Чистые scale из мастера — без API, бесплатно."
            >
              · <Sparkles className="mb-0.5 inline h-3 w-3" />{" "}
              <span className="font-medium tabular-nums">{apiCallCount}</span> API
              {freeScaleCount > 0 && (
                <>
                  {" "}
                  · <Maximize2 className="mb-0.5 inline h-3 w-3" />{" "}
                  <span className="font-medium tabular-nums">{freeScaleCount}</span> без API
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isRunning && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-white/5"
              title="Прервать оставшиеся (текущая закончится)"
            >
              <X className="h-3.5 w-3.5" /> Прервать остальные
            </button>
          ) : null}
          {!isRunning && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-white/5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Сбросить
            </button>
          ) : null}
          <button
            type="button"
            onClick={downloadAll}
            disabled={!canZip}
            className="inline-flex items-center gap-1 rounded-md bg-accent-green px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileArchive className="h-3.5 w-3.5" />
            {zipping ? "Архивируем…" : "Скачать все (.zip)"}
          </button>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map((t) => (
          <ResultTile key={t.id} tile={t} />
        ))}
      </ul>
    </div>
  );
}

function ResultTile({ tile }: { tile: BatchTile }) {
  const { size, status, kind, dataUrl, error } = tile;
  const aspect = size.w / size.h;
  const isApi = kind === "scale_from_bucket";
  // We constrain the visual tile to a max box and let the image inside
  // honour its true aspect ratio.
  const boxStyle: React.CSSProperties = {
    aspectRatio: `${size.w} / ${size.h}`,
  };

  return (
    <li className="overflow-hidden rounded-md border border-border bg-background">
      <div className="relative w-full bg-black" style={boxStyle}>
        {status === "queued" ? (
          <div className="absolute inset-0 flex items-center justify-center ds-micro uppercase tracking-wide text-muted-foreground">
            В очереди
          </div>
        ) : null}
        {status === "running" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Генерация…</span>
          </div>
        ) : null}
        {status === "done" && dataUrl ? (
          <img
            src={dataUrl}
            alt={`${size.w}×${size.h}`}
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
          />
        ) : null}
        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center ds-micro text-destructive">
            <X className="h-4 w-4" />
            <span>{error || "Ошибка"}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
        <div className="flex flex-col leading-tight">
          <span className="font-mono tabular-nums">
            {size.w}×{size.h}
          </span>
          {size.label ? (
            <span className="text-muted-foreground">{size.label}</span>
          ) : (
            <span className="text-muted-foreground">{aspect >= 1 ? "горизонт" : "верт"}</span>
          )}
        </div>
        {status === "done" && dataUrl ? (
          <a
            href={dataUrl}
            download={`banner-${size.w}x${size.h}.jpg`}
            className="rounded-md border border-border p-1.5 hover:bg-white/5"
            title="Скачать"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </li>
  );
}
