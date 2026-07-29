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
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Crown,
  Globe,
  HelpCircle,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  LogOut,
  Pencil,
  ShieldCheck,
  Sparkles,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useAppRole } from "@/lib/roles";
import { useGeneration } from "@/lib/generation-context";
import { apiJson } from "@/lib/api-client";
import { SECTIONS, sectionFromPath } from "@/lib/sections";
import { isSectionHintSeen, markSectionHintSeen } from "@/lib/onboarding";
import { getUnsavedWork } from "@/lib/unsaved-work";
import { useLocale, useT, useMessages, UI_LOCALES } from "@/lib/i18n";
import { BrandLogo } from "./BrandLogo";

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

// Balance at/below which the credits chip turns amber to nudge a top-up.
const LOW_CREDIT_THRESHOLD = 20;

// UI-only mock data — swap for real endpoints once notifications / a projects
// list exist on the backend.
// Structural metadata for the mock notifications; the localized title/desc/time
// come from the i18n dictionary (header.notifications.items), index-aligned.
const NOTIF_META: { id: string; icon: typeof Sparkles; unread: boolean }[] = [
  { id: "n1", icon: Sparkles, unread: true },
  { id: "n2", icon: LayoutTemplate, unread: true },
  { id: "n3", icon: ShieldCheck, unread: false },
];

const PROJECTS: { id: string; name: string; thumb: string; updated: string }[] = [
  { id: "p1", name: "Новогодний экспресс", thumb: "https://picsum.photos/seed/dwp1/112/80", updated: "9 июл" },
  { id: "p2", name: "Слот «Book of Sun»", thumb: "https://picsum.photos/seed/dwp2/112/80", updated: "8 июл" },
  { id: "p3", name: "Матч ЦСКА — Спартак", thumb: "https://picsum.photos/seed/dwp3/112/80", updated: "5 июл" },
  { id: "p4", name: "Проект без названия", thumb: "https://picsum.photos/seed/dwp4/112/80", updated: "3 июл" },
];

