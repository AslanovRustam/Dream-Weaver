"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Coins,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { apiJson, ApiError } from "@/lib/api-client";
import { getBrowserClient } from "@/lib/supabase/browser";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { GuestWall } from "@/components/AuthGate";
import { UserAvatar } from "@/components/UserAvatar";
import { useAppRole } from "@/lib/roles";

type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  phone: string;
  contact: string;
  credits_balance: number | string;
};

type MeResponse = { profile: Profile; is_super_admin: boolean };

// Local dev build only: /api/me is unauthenticated there, so fall back to this
// mock profile instead of the error screen — lets the account page render for
// local review. Production is unaffected.
const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
const DEV_ME: MeResponse = {
  profile: {
    id: "00000000-0000-0000-0000-000000000000",
    email: "dev@localhost",
    first_name: "Дизайн",
    last_name: "Менеджер",
    nickname: "",
    phone: "",
    contact: "",
    credits_balance: 148.5,
  },
  is_super_admin: false,
};

// No stock-photo default: an empty avatar renders the neutral illustrative
// placeholder (see UserAvatar). An uploaded photo (dw:avatar) overrides it.
const AVATAR_URL = "";

// Display name derived from the real profile (same convention as AppHeader).
function displayName(p: Profile): string {
  return (
    p.nickname || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Пользователь"
  );
}

// Soft violet + lime aurora behind the page — the premium-trial backdrop.
// Scoped to /account; see the PREMIUM SURFACES block in globals.css.
function Aurora() {
  return <div className="ds-aurora" aria-hidden />;
}

// Avatar wrapped in a lime→violet gradient ring with a dual-colour glow.
function AvatarRing({ src, size = "h-16 w-16" }: { src: string; size?: string }) {
  return (
    <span
      className="relative shrink-0 rounded-full p-[2px]"
      style={{
        background: "var(--brand-lime)",
        boxShadow: "0 0 22px -6px rgba(198,255,61,0.5)",
      }}
    >
      <span className="block rounded-full bg-background p-[2px]">
        <UserAvatar src={src || null} className={size} />
      </span>
    </span>
  );
}

