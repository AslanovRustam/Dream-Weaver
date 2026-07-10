"use client";

// Top bar shown on every protected page.
//
// Left  : logo + editable project name (breadcrumb) + save status.
//         (breadcrumb / save / undo-redo only appear on the editor route)
// Right : generation progress → credits → notifications → help → my
//         projects → profile avatar.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  Clock,
  Coins,
  Crown,
  HelpCircle,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Redo2,
  ShieldCheck,
  Sparkles,
  Undo2,
  User as UserIcon,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useEditorHistory } from "@/lib/editor-history";
import { useGeneration } from "@/lib/generation-context";
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

// Monthly credit pool used for the "X из N" label (mirrors the account page).
const CREDIT_POOL = 10;

// UI-only mock data — swap for real endpoints once notifications / a projects
// list exist on the backend.
const NOTIFICATIONS: { id: string; icon: typeof Sparkles; title: string; desc: string; time: string; unread: boolean }[] = [
  {
    id: "n1",
    icon: Sparkles,
    title: "Генерация завершена",
    desc: "Пакет из 6 баннеров готов к скачиванию",
    time: "2 мин",
    unread: true,
  },
  {
    id: "n2",
    icon: LayoutTemplate,
    title: "Новый шаблон добавлен",
    desc: "Betting · «Экспресс дня»",
    time: "1 ч",
    unread: true,
  },
  {
    id: "n3",
    icon: ShieldCheck,
    title: "Аккаунт активен",
    desc: "Текущий план: Бесплатный",
    time: "вчера",
    unread: false,
  },
];

const PROJECTS: { id: string; name: string; thumb: string; updated: string }[] = [
  { id: "p1", name: "Новогодний экспресс", thumb: "https://picsum.photos/seed/dwp1/112/80", updated: "9 июл" },
  { id: "p2", name: "Слот «Book of Sun»", thumb: "https://picsum.photos/seed/dwp2/112/80", updated: "8 июл" },
  { id: "p3", name: "Матч ЦСКА — Спартак", thumb: "https://picsum.photos/seed/dwp3/112/80", updated: "5 июл" },
  { id: "p4", name: "Untitled project", thumb: "https://picsum.photos/seed/dwp4/112/80", updated: "3 июл" },
];

