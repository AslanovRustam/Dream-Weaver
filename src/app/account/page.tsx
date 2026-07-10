"use client";

// /account — personal cabinet. Requires auth (redirects to /login if not).
// Redesigned layout (ported from the redesign):
//   header : avatar + display name (from profile) + "Изменить" → edit modal
//   row 1  : credits card (+ "Купить кредиты" → /billing) and usage-history card
//   stack  : subscription card, account-info card (read-only email),
//            security card (self-service password change)
//
// The edit-profile modal writes real profile fields via PATCH /api/me; the
// password change hits /api/auth/change-password. The avatar upload is
// UI-only (mirrored to localStorage) until a real endpoint exists.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
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

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { apiJson, ApiError } from "@/lib/api-client";
import { getBrowserClient } from "@/lib/supabase/browser";
import { AppHeader } from "@/components/AppHeader";

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

// Same placeholder avatar as the top-bar profile menu, for consistency.
const AVATAR_URL = "https://i.pravatar.cc/128?img=68";

// Display name derived from the real profile (same convention as AppHeader).
function displayName(p: Profile): string {
  return (
    p.nickname ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    p.email ||
    "Пользователь"
  );
}

export default function AccountPage() {
  const router = useRouter();
  useEffect(() => {
    document.title = "Личный кабинет — Dream Weaver Studio";
  }, []);
  const { isAuthenticated, loading: authLoading } = useAuth();
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
    } catch {
      /* ignore quota errors */
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<MeResponse>("/api/me");
        if (!cancelled) setMe(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : "Не удалось загрузить профиль");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
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
      <div className="min-h-screen">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
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
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <RefreshCw className="h-4 w-4" />
              Обновить
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Кнопка «К генерации» на месте кнопки «Назад» (сверху слева),
            в стиле таба «Мужчина/Женщина»: салатовая обводка + прозрачная
            салатовая заливка. */}
        <Link
          href="/"
          className="mb-16 inline-flex items-center gap-1.5 rounded-md border border-accent-green bg-accent-green/10 px-3 py-1.5 text-sm font-medium text-accent-green transition hover:bg-accent-green/15"
        >
          <ChevronLeft className="h-4 w-4" />
          К генерации
        </Link>

        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-accent-green ring-offset-2 ring-offset-background">
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="ds-h1 truncate">{displayName(me.profile)}</h1>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Изменить
                </button>
              </div>
              <p className="truncate text-sm text-muted-foreground">{me.profile.email}</p>
            </div>
          </div>
          {me.is_super_admin ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Админка</Link>
            </Button>
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

  const labelCls = "mb-2 block text-sm font-semibold text-foreground";

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
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-0 rounded-2xl border border-border bg-panel p-0"
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
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/5">
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white/15"
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
                msg.kind === "ok" ? "text-xs text-emerald-500" : "text-xs text-destructive"
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
            className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/15"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
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
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <Tag className="h-4 w-4" />
          Подписка
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold">Бесплатный план</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Откройте все возможности с подпиской
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/billing">Улучшить план</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Read-only account info. Email is changed by an administrator on request.
// The support button is a placeholder — swap the mailto for the real channel
// (email / Telegram) once it exists.
const SUPPORT_HREF = "mailto:support@clickable.agency";

function AccountInfoCard({ email }: { email: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Данные аккаунта</CardTitle>
        <CardDescription>Изменение email выполняется через администратора.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <p className="ds-label">Email</p>
          <div className="flex h-11 items-center rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
            {email}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Чтобы изменить email, обратитесь в поддержку — мы внесём правки вручную.
        </p>
        <Button asChild variant="outline">
          <a href={SUPPORT_HREF}>Связаться с поддержкой</a>
        </Button>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Безопасность</CardTitle>
        <CardDescription>
          Смена пароля. Если входите через Google — добавит пароль к аккаунту.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
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
              setMsg({
                kind: "err",
                text: e instanceof ApiError ? e.message : "Не удалось сменить",
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
                msg.kind === "ok" ? "text-xs text-emerald-500" : "text-xs text-destructive"
              }
            >
              {msg.text}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Сохраняем…" : "Сменить пароль"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Assumed size of a full monthly credit pool — used for the "X / N" counter
// and the progress bar (no real quota exists in the data model yet).
const MAX_CREDIT_POOL = 10;

function CreditsCard({ balance }: { balance: number | string }) {
  const n = typeof balance === "number" ? balance : Number(balance) || 0;
  const label = n.toFixed(2).replace(/\.00$/, "");
  const pct = Math.max(0, Math.min(100, Math.round((n / MAX_CREDIT_POOL) * 100)));
  return (
    <Card className="flex min-h-[190px] flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <Coins className="h-4 w-4" />
          Кредиты
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center pt-4">
        {/* Внутренняя панель: счётчик «осталось X / N» + кнопка + прогресс-бар. */}
        <div className="rounded-xl border border-border bg-background/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Осталось в этом месяце</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {label}
                <span className="text-muted-foreground"> / {MAX_CREDIT_POOL}</span>
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/billing">
                <Plus className="h-4 w-4" />
                Купить кредиты
              </Link>
            </Button>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent-green transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageHistoryCard() {
  // Placeholder chart until a real usage-history endpoint exists. Fixed bar
  // heights (one spike) mirror the reference; dates span the last ~30 days.
  const bars = Array.from({ length: 28 }, (_, i) => (i === 19 ? 0.95 : 0.05 + (i % 3) * 0.03));
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const today = new Date();
  const mid = new Date(today);
  mid.setDate(today.getDate() - 15);
  const start = new Date(today);
  start.setDate(today.getDate() - 30);

  return (
    <Card className="flex min-h-[190px] flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          История использования
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end pt-6">
        <div className="flex h-20 items-end gap-1">
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${Math.round(h * 100)}%` }}
              className={`flex-1 rounded-sm ${
                i === 19 ? "bg-accent-green" : "bg-muted-foreground/25"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{fmt(start)}</span>
          <span>{fmt(mid)}</span>
          <span>{fmt(today)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
