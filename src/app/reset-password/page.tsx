"use client";

// /reset-password — landing page from the password-reset email.
//
// Supabase puts the recovery token in the URL hash and exchanges it
// via detectSessionInUrl in the browser client. After that the user
// has a temporary session and we can call updateUser({ password }).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { getBrowserClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  useEffect(() => { document.title = "Новый пароль — Gen Go"; }, []);
  const { session, loading } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  // If user lands here without any session (e.g. direct visit), nudge them
  // back to /login — there's nothing to reset.
  useEffect(() => {
    if (!loading && !session) {
      const t = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="ds-aurora" aria-hidden />
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Новый пароль</h1>
          <p className="mt-1 text-sm text-muted-foreground">Введите новый пароль для аккаунта.</p>
        </div>

        {!loading && !session ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Ссылка недействительна или истекла. Сейчас перенаправим на вход.
          </div>
        ) : null}

        {ok ? (
          <div className="rounded-md border border-[color:var(--success)]/40 bg-[color:var(--success-tint)] p-3 text-sm text-[color:var(--success)]">
            Пароль обновлён. Можно пользоваться.
            <div className="mt-2">
              <Button size="sm" onClick={() => router.push("/")}>
                В приложение
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              if (pw.length < 8) {
                setErr("Минимум 8 символов");
                return;
              }
              if (pw !== pw2) {
                setErr("Пароли не совпадают");
                return;
              }
              setBusy(true);
              const { error } = await getBrowserClient().auth.updateUser({ password: pw });
              setBusy(false);
              if (error) {
                setErr(
                  "Не удалось обновить пароль. Возможно, ссылка устарела — запросите новую на странице входа («Забыли пароль?»).",
                );
                return;
              }
              setOk(true);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pw">Новый пароль</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Повторите пароль</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
            {err ? <p className="text-xs text-destructive">{err}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !session}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