export function AppHeader() {
  const { isAuthenticated, signOut } = useAuth();
  const { isGuest, isAdmin } = useAppRole();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const m = useMessages();
  // Hub (start screen) shows a simplified header (no section switcher / editor
  // chrome). Tool routes show the section switcher; the banner editor also gets
  // the project-name breadcrumb + undo/redo.
  const isHub = pathname === "/";
  const isBannerEditor = pathname === "/banner";

  const [me, setLocalMe] = useState<MeResponse | null>(cachedMe);
  const [uploadStatus, setUploadStatus] = useState<{ failed: number; pending: number } | null>(
    null,
  );

  // Project name (breadcrumb) + simulated autosave status. Persisted to
  // localStorage so it survives the per-page remount of this header.
  const [projectName, setProjectName] = useState("");
  // Mobile profile menu: controlled so a scrim overlay can sync with its open
  // state; `notifOpen` drives the inline notifications accordion inside it.
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // Pending destination for the unsaved-changes guard: when set, the modal is
  // open and confirming navigates here (see requestNavigate).
  const [pendingNav, setPendingNav] = useState<string | null>(null);

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

  // Warn before a hard navigation (refresh / tab close) while a section holds a
  // freshly generated, not-yet-persisted result (playable / video).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (getUnsavedWork() !== null) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Render for guests too — the header has a full guest branch (GuestAuthButtons
  // + no credits/profile). Returning null on !isAuthenticated hid it from every
  // logged-out visitor in production (guest == no session), leaving the public
  // Hub with no branding and no way to register. Bail out only while the role is
  // still unresolved (both false), which avoids a flash.
  if (!isAuthenticated && !isGuest) return null;

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

  // Autosave: persist the name on edit. No visible "saving" chrome anymore.
  const commitName = (v: string) => {
    setProjectName(v);
    if (typeof window !== "undefined") window.localStorage.setItem("dw:projectName", v);
  };

  // Guarded navigation: if the current section has unsaved work, open the modal
  // and defer the push; otherwise navigate immediately. Used by the section
  // switcher and the logo (→ Hub) — the two ways to leave a generator.
  const requestNavigate = (href: string) => {
    if (getUnsavedWork() !== null) setPendingNav(href);
    else router.push(href);
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
      {/* The mobile scrim behind the profile menu (and every other dropdown) is
          now provided by the shared <DropdownMenu> wrapper — see MobileScrim. */}
      <div className="mx-auto flex h-16 max-w-none items-center justify-between gap-3 px-4 sm:px-6">
        {/* LEFT: logo + breadcrumb + save + undo/redo */}
        <div className="flex min-w-0 items-center gap-2">
          {isHub ? (
            <Link
              href="/"
              aria-label={t("header.homeAria")}
              className="flex shrink-0 items-center rounded text-base font-bold tracking-tight text-foreground transition hover:text-foreground/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <BrandLogo
                className="h-7 max-sm:h-6"
                fallback={
                  <>
                    <span className="hidden sm:inline">Dream Weaver Studio</span>
                    <span className="sm:hidden">DW</span>
                  </>
                }
              />
            </Link>
          ) : (
            <>
              {/* Logo → Hub. The lime accent lives on the section switcher beside
                  it, so the two can't be confused. Falls back to the text
                  wordmark (full on ≥sm, "DW" on mobile) until the logo file is
                  present. */}
              <button
                type="button"
                onClick={() => requestNavigate("/")}
                aria-label={t("header.homeAria")}
                title={t("header.home")}
                className="relative flex shrink-0 items-center rounded text-foreground transition after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <BrandLogo
                  className="h-7 max-sm:h-6"
                  fallback={
                    <span className="text-base font-bold tracking-tight max-sm:text-sm">
                      <span className="hidden sm:inline">Dream Weaver Studio</span>
                      <span className="sm:hidden">DW</span>
                    </span>
                  }
                />
              </button>
              <SectionSwitcher pathname={pathname} onNavigate={requestNavigate} />
            </>
          )}
          {isBannerEditor ? (
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <span className="shrink-0 text-muted-foreground">/</span>
              <ProjectNameEditor value={projectName} onCommit={commitName} />
            </div>
          ) : null}
        </div>

        {/* RIGHT: generation → credits → notifications → help → projects → avatar */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {!isHub && uploadStatus && uploadStatus.failed > 0 ? (
            <Link
              href="/history"
              title={t("header.uploadFailed", { n: uploadStatus.failed })}
              className="hidden items-center gap-1 rounded-md border border-[var(--status-premium)]/40 bg-[var(--status-premium)]/10 px-2 py-1 text-xs text-[var(--status-premium)] sm:flex"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {uploadStatus.failed}
            </Link>
          ) : null}

          {!isHub ? <GenerationIndicator /> : null}

          {/* Guests have no balance to show (spec: no credits for guests). */}
          {!isGuest ? <CreditsButton label={creditsLabel} /> : null}
          {/* Interface-language switcher (RU/EN/UA) — visible on every screen. */}
          <LanguageSelector />
          {/* The rest of the toolbar is editor chrome — hidden on the Hub and
              for guests (nothing there is usable without an account). */}
          {!isHub && !isGuest ? (
            <>
              {/* Bell hidden on mobile — notifications live inside the profile
                  menu there (see the mobile-only block in the avatar dropdown). */}
              <span className="max-sm:hidden sm:contents">
                <NotificationsMenu />
              </span>
              <div className="hidden items-center gap-1 sm:gap-1.5 md:flex">
                <ProjectsMenu />
              </div>
            </>
          ) : null}

          {isGuest ? (
            <GuestAuthButtons />
          ) : (
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(o) => {
              setMenuOpen(o);
              if (!o) setNotifOpen(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("header.profile.trigger")}
                className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:brightness-110 focus:outline-none max-sm:h-11 max-sm:w-11"
              >
                {/* Visual avatar is smaller than the 44px tap target on mobile. */}
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover max-sm:h-8 max-sm:w-8"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-72 rounded-xl border-border bg-popover p-2 text-foreground"
            >
              <div className="flex items-center gap-3 px-2 py-2">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-accent-green ring-offset-2 ring-offset-popover">
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                </span>
                <div className="min-w-0">
                  <p className="truncate ds-h4">{display}</p>
                  <p className="truncate ds-caption">{displayEmail}</p>
                </div>
              </div>

              {/* No fixed-pool pip bar — there is no plan max in the model, so
                  a 10-segment bar was meaningless. Show the balance; go amber +
                  add a top-up hint when it runs low. */}
              {(() => {
                const low = Number(creditsLabel) <= LOW_CREDIT_THRESHOLD;
                return (
                  <Link
                    href={low ? "/billing" : "/account"}
                    className={`mt-1 block rounded-xl border p-3 transition ${
                      low
                        ? "border-[color:var(--status-premium)]/40 bg-[color:var(--status-premium)]/10 hover:bg-[color:var(--status-premium)]/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="ds-h4">{t("header.credits.title")}</span>
                      <span
                        className={`text-lg font-semibold tabular-nums ${low ? "text-[color:var(--status-premium)]" : "text-accent-green"}`}
                      >
                        {creditsLabel}
                      </span>
                    </div>
                    {low ? (
                      <p className="mt-1 text-xs text-[color:var(--status-premium)]">
                        {t("header.credits.low")}
                      </p>
                    ) : null}
                  </Link>
                );
              })()}

              <div className="mb-1 mt-2 flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Crown className="h-4 w-4 text-accent-green" />
                  {t("header.credits.more")}
                </span>
                <Link
                  href="/billing"
                  className="rounded-lg bg-accent-green px-3 py-1 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
                >
                  {t("header.credits.topUpShort")}
                </Link>
              </div>

              {/* Mobile-only: notifications live here since the header bell is
                  hidden on narrow screens. Collapsible accordion — tapping the
                  row expands the list inline, without leaving the menu. */}
              <div className="sm:hidden">
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onSelect={(e) => {
                    // Keep the menu open; just toggle the inline section.
                    e.preventDefault();
                    setNotifOpen((o) => !o);
                  }}
                  aria-expanded={notifOpen}
                  className="justify-between text-foreground focus:bg-white/10 focus:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {t("header.notifications.title")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {NOTIF_META.length > 0 ? (
                      <span className="ds-caption tabular-nums">{NOTIF_META.length}</span>
                    ) : null}
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        notifOpen ? "rotate-180" : ""
                      }`}
                    />
                  </span>
                </DropdownMenuItem>
                {notifOpen ? (
                  <div className="max-h-56 space-y-0.5 overflow-y-auto pl-1">
                    {NOTIF_META.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        {t("header.notifications.empty")}
                      </p>
                    ) : (
                      NOTIF_META.map((n, i) => {
                        const Icon = n.icon;
                        const item = m.header.notifications.items[i];
                        return (
                          <div
                            key={n.id}
                            className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5"
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                            <span className="shrink-0 ds-micro text-muted-foreground">{item.time}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>

              <DropdownMenuSeparator className="bg-border" />

              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/account">
                  <UserIcon className="mr-2 h-4 w-4" />
                  {t("header.profile.account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/workspace">
                  <Briefcase className="mr-2 h-4 w-4" />
                  {t("workspace.switch")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/history">
                  <Clock className="mr-2 h-4 w-4" />
                  {t("header.profile.history")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="text-foreground focus:bg-white/10 focus:text-foreground"
              >
                <Link href="/help">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  {t("header.profile.help")}
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem
                  asChild
                  className="text-foreground focus:bg-white/10 focus:text-foreground"
                >
                  <Link href="/admin">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t("header.profile.admin")}
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
                {t("header.profile.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>

      {/* Unsaved-changes guard modal — shown when leaving a generator with
          unsaved work (section switcher / logo). Radix portals it to <body>. */}
      <Dialog
        open={pendingNav !== null}
        onOpenChange={(o) => {
          if (!o) setPendingNav(null);
        }}
      >
        <DialogContent
          hideClose
          className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6"
        >
          <DialogTitle className="ds-h4">{t("header.unsavedModal.title")}</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">{t("header.unsavedModal.body")}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setPendingNav(null)}
              className="min-h-11 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
            >
              {t("header.unsavedModal.stay")}
            </button>
            <button
              type="button"
              onClick={() => {
                const h = pendingNav;
                setPendingNav(null);
                if (h) router.push(h);
              }}
              className="min-h-11 rounded-lg border border-[color:var(--border-strong)] px-4 text-sm font-medium text-muted-foreground transition hover:bg-[var(--overlay-hover)] hover:text-foreground"
            >
              {t("header.unsavedModal.leave")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

// Guests get sign-in / sign-up instead of the credits chip + avatar menu.
function GuestAuthButtons() {
  const t = useT();
  return (
    <div className="ml-0.5 flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Link
        href="/login"
        className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground max-sm:min-h-11 sm:px-3"
      >
        {t("header.guest.login")}
      </Link>
      <Link
        href="/login?mode=signup"
        className="inline-flex min-h-9 items-center rounded-lg bg-accent-green px-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] max-sm:min-h-11 sm:px-3.5"
      >
        {t("header.guest.register")}
      </Link>
    </div>
  );
}

// ---- Left cluster -----------------------------------------------------------

function ProjectNameEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value.trim() || t("header.project.untitled");

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
        placeholder={t("header.project.untitled")}
        className="min-w-0 max-w-[220px] rounded-md border border-accent-green/60 bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t("header.project.rename")}
      className={`group flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition hover:bg-white/5 ${
        value.trim() ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <span className="max-w-[220px] truncate">{display}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
    </button>
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
  const t = useT();
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
      ? t("header.progress.error")
      : gen.status === "master_running"
        ? t("header.progress.master")
        : isBatch
          ? `${gen.doneTiles}/${gen.totalTiles}`
          : isMasterDoneNoBatch
            ? t("header.progress.done")
            : "";

  // Tokens only — the error/success roles use the same --status-* variables as
  // GenerationErrorCard / SettingsSection rather than raw Tailwind palettes.
  const tone =
    gen.status === "error"
      ? "border-[color:var(--status-error)]/40 bg-[color:var(--status-error)]/10 text-[color:var(--status-error)]"
      : isActive
        ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
        : "border-accent-green/30 bg-accent-green/5 text-accent-green/80";

  return (
    <div
      className={"flex items-center gap-1 rounded-md border px-2 py-1 text-xs " + tone}
    >
      <button
        type="button"
        onClick={() => router.push("/banner")}
        className="flex items-center gap-1"
        title={t("header.progress.open")}
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
        className="relative flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
        aria-label={isActive ? t("header.progress.abort") : t("header.progress.hide")}
        title={isActive ? t("header.progress.abortAll") : t("header.progress.hideIndicator")}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// Credit balance chip. Shows the raw balance only — no fixed "из N" denominator:
// the pool was hardcoded to 10, so a user on a 1000-credit plan read "1000 из 10".
// Low balances turn the chip amber as a top-up nudge. Tap target >=44px on mobile.
function CreditsButton({ label }: { label: string }) {
  const t = useT();
  const low = Number(label) <= LOW_CREDIT_THRESHOLD;
  return (
    <Link
      href="/billing"
      title={low ? t("header.credits.low") : t("header.credits.topUp")}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition max-sm:min-h-11 ${
        low
          ? "border-[color:var(--status-premium)]/40 bg-[color:var(--status-premium)]/10 hover:border-[color:var(--status-premium)]/60"
          : "border-border bg-white/5 hover:border-white/25 hover:bg-white/10"
      }`}
    >
      <Coins
        className={`h-4 w-4 shrink-0 ${low ? "text-[color:var(--status-premium)]" : "text-accent-green"}`}
      />
      <span className="hidden tabular-nums sm:inline">
        <span className="text-muted-foreground">{t("header.credits.label")} </span>
        <span
          className={`font-semibold ${low ? "text-[color:var(--status-premium)]" : "text-accent-green"}`}
        >
          {label}
        </span>
      </span>
      <span
        className={`font-semibold tabular-nums sm:hidden ${low ? "text-[color:var(--status-premium)]" : "text-accent-green"}`}
      >
        {label}
      </span>
    </Link>
  );
}

// Section switcher: a bordered chip showing the current section's white icon +
// name + ▾, opening a menu of all four sections (current one checked) + "На
// главную" (the Hub). The brand wordmark lives in a separate logo to the left.
// Switching away from the banner editor with unsaved work asks for confirmation.
function SectionSwitcher({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate: (route: string) => void;
}) {
  const t = useT();
  // Per-account onboarding: scope the section-hint flag by user id (lib/onboarding).
  const { user } = useAuth();
  const userKey = user?.id ?? null;
  const current = sectionFromPath(pathname);
  const CurrentIcon = current?.icon;

  // One-time coachmark pointing out that this element switches sections. It goes
  // FIRST: a tool's own coachmark waits for this to be dismissed (lib/onboarding),
  // so the two never cover the UI at the same time.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (current && !isSectionHintSeen(userKey)) setShowHint(true);
  }, [current, userKey]);
  const dismissHint = () => {
    setShowHint(false);
    markSectionHintSeen(userKey);
  };

  const go = (route: string) => {
    if (current && route === current.route) return;
    // Navigation is guarded centrally in AppHeader (the unsaved-changes modal).
    onNavigate(route);
  };

  return (
    <div className="relative">
      <DropdownMenu
        onOpenChange={(o) => {
          if (o) dismissHint();
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("header.sections.switch")}
            title={t("header.sections.switch")}
            className="group inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white/5 px-2.5 py-1.5 text-base font-semibold tracking-tight transition hover:border-white/25 hover:bg-white/10 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 max-sm:min-h-11 max-sm:px-3"
          >
            {/* Section chip: lime current-section icon + white name + lime
                chevron. The brand wordmark (now white) lives in the standalone
                logo to the left; the switcher carries the lime accent to read as
                the primary control. Desktop shows the name; mobile shows the icon
                only to save width. */}
            <span className="hidden items-center gap-2 sm:inline-flex">
              {CurrentIcon ? (
                <CurrentIcon className="h-4 w-4 shrink-0 text-accent-green" />
              ) : (
                <LayoutGrid className="h-4 w-4 shrink-0 text-accent-green" />
              )}
              <span className="text-foreground">{current ? current.title : t("header.sections.all")}</span>
            </span>
            <span className="flex items-center sm:hidden">
              {CurrentIcon ? (
                <CurrentIcon className="h-5 w-5 text-accent-green" />
              ) : (
                <LayoutGrid className="h-5 w-5 text-accent-green" />
              )}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-accent-green transition group-hover:text-[var(--accent-hover)] max-sm:h-5 max-sm:w-5"
              strokeWidth={2.5}
            />
          </button>
        </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-64 rounded-xl border-border bg-popover p-1.5 text-foreground max-sm:w-[calc(100vw-2rem)]"
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = s.id === current?.id;
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => go(s.route)}
              className={`justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base ${
                active ? "bg-white/5" : ""
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-accent-green max-sm:h-5 max-sm:w-5" />
                {s.title}
              </span>
              {active ? <Check className="h-4 w-4 text-accent-green" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
      </DropdownMenu>
      {showHint ? (
        <div
          role="dialog"
          className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-accent-green/40 bg-popover p-3 text-foreground shadow-xl max-sm:w-[calc(100vw-2rem)]"
        >
          <span className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border-l border-t border-accent-green/40 bg-popover" />
          <p className="text-xs leading-relaxed text-foreground">
            {t("header.sections.coach")}
          </p>
          <button
            type="button"
            onClick={dismissHint}
            className="mt-2.5 rounded-md bg-accent-green px-3 py-1 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            {t("header.sections.coachOk")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Interface-language switcher — icon only (globe), no label. Sets the PRODUCT
// UI language (RU / EN / UA); instant, no reload. Generated-content language
// lives per-section inside each generator.
function LanguageSelector() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <DropdownMenu scrimIntensity="light">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("header.language.aria")}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white/5 px-2 py-1.5 text-muted-foreground transition hover:border-white/25 hover:bg-white/10 hover:text-foreground max-sm:min-h-11 max-sm:px-2.5"
        >
          <Globe className="h-4 w-4 shrink-0 text-accent-green" />
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-44 rounded-xl border-border bg-popover p-1.5 text-foreground"
      >
        {UI_LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLocale(l.code)}
            className="justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
          >
            {l.label}
            {l.code === locale ? <Check className="h-4 w-4 text-accent-green" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsMenu() {
  const t = useT();
  const m = useMessages();
  const [readAll, setReadAll] = useState(false);
  const unread = readAll ? 0 : NOTIF_META.filter((n) => n.unread).length;
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
          className="relative rounded-md p-2.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-green px-1 ds-micro font-bold text-on-accent">
              {unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-80 rounded-xl border-border bg-popover p-2 text-foreground"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="ds-h4">{t("header.notifications.title")}</span>
          <span className="ds-caption">{NOTIF_META.length}</span>
        </div>
        <div className="space-y-0.5">
          {NOTIF_META.map((n, i) => {
            const Icon = n.icon;
            const item = m.header.notifications.items[i];
            return (
              <div key={n.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <span className="shrink-0 ds-micro text-muted-foreground">{item.time}</span>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectsMenu() {
  const router = useRouter();
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("header.projects.trigger")}
          className="rounded-md p-2.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-80 rounded-xl border-border bg-popover p-2 text-foreground"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="ds-h4">{t("header.projects.trigger")}</span>
          <Link href="/history" className="ds-caption underline-offset-4 hover:underline">
            {t("header.projects.all")}
          </Link>
        </div>
        <div className="space-y-0.5">
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push("/banner")}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
            >
              <span className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">
                <img src={p.thumb} alt="" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t("header.projects.updated", { date: p.updated })}</p>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