export function AppHeader() {
  const { isAuthenticated, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isEditor = pathname === "/";

  const [me, setLocalMe] = useState<MeResponse | null>(cachedMe);
  const [uploadStatus, setUploadStatus] = useState<{ failed: number; pending: number } | null>(
    null,
  );

  // Project name (breadcrumb) + simulated autosave status. Persisted to
  // localStorage so it survives the per-page remount of this header.
  const [projectName, setProjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    meListeners.add(setLocalMe);
    return () => {
      meListeners.delete(setLocalMe);
    };
  }, []);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("dw:projectName") : null;
    if (v) setProjectName(v);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setMe(null);
      return;
    }
    if (cachedMe) return;
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
        .catch(() => {});
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
    "John Doe";
  const displayEmail = me?.profile.email || "john.doe@example.com";
  const avatarUrl = "https://i.pravatar.cc/128?img=68";
  // Real balance when the profile has loaded; otherwise a sensible placeholder
  // (the /api/me call is unauthenticated in the dev-bypass build).
  const creditsLabel = balance === null ? "8" : balance.toFixed(2).replace(/\.00$/, "");

  const commitName = (v: string) => {
    setProjectName(v);
    if (typeof window !== "undefined") window.localStorage.setItem("dw:projectName", v);
    setSaving(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaving(false), 900);
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-none items-center justify-between gap-3 px-4 sm:px-6">
        {/* LEFT: logo + breadcrumb + save + undo/redo */}
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
            <span className="hidden sm:inline">Dream Weaver Studio</span>
            <span className="sm:hidden">DW</span>
          </Link>
          {isEditor ? (
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <span className="shrink-0 text-muted-foreground">/</span>
              <ProjectNameEditor value={projectName} onCommit={commitName} />
              <SaveStatus saving={saving} />
              <span className="mx-1 hidden h-5 w-px bg-border lg:block" />
              <UndoRedo />
            </div>
          ) : null}
        </div>

        {/* RIGHT: generation → credits → notifications → help → projects → avatar */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {uploadStatus && uploadStatus.failed > 0 ? (
            <Link
              href="/history"
              title={`${uploadStatus.failed} файлов не сохранены в облаке. Откройте историю.`}
              className="hidden items-center gap-1 rounded-md border border-[var(--status-premium)]/40 bg-[var(--status-premium)]/10 px-2 py-1 text-xs text-[var(--status-premium)] sm:flex"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {uploadStatus.failed}
            </Link>
          ) : null}

          <GenerationIndicator />

          <CreditsButton label={creditsLabel} max={CREDIT_POOL} />
          <NotificationsMenu />
          <div className="hidden items-center gap-1 sm:gap-1.5 md:flex">
            <HelpMenu />
            <ProjectsMenu />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Профиль"
                className="ml-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-accent-green ring-offset-2 ring-offset-background transition hover:brightness-110 focus:outline-none focus-visible:ring-accent-green"
              >
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-72 rounded-2xl border-border bg-popover p-2 text-foreground"
            >
              <div className="flex items-center gap-3 px-2 py-2">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-accent-green ring-offset-2 ring-offset-popover">
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                </span>
                <div className="min-w-0">
                  <p className="truncate ds-h2">{display}</p>
                  <p className="truncate ds-caption">{displayEmail}</p>
                </div>
              </div>

              <Link
                href="/account"
                className="mt-1 block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <span className="ds-h2">Кредиты</span>
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                    осталось {creditsLabel}
                  </span>
                </div>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: CREDIT_POOL }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 rounded-full ${
                        i < Math.floor(Number(creditsLabel)) ? "bg-accent-green" : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
              </Link>

              <div className="mb-1 mt-2 flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Crown className="h-4 w-4 text-accent-green" />
                  Больше кредитов
                </span>
                <Link
                  href="/billing"
                  className="rounded-lg bg-accent-green px-3 py-1 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Пополнить
                </Link>
              </div>

              <DropdownMenuSeparator className="bg-border" />

              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/account">
                  <UserIcon className="mr-2 h-4 w-4" />
                  Личный кабинет
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/history">
                  <Clock className="mr-2 h-4 w-4" />
                  История
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground md:hidden"
              >
                <a href="mailto:support@clickable.agency">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Помощь и поддержка
                </a>
              </DropdownMenuItem>
              {me?.is_super_admin ? (
                <DropdownMenuItem
                  asChild
                  className="text-foreground focus:bg-white/10 focus:text-foreground"
                >
                  <Link href="/admin">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Админ-панель
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="text-foreground focus:bg-white/10 focus:text-foreground"
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

// ---- Left cluster -----------------------------------------------------------

function ProjectNameEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value.trim() || "Untitled project";

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft.trim());
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCommit(draft.trim());
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Untitled project"
        className="min-w-0 max-w-[220px] rounded-md border border-accent-green/60 bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Переименовать проект"
      className={`group flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition hover:bg-white/5 ${
        value.trim() ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <span className="max-w-[220px] truncate">{display}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
    </button>
  );
}

function SaveStatus({ saving }: { saving: boolean }) {
  return (
    <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-muted-foreground lg:flex">
      {saving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Сохранение…
        </>
      ) : (
        "Сохранено"
      )}
    </span>
  );
}

function UndoRedo() {
  const { canUndo, canRedo, undo, redo } = useEditorHistory();
  const cls =
    "rounded-md p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";
  return (
    <div className="hidden items-center gap-0.5 lg:flex">
      <button type="button" onClick={undo} disabled={!canUndo} title="Отменить" className={cls}>
        <Undo2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Повторить" className={cls}>
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- Right cluster ----------------------------------------------------------

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

function CreditsButton({ label, max }: { label: string; max: number }) {
  return (
    <Link
      href="/billing"
      title="Пополнить кредиты"
      className="flex items-center gap-2 rounded-lg border border-border bg-white/5 px-2.5 py-1.5 text-sm transition hover:border-white/25 hover:bg-white/10"
    >
      <Coins className="h-4 w-4 shrink-0 text-accent-green" />
      <span className="hidden tabular-nums sm:inline">
        <span className="text-muted-foreground">Кредиты: </span>
        <span className="font-semibold text-accent-green">{label}</span>
        <span className="text-muted-foreground"> из {max}</span>
      </span>
      <span className="font-semibold tabular-nums text-accent-green sm:hidden">{label}</span>
    </Link>
  );
}

function NotificationsMenu() {
  const [readAll, setReadAll] = useState(false);
  const unread = readAll ? 0 : NOTIFICATIONS.filter((n) => n.unread).length;
  return (
    <DropdownMenu
      onOpenChange={(o) => {
        if (o) setReadAll(true);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Уведомления"
          className="relative rounded-md p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-green px-1 text-[10px] font-bold text-black">
              {unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-80 rounded-2xl border-border bg-popover p-2 text-foreground"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="ds-h2">Уведомления</span>
          <span className="ds-caption">{NOTIFICATIONS.length}</span>
        </div>
        <div className="space-y-0.5">
          {NOTIFICATIONS.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{n.time}</span>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Помощь"
          className="rounded-md p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-64 rounded-2xl border-border bg-popover p-2 text-foreground"
      >
        <div className="px-2 py-1.5">
          <span className="ds-h2">Помощь</span>
        </div>
        <DropdownMenuItem asChild className="focus:bg-white/10 focus:text-foreground">
          <a href="#" className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            База знаний и FAQ
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="focus:bg-white/10 focus:text-foreground">
          <a href="mailto:support@clickable.agency" className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Написать в поддержку
          </a>
        </DropdownMenuItem>
        <div className="px-2 pb-1 pt-1.5 ds-caption">support@clickable.agency</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectsMenu() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Мои проекты"
          className="rounded-md p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-80 rounded-2xl border-border bg-popover p-2 text-foreground"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="ds-h2">Мои проекты</span>
          <Link href="/history" className="ds-caption underline-offset-4 hover:underline">
            Вся история
          </Link>
        </div>
        <div className="space-y-0.5">
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push("/")}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
            >
              <span className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">
                <img src={p.thumb} alt="" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">Изменён {p.updated}</p>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
