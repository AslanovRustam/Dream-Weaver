"use client";

// /history — карточки истории текущего юзера.
//
// Sora-like layout (June 2026 redesign):
//   • CSS-columns masonry grid so each tile keeps its true aspect.
//     A 16:9 card looks wide; a 9:16 card looks tall; a 1:1 stays
//     square. Eyeballing dimensions is now possible from the grid.
//   • Caption block sits BELOW the image, not on top of it. Image
//     content is never obscured by the name/preset/date.
//   • Clicking a card navigates to /history/$cardId — full-page detail,
//     back-able URL, no modal.
//   • The only on-image affordances are tiny: a corner selection
//     checkbox and (when applicable) a "Не в облаке" warning chip.
//     Heart toggle is in the caption row, not floating on the image.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Heart,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, apiJson, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------
// Types mirroring src/lib/history/queries.ts (kept in sync manually).
// ---------------------------------------------------------------------

type HistoryCard = {
  id: string;
  name: string;
  preset_id: string;
  is_favorite: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  deleted_at: string | null;
  hard_delete_after: string | null;
  master: {
    id: string | null;
    image_url: string | null;
    width: number | null;
    height: number | null;
    upload_status: string | null;
  } | null;
  resize_count: number;
};

const PRESETS: Array<{ id: string; label: string }> = [
  { id: "", label: "Все пресеты" },
  { id: "preset1", label: "Широкий угол" },
  { id: "preset2", label: "Слот" },
  { id: "preset3", label: "Событие" },
  { id: "preset4", label: "Спорт" },
];

const PAGE_SIZE = 24;

export default function HistoryPage() {
  useEffect(() => {
    document.title = "История — Dream Weaver Studio";
  }, []);

  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
        <p className="text-sm">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <HistoryBody />
    </div>
  );
}

