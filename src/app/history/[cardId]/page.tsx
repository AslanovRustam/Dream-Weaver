"use client";

// /history/$cardId — full-page card detail.
//
// Replaces the old modal dialog with a real route so we get a back-able
// URL, deep links from /admin and shared screenshots, and the full
// viewport for the hero image. Layout mirrors Sora's per-prompt page:
//   • Sticky top bar with name (inline rename), action buttons.
//   • Hero strip with the master image at its natural aspect ratio,
//     capped at ~70vh so it fits even on portrait masters.
//   • Below: resizes grouped in an aspect-respecting grid (masonry-ish
//     via CSS columns) so a 9:16 tile looks tall and a 16:9 tile looks
//     wide, no uniform square forcing.
import { useEffect, useState } from "react";
import { Download, Heart, Loader2, Pencil, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, apiJson, ApiError } from "@/lib/api-client";

type GenerationItem = {
  id: string;
  is_master: boolean;
  image_url: string | null;
  width: number | null;
  height: number | null;
  upload_status: string | null;
  created_at: string;
};

type CardDetail = {
  id: string;
  name: string;
  preset_id: string;
  form_snapshot: Record<string, unknown>;
  is_favorite: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  deleted_at: string | null;
  master: GenerationItem | null;
  resizes: GenerationItem[];
};

const PRESET_LABELS: Record<string, string> = {
  preset1: "Широкий угол",
  preset2: "Слот",
  preset3: "Событие",
  preset4: "Спорт",
};

export default function HistoryCardPage() {
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
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <CardBody />
    </div>
  );
}

function CardBody() {
  const router = useRouter();
  const params = useParams<{ cardId: string }>();
  const cardId = params.cardId;

  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [err, setErr] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson<{ card: CardDetail }>(`/api/history/${cardId}`)
      .then((r) => {
        if (cancelled) return;
        setDetail(r.card);
        setDraftName(r.card.name);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : "Не удалось загрузить карточку");
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const saveName = async () => {
    if (!detail) return;
    const next = draftName.trim();
    if (!next || next === detail.name) {
      setRenaming(false);
      return;
    }
    try {
      await apiJson(`/api/history/${cardId}`, {
        method: "PATCH",
        json: { name: next },
      });
      setDetail({ ...detail, name: next });
      setRenaming(false);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Не удалось переименовать");
    }
  };

  const toggleFavorite = async () => {
    if (!detail) return;
    try {
      await apiJson(`/api/history/${cardId}`, {
        method: "PATCH",
        json: { is_favorite: !detail.is_favorite },
      });
      setDetail({ ...detail, is_favorite: !detail.is_favorite });
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async () => {
    if (!confirm("Переместить карточку в корзину?")) return;
    setBusy(true);
    try {
      await apiJson(`/api/history/${cardId}`, { method: "DELETE" });
      router.push("/history");
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Не удалось удалить");
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/history/restore`, {
        method: "POST",
        json: { card_id: cardId },
      });
      router.push("/history");
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Не удалось восстановить");
      setBusy(false);
    }
  };

  if (err) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <BackButton href="/history" className="-ml-2" />
        <p className="mt-6 text-sm text-destructive">{err}</p>
        {/сесси|войдите/i.test(err) ? (
          <Link
            href="/login"
            className="mt-3 inline-flex items-center rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            Войти снова
          </Link>
        ) : null}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка карточки…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      {/* Sticky top bar */}
      <div className="sticky top-16 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <BackButton href="/history" />

        <div className="flex flex-1 items-center gap-2 min-w-[200px]">
          {renaming ? (
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setDraftName(detail.name);
                }
              }}
              className="max-w-md"
            />
          ) : (
            <>
              <h1 className="truncate text-lg font-semibold">{detail.name}</h1>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Переименовать"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {detail.deleted_at ? (
          <Button size="sm" disabled={busy} onClick={restore}>
            Восстановить
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
              aria-label={detail.is_favorite ? "Убрать из избранного" : "В избранное"}
            >
              <Heart
                className={
                  "h-4 w-4 " +
                  (detail.is_favorite ? "fill-accent-green text-accent-green" : "text-muted-foreground")
                }
              />
            </button>
            <Button size="sm" variant="outline" onClick={() => downloadCardZip(cardId)}>
              <Download className="mr-1 h-4 w-4" /> Скачать ZIP
            </Button>
            <Button
              size="sm"
              onClick={() => {
                router.push(`/banner?card=${cardId}`);
              }}
            >
              <Wand2 className="mr-1 h-4 w-4" /> Использовать как основу
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Hero — master image at native aspect, capped at 70vh */}
      <section className="mb-6">
        <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
          Исходное изображение
          {detail.master?.width && detail.master?.height
            ? ` · ${detail.master.width}×${detail.master.height}`
            : ""}
        </Label>
        {detail.master?.image_url ? (
          <a
            href={detail.master.image_url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border bg-muted/20"
          >
            <img
              src={detail.master.image_url}
              alt={detail.name}
              className="mx-auto block max-h-[70vh] w-auto object-contain"
            />
          </a>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
            Мастер недоступен.{" "}
            {detail.master?.upload_status === "pending"
              ? "Загружается на хранилище…"
              : detail.master?.upload_status === "failed"
                ? "Загрузка на хранилище не удалась."
                : "Файла нет."}
          </div>
        )}
      </section>

      {/* Resizes — masonry grid, every tile keeps its true aspect */}
      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Ресайзы ({detail.resizes.length})
          </Label>
          <span className="text-xs text-muted-foreground">
            · {(PRESET_LABELS[detail.preset_id] ?? detail.preset_id) || "Без пресета"}
          </span>
        </div>
        {detail.resizes.length === 0 ? (
          <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            У этой карточки пока нет ресайзов. Откройте «Использовать как мастер», чтобы
            сгенерировать новые размеры.
          </p>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
            {detail.resizes.map((r) => (
              <ResizeTile key={r.id} item={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResizeTile({ item }: { item: GenerationItem }) {
  const w = item.width ?? 1;
  const h = item.height ?? 1;
  // CSS columns require break-inside: avoid on each child so a tile
  // never gets split between two columns. Margin-bottom adds vertical
  // spacing (gap on `columns` only handles horizontal gutters).
  return (
    <a
      href={item.image_url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="mb-3 block break-inside-avoid overflow-hidden rounded-md border bg-card transition hover:ring-1 hover:ring-muted-foreground/30"
    >
      {item.image_url ? (
        <div className="bg-muted/20" style={{ aspectRatio: `${w} / ${h}` }}>
          <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div
          className="flex items-center justify-center bg-muted/40 text-xs text-muted-foreground"
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          {item.upload_status === "pending"
            ? "Загружается…"
            : item.upload_status === "failed"
              ? "Не загружено"
              : "Нет файла"}
        </div>
      )}
      <div className="border-t px-2.5 py-1.5 text-xs">
        <span className="font-medium tabular-nums">
          {item.width} × {item.height}
        </span>
      </div>
    </a>
  );
}

async function downloadCardZip(cardId: string) {
  try {
    const res = await apiFetch("/api/history/bulk-zip", {
      method: "POST",
      json: { card_ids: [cardId] },
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
