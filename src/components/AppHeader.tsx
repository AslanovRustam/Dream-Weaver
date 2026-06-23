"use client";

// Top bar shown on every protected page. Renders the user's balance,
// a dropdown menu (account / admin / sign out), and an inline "loading…"
// placeholder while the profile is being fetched.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  Coins,
  Loader2,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";

import { useGeneration } from "@/lib/generation-context";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-client";

type MeResponse = {
  profile: {
    email: string;
    first_name: string;
    last_name: string;
    nickname: string;
    credits_balance: number | string;
  };
  is_super_admin: boolean;
};

let cachedMe: MeResponse | null = null;
const meListeners = new Set<(v: MeResponse | null) => void>();

/** Cross-component cache so the header doesn't refetch on every nav. */
function setMe(v: MeResponse | null) {
  cachedMe = v;
  meListeners.forEach((cb) => cb(v));
}

/** Public: trigger a refresh after the balance changes (e.g. after generation). */
export function refreshMe() {
  apiJson<MeResponse>("/api/me")
    .then(setMe)
    .catch(() => {});
}

export function AppHeader() {
  const { isAuthenticated, signOut } = useAuth();
  const router = useRouter();
  const [me, setLocalMe] = useState<MeResponse | null>(cachedMe);
  // Failed/pending upload counters drive the warning badge next to the
  // History link. We poll once on mount and then every 60 s — cheap
  // count-only query, mostly returns zeros.
  const [uploadStatus, setUploadStatus] = useState<{ failed: number; pending: number } | null>(
    null,
  );

  useEffect(() => {
    meListeners.add(setLocalMe);
    return () => {
      meListeners.delete(setLocalMe);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setMe(null);
      return;
    }
    if (cachedMe) return; // already loaded
    refreshMe();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUploadStatus(null);
      return;
    }
    let cancelled = false;
    const fetchStatus = () => {
      apiJson<{ failed: number; pending: number }>("/api/history/upload-status")
        .then((r) => {
          if (!cancelled) setUploadStatus(r);
        })
        .catch(() => {
          /* silent — header badge is non-critical */
        });
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const balance = me ? Number(me.profile.credits_balance) || 0 : null;
  const display =
    me?.profile.nickname ||
    [me?.profile.first_name, me?.profile.last_name].filter(Boolean).join(" ") ||
    me?.profile.email ||
    "Профиль";

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[2000px] items-center justify-between px-3 sm:px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Dream Weaver Studio
        </Link>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs tabular-nums sm:flex">
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
            {balance === null ? (
              <span className="text-muted-foreground">…</span>
            ) : (
              <span className="font-medium">{balance.toFixed(2)}</span>
            )}
            <span className="text-muted-foreground">кр.</span>
          </div>

          {uploadStatus && uploadStatus.failed > 0 ? (
            <Link
              href="/history"
              title={`${uploadStatus.failed} ${uploadStatus.failed === 1 ? "файл" : "файлов"} не сохранены в облаке. Откройте историю чтобы посмотреть.`}
              className="hidden items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-400 sm:flex"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {uploadStatus.failed}
            </Link>
          ) : null}

          <GenerationIndicator />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <UserIcon className="h-4 w-4" />
                <span className="max-w-[140px] truncate">{display}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{display}</span>
                  <span className="text-xs text-muted-foreground">{me?.profile.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account">
                  <UserIcon className="mr-2 h-4 w-4" />
                  Личный кабинет
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/history">
                  <Clock className="mr-2 h-4 w-4" />
                  История
                </Link>
              </DropdownMenuItem>
              {me?.is_super_admin ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Админ-панель
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/**
 * Header chip that mirrors what's happening in the global generation
 * context.
 *
 *   • Hidden when no generation has happened yet.
 *   • While master is running: spinner + "Мастер".
 *   • While a resize batch is running: spinner + done/total counter +
 *     small cancel ✕ button that fires generation.cancel(). Click the
 *     chip itself to jump back to the main page (where the tile grid
 *     and the in-form cancel button live).
 *   • Briefly after batch completion: counter stays visible while the
 *     user can still see the tiles on the main page.
 */
function GenerationIndicator() {
  const gen = useGeneration();
  const router = useRouter();
  const isActive = gen.isBusy;
  // Show whenever there's anything for the user to come back to:
  //   • work in flight (master_running / batch_running)
  //   • any tiles in the grid (running or completed)
  //   • an active master image on the canvas (so the chip is a
  //     "jump back to my master" button from anywhere)
  //   • or the last run errored out
  const showSummary =
    isActive || gen.totalTiles > 0 || gen.imageUrl !== null || gen.status === "error";
  if (!showSummary) return null;

  const isBatch = gen.status === "batch_running" || gen.totalTiles > 0;
  const isMasterDoneNoBatch =
    !isActive && gen.totalTiles === 0 && gen.imageUrl !== null && gen.status !== "error";
  const label =
    gen.status === "error"
      ? "Ошибка"
      : gen.status === "master_running"
        ? "Мастер"
        : isBatch
          ? `${gen.doneTiles}/${gen.totalTiles}`
          : isMasterDoneNoBatch
            ? "Готово"
            : "";

  const tone =
    gen.status === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : isActive
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
        : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300";

  return (
    <div
      className={"hidden items-center gap-1 rounded-md border px-2 py-1 text-xs sm:flex " + tone}
    >
      <button
        type="button"
        onClick={() => router.push("/")}
        className="flex items-center gap-1"
        title="Открыть страницу генерации"
      >
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : gen.status === "error" ? (
          <Bell className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        <span className="font-medium tabular-nums">{label}</span>
      </button>
      <button
        type="button"
        onClick={() => (isActive ? gen.cancel() : gen.clear())}
        className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        aria-label={isActive ? "Прервать" : "Скрыть"}
        title={isActive ? "Прервать оставшиеся задачи" : "Скрыть индикатор"}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
