"use client";

// /account — personal cabinet. Requires auth (redirects via Header's guard
// at the root layout level; here we just assume isAuthenticated). Layout:
//   left  : profile form (name, surname, nick, phone, contact)
//   right : balance card, change-password card, sign-out
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

export default function AccountPage() {
  const router = useRouter();
  useEffect(() => { document.title = "Личный кабинет — Dream Weaver Studio"; }, []);
  const { isAuthenticated, loading: authLoading, signOut } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    return <CenterMessage>Загрузка…</CenterMessage>;
  }
  if (error || !me) {
    return <CenterMessage>{error || "Профиль не найден"}</CenterMessage>;
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Личный кабинет</h1>
            <p className="text-sm text-muted-foreground">{me.profile.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">К генерации</Link>
            </Button>
            {me.is_super_admin ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">Админка</Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
            >
              Выйти
            </Button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <ProfileCard profile={me.profile} onSaved={(p) => setMe({ ...me, profile: p })} />
          </div>
          <div className="space-y-6">
            <BalanceCard balance={me.profile.credits_balance} />
            <PasswordCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ProfileCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState({
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
    nickname: profile.nickname || "",
    phone: profile.phone || "",
    contact: profile.contact || "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Email менять нельзя — он привязан к аккаунту.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setMsg(null);
            setBusy(true);
            try {
              const res = await apiJson<{ profile: Profile }>("/api/me", {
                method: "PATCH",
                json: form,
              });
              onSaved(res.profile);
              setMsg({ kind: "ok", text: "Сохранено" });
            } catch (e) {
              setMsg({
                kind: "err",
                text: e instanceof ApiError ? e.message : "Не удалось сохранить",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="first_name"
              label="Имя"
              value={form.first_name}
              onChange={(v) => setForm({ ...form, first_name: v })}
            />
            <Field
              id="last_name"
              label="Фамилия"
              value={form.last_name}
              onChange={(v) => setForm({ ...form, last_name: v })}
            />
            <Field
              id="nickname"
              label="Ник"
              value={form.nickname}
              onChange={(v) => setForm({ ...form, nickname: v })}
            />
            <Field
              id="phone"
              label="Телефон"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
          </div>
          <Field
            id="contact"
            label="Контакт (Telegram, Slack, ...)"
            value={form.contact}
            onChange={(v) => setForm({ ...form, contact: v })}
            placeholder="@username или ссылка"
          />
          {msg ? (
            <p
              className={
                msg.kind === "ok" ? "text-xs text-emerald-500" : "text-xs text-destructive"
              }
            >
              {msg.text}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function BalanceCard({ balance }: { balance: number | string }) {
  const n = typeof balance === "number" ? balance : Number(balance) || 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-muted-foreground">
          Баланс кредитов
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{n.toFixed(2)}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Кредиты выдаёт администратор. Пополнение придёт позже.
        </p>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Смена пароля</CardTitle>
        <CardDescription>Если входите через Google — добавит пароль к аккаунту.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
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
          {msg ? (
            <p
              className={
                msg.kind === "ok" ? "text-xs text-emerald-500" : "text-xs text-destructive"
              }
            >
              {msg.text}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Сохраняем…" : "Сменить"}
          </Button>
        </form>
        <Separator className="my-4" />
      </CardContent>
    </Card>
  );
}