export default function AccountPage() {
  const router = useRouter();
  useEffect(() => {
    document.title = "Аккаунт — Dream Weaver Studio";
  }, []);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { isGuest } = useAppRole();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Avatar is UI-only (no endpoint yet): mirrored to localStorage.
  const [avatar, setAvatar] = useState<string>(AVATAR_URL);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dw:avatar");
      if (raw) setAvatar(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const saveAvatar = (dataUrl: string) => {
    setAvatar(dataUrl);
    try {
      window.localStorage.setItem("dw:avatar", dataUrl);
      // Let the header (and any other tab) pick up the new photo immediately.
      window.dispatchEvent(new Event("dw:avatar"));
    } catch {
      /* ignore quota errors */
    }
  };

  useEffect(() => {
    if (authLoading) return;
    // Guests are shown the register wall below — no silent bounce to /login.
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<MeResponse>("/api/me");
        if (!cancelled) setMe(data);
      } catch (e) {
        if (cancelled) return;
        // Dev build: render a mock profile instead of the error screen.
        if (DEV_BYPASS) setMe(DEV_ME);
        else setError(e instanceof ApiError ? e.message : "Не удалось загрузить профиль");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, router]);

  if (isGuest) {
    return (
      <div className="relative min-h-screen">
        <Aurora />
        <AppHeader />
        <div className="relative z-10">
          <GuestWall
            title="Личный кабинет доступен после регистрации"
            description="Профиль, кредиты и история появятся здесь после создания аккаунта."
          />
        </div>
      </div>
    );
  }
  if (authLoading || loading) {
    return (
      <div className="relative min-h-screen">
        <Aurora />
        <AppHeader />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
            <p className="text-sm">Загрузка профиля…</p>
          </div>
        </div>
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="relative min-h-screen">
        <Aurora />
        <AppHeader />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center px-4">
          <div className="ds-card ds-card-glow-violet max-w-sm p-6 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--status-error)]/15 text-[color:var(--status-error)]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Не удалось загрузить профиль</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error || "Профиль не найден. Попробуйте обновить страницу."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ds-btn ds-btn-primary mx-auto mt-4 min-h-11 gap-2 px-4"
            >
              <RefreshCw className="h-4 w-4" />
              Обновить
            </button>
            {/сесси|войдите/i.test(error) ? (
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-2 block w-full text-sm text-muted-foreground underline transition hover:text-foreground"
              >
                Войти снова
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <Aurora />
      <AppHeader />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8">
        {/* Unified back control (see BackButton) — same thin "← Назад" everywhere. */}
        <BackButton href="/banner" className="-ml-2 mb-12" />

        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <AvatarRing src={avatar} />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="ds-h1 min-w-0 truncate">{displayName(me.profile)}</h1>
                {/* Clearly-visible secondary button (was a low-contrast violet
                    outline that testers missed): the same bordered + bg-white/5
                    surface as the header icon buttons. Opens the profile editor
                    — email/password are managed separately (support card /
                    security card below), so the label says "профиль", not a bare
                    "Изменить" that read as an email edit. */}
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Редактировать профиль"
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 text-sm font-medium text-foreground transition hover:border-white/25 hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Редактировать
                </button>
              </div>
              <p className="truncate text-sm text-muted-foreground">{me.profile.email}</p>
            </div>
          </div>
          {me.is_super_admin ? (
            <Link href="/admin" className="ds-btn ds-btn-outline-lime min-h-9 shrink-0 px-3">
              Админка
            </Link>
          ) : null}
        </header>

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <CreditsCard balance={me.profile.credits_balance} />
          <UsageHistoryCard />
        </div>

        <div className="space-y-6">
          <SubscriptionCard />
          <AccountInfoCard email={me.profile.email} />
          <PasswordCard />
        </div>
      </div>

      <EditProfileModal
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={me.profile}
        avatarUrl={avatar}
        onSaved={(p) => setMe({ ...me, profile: p })}
        onAvatarChange={saveAvatar}
      />
    </div>
  );
}

// Edit-profile modal — writes real profile fields via PATCH /api/me (folds the
// former standalone profile form into the redesigned modal). Email/password are
// managed elsewhere (email via support, password in the security card). The
// avatar is UI-only: the parent persists it to localStorage.
function EditProfileModal({
  open,
  onOpenChange,
  profile,
  avatarUrl,
  onSaved,
  onAvatarChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile;
  avatarUrl: string;
  onSaved: (p: Profile) => void;
  onAvatarChange: (dataUrl: string) => void;
}) {
  const [form, setForm] = useState({
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
    nickname: profile.nickname || "",
    phone: profile.phone || "",
    contact: profile.contact || "",
  });
  const [avatar, setAvatar] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        nickname: profile.nickname || "",
        phone: profile.phone || "",
        contact: profile.contact || "",
      });
      setAvatar(avatarUrl);
      setMsg(null);
    }
  }, [open, profile, avatarUrl]);

  // Field labels follow the app-wide ds-label convention (13px/500), same as
  // every generator's settings fields and this page's own read-only Email row.
  const labelCls = "mb-2 block ds-label";

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await apiJson<{ profile: Profile }>("/api/me", {
        method: "PATCH",
        json: form,
      });
      onAvatarChange(avatar);
      onSaved(res.profile);
      onOpenChange(false);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Не удалось сохранить" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="ds-card flex max-h-[85vh] w-full max-w-md flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <DialogTitle className="text-lg font-semibold">Редактировать профиль</DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-muted-foreground transition hover:bg-white/15 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* Avatar + upload */}
          <div className="flex items-center gap-4">
            <AvatarRing src={avatar} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ds-btn ds-btn-outline-lime min-h-11 gap-2 px-4"
            >
              <Upload className="h-4 w-4" />
              Загрузить
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setAvatar(String(reader.result));
                reader.readAsDataURL(f);
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Имя</label>
              <Input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Фамилия</label>
              <Input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Ник</label>
            <Input
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="Имя пользователя"
            />
          </div>

          <div>
            <label className={labelCls}>Телефон</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Контакт (Telegram, Slack, ...)</label>
            <Input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="@username или ссылка"
            />
          </div>

          {msg ? (
            <p
              className={
                msg.kind === "ok" ? "text-xs text-accent-green" : "text-xs text-destructive"
              }
            >
              {msg.text}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ds-btn ds-btn-ghost min-h-11 px-5"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="ds-btn ds-btn-primary min-h-11 px-5"
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Subscription status block. Static placeholder — there is no real plan
// state in the data model yet, so everyone shows as "Бесплатный план".
// "Улучшить план" leads to the billing page.
function SubscriptionCard() {
  // Premium upsell = violet emphasis surface (system: violet carries emphasis):
  // a violet resting glow + a lime→violet hairline ring, with a solid-violet
  // PRIMARY CTA so violet reads as a co-equal primary alongside the lime one.
  return (
    <div className="ds-card ds-card-glow-violet p-5 sm:p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Tag className="h-4 w-4 text-brand-violet" />
        <span className="ds-overline">Подписка</span>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="ds-h3">Бесплатный план</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Откройте все возможности с подпиской
          </p>
        </div>
        <Link href="/billing" className="ds-btn ds-btn-violet min-h-11 shrink-0 px-5">
          Улучшить план
        </Link>
      </div>
    </div>
  );
}

// Read-only account info. Email is changed by an administrator on request.
// The support button is a placeholder — swap the mailto for the real channel
// (email / Telegram) once it exists.
const SUPPORT_HREF = "mailto:support@clickable.agency";

function AccountInfoCard({ email }: { email: string }) {
  return (
    <div className="ds-card p-5 sm:p-6">
      <h2 className="ds-h4">Данные аккаунта</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Изменение email выполняется через администратора.
      </p>
      <div className="mt-5 space-y-1.5">
        <p className="ds-label">Email</p>
        <div className="flex h-11 items-center rounded-lg border border-border bg-background/50 px-3 text-sm text-muted-foreground">
          {email}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Чтобы изменить email, обратитесь в поддержку — мы внесём правки вручную.
      </p>
      <a href={SUPPORT_HREF} className="ds-btn ds-btn-outline-lime mt-5 min-h-11 px-4">
        Связаться с поддержкой
      </a>
    </div>
  );
}

// Security card — self-service password change. Preserved from the current
// Next page: POSTs to /api/auth/change-password, then refreshes the Supabase
// session so subsequent calls use a fresh token.
function PasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  return (
    <div className="ds-card p-5 sm:p-6">
      <h2 className="ds-h4">Безопасность</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Смена пароля. Если входите через Google — добавит пароль к аккаунту.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          if (pw.length < 8) {
            setMsg({ kind: "err", text: "Минимум 8 символов" });
            return;
          }
          if (pw !== pw2) {
            setMsg({ kind: "err", text: "Пароли не совпадают" });
            return;
          }
          setBusy(true);
          try {
            await apiJson("/api/auth/change-password", {
              method: "POST",
              json: { new_password: pw },
            });
            // Refresh the session so subsequent calls use a fresh token.
            await getBrowserClient().auth.refreshSession();
            setMsg({ kind: "ok", text: "Пароль обновлён" });
            setPw("");
            setPw2("");
          } catch (e) {
            // Server/Supabase messages here are raw English — only pass a
            // message through if it's already Russian (e.g. the session-
            // expired text), otherwise show a clear generic fallback.
            const raw = e instanceof ApiError ? e.message : "";
            setMsg({
              kind: "err",
              text: /[а-яА-Я]/.test(raw)
                ? raw
                : "Не удалось сменить пароль. Попробуйте ещё раз или обратитесь в поддержку.",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">Новый пароль</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw2">Повторите</Label>
            <Input
              id="new-pw2"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={8}
            />
          </div>
        </div>
        {msg ? (
          <p
            className={
              msg.kind === "ok" ? "text-xs text-accent-green" : "text-xs text-destructive"
            }
          >
            {msg.text}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="ds-btn ds-btn-outline-violet min-h-11 px-4"
        >
          {busy ? "Сохраняем…" : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
}

// Balance at/below which the card nudges a top-up (mirrors the header chip).
const LOW_CREDIT_THRESHOLD = 20;

function CreditsCard({ balance }: { balance: number | string }) {
  const n = typeof balance === "number" ? balance : Number(balance) || 0;
  const label = n.toFixed(2).replace(/\.00$/, "");
  // No "/ N" and no progress bar: there is no plan quota in the model, so a
  // fixed denominator read as nonsense once a balance exceeded it. Show the raw
  // balance; turn amber and prompt a top-up when it runs low or hits zero.
  const low = n <= LOW_CREDIT_THRESHOLD;
  const empty = n <= 0;
  return (
    <div className="ds-card ds-card-glow-lime ds-card-interactive flex min-h-[200px] flex-col p-5 sm:p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Coins className="h-4 w-4 text-brand-lime" />
        <span className="ds-overline">Кредиты</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="ds-caption">Текущий баланс</p>
          <p className="mt-1 ds-stat">
            <span className={low ? "text-[color:var(--status-premium)]" : "ds-text-grad-lime"}>
              {label}
            </span>
            <span className="ml-1.5 text-base font-normal text-muted-foreground">кр.</span>
          </p>
        </div>
        {/* PRIMARY action — brand-gradient fill (lime→violet), the boldest CTA
            on the screen. */}
        <Link href="/billing" className="ds-btn ds-btn-primary min-h-11 shrink-0 gap-1.5 px-4">
          <Plus className="h-4 w-4" />
          Купить
        </Link>
      </div>
      {low ? (
        <p className="mt-3 text-sm text-[color:var(--status-premium)]">
          {empty
            ? "Кредиты закончились — пополните, чтобы продолжить генерацию."
            : "Кредиты заканчиваются — пополните баланс заранее."}
        </p>
      ) : null}
    </div>
  );
}

function UsageHistoryCard() {
  // Placeholder distribution until a real usage-history endpoint exists. The old
  // version hard-coded a single tall bar (i === 19), which read as a broken
  // chart — one column across the whole month. This builds a believable 30-day
  // curve instead: a weekday rhythm, a gentle mid-period rise, a few busy peaks
  // and a couple of idle days. It is DETERMINISTIC (a pure function of the day
  // index — no Date.now()/Math.random() in render) so SSR and client match.
  // Swap `bars` for real per-day counts once the endpoint lands.
  const DAYS = 30;
  const bars = Array.from({ length: DAYS }, (_, i) => {
    const jitter = (Math.abs(Math.sin(i * 12.9898) * 43758.5453)) % 1; // stable 0..1
    const weekday = i % 7 < 5 ? 1 : 0.4; // weekdays busier than weekends
    const trend = 0.45 + 0.4 * Math.sin((i / (DAYS - 1)) * Math.PI); // rise then ease
    let v = 0.12 + jitter * 0.72 * weekday * trend;
    if (i === 8 || i === 17 || i === 24) v += 0.28; // standout busy days
    if (i === 5 || i === 14 || i === 27) v = 0.05; // quiet days
    return Math.max(0.05, Math.min(1, v));
  });
  const peak = bars.reduce((m, v, i) => (v > bars[m] ? i : m), 0);

  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const today = new Date();
  const mid = new Date(today);
  mid.setDate(today.getDate() - 15);
  const start = new Date(today);
  start.setDate(today.getDate() - 30);

  return (
    <div className="ds-card ds-card-glow-violet ds-card-interactive flex min-h-[200px] flex-col p-5 sm:p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <TrendingUp className="h-4 w-4 text-brand-violet" />
        <span className="ds-overline">История использования</span>
      </div>
      <div className="mt-auto pt-6">
        {/* Single accent per surface: violet card → violet bars. The busiest day
            is highlighted (brighter violet + glow); the rest are muted violet. */}
        <div className="flex h-20 items-end gap-1">
          {bars.map((h, i) => (
            <span
              key={i}
              title={`${fmt(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))}`}
              style={
                i === peak
                  ? {
                      height: `${Math.round(h * 100)}%`,
                      backgroundImage: "var(--grad-violet)",
                      boxShadow: "0 0 16px -2px rgba(123,92,255,0.6)",
                    }
                  : { height: `${Math.round(h * 100)}%` }
              }
              className={
                i === peak
                  ? "flex-1 rounded-sm"
                  : "flex-1 rounded-sm bg-[color:var(--violet-400)]/25"
              }
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{fmt(start)}</span>
          <span>{fmt(mid)}</span>
          <span>{fmt(today)}</span>
        </div>
      </div>
    </div>
  );
}
