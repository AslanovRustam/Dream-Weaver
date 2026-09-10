"use client";

// "Найти по сайту" — a small reusable field: given the brand's website URL/
// domain directly (no name search — deliberately not guessing), it extracts
// the logo and reads off an accent colour + visual-style descriptor from it
// (see /api/brand-lookup for the full pipeline). Drop this next to any
// generator's own Бренд/Логотип fields — each one owns its own brand state
// (there's no single global "settings" screen for it), so this component
// only reports what it found via onFound; the caller decides what to do
// with it.
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { lookupBrand, BrandLookupError, type BrandLookupResult } from "@/lib/brandLookup";

export type BrandLookupFound = {
  brandName: string;
  /** Already rasterized to a ≤256px square PNG data URL — ready to use as-is. */
  logoDataUrl: string;
  accentHex: string;
  style: string;
  palette: string[];
  isCleanLogo: boolean;
};

/** Normalise a fetched image to a small square-capped PNG data URL (keeps a
 *  transparent favicon/icon transparent, unlike a forced-white-background
 *  JPEG) before it's handed to the caller. */
function rasterizeToPng(src: string, maxPx = 256): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth || maxPx;
      const ih = img.naturalHeight || maxPx;
      const scale = Math.min(1, maxPx / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function BrandLookup({
  onFound,
  className = "",
}: {
  onFound: (found: BrandLookupFound) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastStyle, setLastStyle] = useState("");
  const [lastPalette, setLastPalette] = useState<string[]>([]);

  const run = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    try {
      const r: BrandLookupResult = await lookupBrand(q);
      const logoDataUrl = await rasterizeToPng(r.logo_data_url);
      setLastStyle(r.style);
      setLastPalette(r.palette);
      onFound({
        brandName: r.brand_name,
        logoDataUrl,
        accentHex: r.accent_color_hex,
        style: r.style,
        palette: r.palette,
        isCleanLogo: r.is_clean_logo,
      });
      toast[r.is_clean_logo ? "success" : "warning"](
        r.is_clean_logo
          ? "Бренд найден — лого и название заполнены"
          : "Похоже на маркетинговое изображение, не чистый логотип — проверьте результат",
      );
    } catch (e) {
      setError(
        e instanceof BrandLookupError ? e.message : "Не удалось найти бренд — загрузите логотип вручную ниже",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-foreground/70">
        Найти по сайту бренда
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="Например, grandcasino.com"
          className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={!query.trim() || loading}
          aria-label="Найти"
          title="Найти логотип и цвета на сайте"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground/70 transition hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-[color:var(--status-error,#f87171)]">{error}</p>
      ) : lastStyle ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          {lastPalette.map((hex, i) => (
            <span
              key={i}
              className="h-3 w-3 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: hex }}
            />
          ))}
          <p className="ds-micro text-foreground/60">{lastStyle}</p>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-foreground/50">
          Укажите адрес сайта — ИИ вытащит логотип и определит фирменные цвета.
        </p>
      )}
    </div>
  );
}