// ---------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------
function HistoryBody() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [presetId, setPresetId] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [bucket, setBucket] = useState<"active" | "trash">("active");

  const [items, setItems] = useState<HistoryCard[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 300 ms debounce on the search box so each keystroke doesn't fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (mode: "reset" | "append") => {
      setLoading(true);
      setErr("");
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(mode === "reset" ? 0 : offset));
        if (debouncedQ) params.set("q", debouncedQ);
        if (presetId) params.set("preset", presetId);
        if (favoritesOnly) params.set("favorites", "1");
        if (bucket === "trash") params.set("bucket", "trash");

        const data = await apiJson<{
          items: HistoryCard[];
          total: number;
          offset: number;
          limit: number;
        }>(`/api/history/?${params.toString()}`);

        if (mode === "reset") {
          setItems(data.items);
          setOffset(data.items.length);
          setSelected(new Set());
        } else {
          setItems((prev) => [...prev, ...data.items]);
          setOffset((prev) => prev + data.items.length);
        }
        setTotal(data.total);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "Не удалось загрузить историю");
      } finally {
        setLoading(false);
      }
    },
    [debouncedQ, presetId, favoritesOnly, bucket, offset],
  );

  // Reset whenever filters change.
  useEffect(() => {
    void load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, presetId, favoritesOnly, bucket]);

  // Infinite scroll via IntersectionObserver on a sentinel div.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && offset < total) {
          void load("append");
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, offset, total, load]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCardChanged = (updated: HistoryCard) => {
    setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 pb-32">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="ds-h1">История</h1>
          <p className="text-sm text-muted-foreground">
            {total} {pluralRu(total, "карточка", "карточки", "карточек")}
            {bucket === "trash" ? " (в корзине)" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/banner">К генерации</Link>
          </Button>
        </div>
      </header>

      <FilterBar
        q={q}
        onQ={setQ}
        presetId={presetId}
        onPreset={setPresetId}
        favoritesOnly={favoritesOnly}
        onFavorites={setFavoritesOnly}
        bucket={bucket}
        onBucket={setBucket}
      />

      {err ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[color:var(--status-error)]/40 bg-[color:var(--status-error)]/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--status-error)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Не удалось загрузить историю</p>
            <p className="truncate text-xs text-muted-foreground">{err}</p>
          </div>
          <button
            type="button"
            onClick={() => void load("reset")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Повторить
          </button>
          {/сесси|войдите/i.test(err) ? (
            <Link
              href="/login"
              className="inline-flex shrink-0 items-center rounded-lg bg-accent-green px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              Войти
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Date-grouped masonry. We split the (already-sorted-by-
          last_activity_at) list into buckets of "Сегодня", "Вчера", and
          DD.MM.YYYY, then render each bucket as its own CSS-columns
          grid. This makes the chronology readable without breaking the
          aspect-correct masonry that lives inside each bucket. */}
      <div className="mt-5 space-y-8">
        {groupByDay(items).map(({ key, label, group }) => (
          <section key={key}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{label}</h2>
            <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
              {group.map((card) => (
                <HistoryCardTile
                  key={card.id}
                  card={card}
                  selected={selected.has(card.id)}
                  onToggleSelect={() => toggleSelect(card.id)}
                  onChanged={handleCardChanged}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {items.length === 0 && !loading && !err && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          {bucket === "trash" ? (
            <>
              <Trash2 className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Корзина пуста</p>
            </>
          ) : debouncedQ || presetId || favoritesOnly ? (
            <>
              <Search className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
                <p className="text-sm text-muted-foreground">Измените поиск или фильтры.</p>
              </div>
            </>
          ) : (
            <>
              <ImageIcon className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Пока ничего нет</p>
                <p className="text-sm text-muted-foreground">Создайте первый баннер на главной.</p>
              </div>
              <Button asChild size="sm">
                <Link href="/banner">Создать баннер</Link>
              </Button>
            </>
          )}
        </div>
      )}

      <div ref={sentinelRef} className="h-px" />

      {loading && (
        <div className="mt-4 flex justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onZip={() => downloadBulkZip(Array.from(selected))}
        onDelete={async () => {
          if (!confirm(`Переместить ${selected.size} карточек в корзину?`)) return;
          try {
            await apiJson("/api/history/bulk-delete", {
              method: "POST",
              json: { card_ids: Array.from(selected) },
            });
            const ids = new Set(selected);
            setItems((prev) => prev.filter((c) => !ids.has(c.id)));
            setSelected(new Set());
            setTotal((t) => Math.max(0, t - ids.size));
          } catch (e) {
            alert(e instanceof ApiError ? e.message : "Не удалось удалить");
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------
function FilterBar({
  q,
  onQ,
  presetId,
  onPreset,
  favoritesOnly,
  onFavorites,
  bucket,
  onBucket,
}: {
  q: string;
  onQ: (v: string) => void;
  presetId: string;
  onPreset: (v: string) => void;
  favoritesOnly: boolean;
  onFavorites: (v: boolean) => void;
  bucket: "active" | "trash";
  onBucket: (v: "active" | "trash") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative grow min-w-[220px]">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Поиск по названию или текстам формы…"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>
      <select
        className="h-11 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:border-accent-green"
        value={presetId}
        onChange={(e) => onPreset(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={favoritesOnly}
          onChange={(e) => onFavorites(e.target.checked)}
        />
        <Star className="h-4 w-4" /> Избранное
      </label>
      <div className="ml-auto flex rounded-md border p-0.5 text-sm">
        <button
          type="button"
          className={
            "rounded px-3 py-1 " +
            (bucket === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground")
          }
          onClick={() => onBucket("active")}
        >
          Активные
        </button>
        <button
          type="button"
          className={
            "rounded px-3 py-1 " +
            (bucket === "trash" ? "bg-primary text-primary-foreground" : "text-muted-foreground")
          }
          onClick={() => onBucket("trash")}
        >
          Корзина
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tile — aspect-correct, caption below the image
// ---------------------------------------------------------------------
function HistoryCardTile({
  card,
  selected,
  onToggleSelect,
  onChanged,
}: {
  card: HistoryCard;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: (c: HistoryCard) => void;
}) {
  const [favBusy, setFavBusy] = useState(false);

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFavBusy(true);
    try {
      await apiJson(`/api/history/${card.id}`, {
        method: "PATCH",
        json: { is_favorite: !card.is_favorite },
      });
      onChanged({ ...card, is_favorite: !card.is_favorite });
    } catch (err) {
      console.error(err);
    } finally {
      setFavBusy(false);
    }
  };

  const w = card.master?.width ?? 1;
  const h = card.master?.height ?? 1;
  const aspectStyle = { aspectRatio: `${w} / ${h}` };

  const presetLabel = PRESETS.find((p) => p.id === card.preset_id)?.label ?? card.preset_id;

  return (
    // mb-4 spaces tiles vertically because CSS-columns gap only does
    // horizontal gutters. break-inside-avoid keeps a tile from splitting
    // across two columns mid-render.
    <div className="mb-4 break-inside-avoid">
      <Link
        href={`/history/${card.id}`}
        className={
          "group block overflow-hidden rounded-lg border bg-card transition " +
          (selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30")
        }
      >
        {/* Image — exact aspect ratio of the master so the eye reads
            the proportions at a glance. */}
        <div className="relative bg-muted/40" style={aspectStyle}>
          {card.master?.image_url ? (
            <img
              src={card.master.image_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">
              {card.master?.upload_status === "pending"
                ? "Загружается на хранилище…"
                : card.master?.upload_status === "failed"
                  ? "Не загружено"
                  : "Нет файла"}
            </div>
          )}
          {/* Only on-image control: selection checkbox. Small, top-left,
              translucent so the image content stays the visual focus. */}
          <button
            type="button"
            aria-label={selected ? "Убрать из выделения" : "Выделить"}
            className={
              "absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border text-xs " +
              (selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/40 bg-background/60 text-foreground opacity-0 backdrop-blur transition group-hover:opacity-100")
            }
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleSelect();
            }}
          >
            {selected ? "✓" : ""}
          </button>
        </div>

        {/* Caption block — BELOW the image, never overlapping it. */}
        <div className="space-y-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium leading-tight">{card.name}</p>
            <button
              type="button"
              disabled={favBusy}
              aria-label={card.is_favorite ? "Убрать из избранного" : "В избранное"}
              onClick={toggleFav}
              className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <Heart
                className={"h-4 w-4 " + (card.is_favorite ? "fill-rose-500 text-rose-500" : "")}
              />
            </button>
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {card.master?.width && card.master?.height
                ? `${card.master.width}×${card.master.height}`
                : "—"}
            </span>
            <span>·</span>
            <span>{presetLabel}</span>
            {card.resize_count > 0 && (
              <>
                <span>·</span>
                <span>
                  +{card.resize_count} ресайз{pluralFormShort(card.resize_count)}
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{formatRelative(card.last_activity_at)}</p>
          {card.master?.upload_status === "failed" && (
            <p className="inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-500">
              Не в облаке
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------
// Bulk action bar (sticky bottom)
// ---------------------------------------------------------------------
function BulkActionBar({
  count,
  onClear,
  onZip,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onZip: () => void;
  onDelete: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
        <span className="text-sm">Выделено: {count}</span>
        <Button size="sm" variant="outline" onClick={onZip}>
          <Download className="mr-1 h-4 w-4" /> Скачать ZIP
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          <Trash2 className="mr-1 h-4 w-4" /> Удалить
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          ✕
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function downloadBulkZip(cardIds: string[]) {
  if (cardIds.length === 0) return;
  try {
    const res = await apiFetch("/api/history/bulk-zip", {
      method: "POST",
      json: { card_ids: cardIds },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dream-weaver_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e instanceof Error ? e.message : "Не удалось скачать архив");
  }
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// "ресайз" / "ресайза" / "ресайзов"
function pluralFormShort(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "а";
  return "ов";
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} дн назад`;
  return formatDateOnly(d);
}

/** Day-bucket key in YYYY-MM-DD (used to group cards). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Display-friendly DD.MM.YYYY string. */
function formatDateOnly(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}.${m}.${y}`;
}

interface DayGroup {
  key: string;
  label: string;
  group: HistoryCard[];
}

/**
 * Bucket cards by the day of their `last_activity_at`, in display
 * order (newest first). The relabelling for "Сегодня" / "Вчера" works
 * off the user's local clock — same convention as Gmail / Sora.
 */
function groupByDay(cards: HistoryCard[]): DayGroup[] {
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  const order: string[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const c of cards) {
    const d = new Date(c.last_activity_at);
    const k = dayKey(d);
    if (!byKey.has(k)) {
      const label = k === todayKey ? "Сегодня" : k === yesterdayKey ? "Вчера" : formatDateOnly(d);
      byKey.set(k, { key: k, label, group: [] });
      order.push(k);
    }
    byKey.get(k)!.group.push(c);
  }
  return order.map((k) => byKey.get(k)!);
}
