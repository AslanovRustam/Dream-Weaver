"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { useAppRole } from "@/lib/roles";
import { getBrowserClient } from "@/lib/supabase/browser";

// After any login we send the user to the generation page (/). We still
// accept `error` in the query string so OAuth provider failures can surface
// a readable message, but we deliberately drop any `redirect` hint — the
// product decision is "always land on /".

const POST_LOGIN_TARGET = "/" as const;

// Supabase returns English, technical auth errors. Map the handful users
// actually hit to clear Russian copy, with a friendly fallback for the rest —
// so the login screen (the most failure-prone one) never shows raw English.
function authErrorRu(message: string | null | undefined): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials"))
    return "Неверный email или пароль.";
  if (m.includes("email not confirmed"))
    return "Email не подтверждён — проверьте почту и подтвердите адрес.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
    return "Этот email уже зарегистрирован. Войдите или восстановите пароль.";
  if (m.includes("password should be at least") || m.includes("password is too short"))
    return "Пароль слишком короткий — минимум 8 символов.";
  if (m.includes("unable to validate email") || m.includes("invalid email") || m.includes("invalid format"))
    return "Проверьте формат email.";
  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many"))
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "Регистрация сейчас недоступна.";
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed"))
    return "Нет соединения. Проверьте интернет и попробуйте снова.";
  return "Не удалось выполнить вход. Проверьте данные и попробуйте снова.";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5.2c-.4.4 6.7-4.9 6.7-14.7 0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next.js).
// The wrapper renders a null fallback while the client hydrates — the login
// form appears immediately on the client, so the UI is unchanged.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  useEffect(() => { document.title = "Войти — Dream Weaver Studio"; }, []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const { isGuest, loading: roleLoading } = useAppRole();

  // If already logged in, leave the login page → always to /.
  // A dev-pinned "guest" keeps this screen reachable in local preview; in
  // production isGuest is false for anyone holding a session, so the redirect
  // behaves exactly as before.
  useEffect(() => {
    if (!loading && !roleLoading && isAuthenticated && !isGuest) {
      router.push(POST_LOGIN_TARGET);
    }
  }, [isAuthenticated, loading, roleLoading, isGuest, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Dream Weaver Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Войдите чтобы продолжить</p>
        </div>

        {searchParams.get("error") ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {searchParams.get("error")}
          </div>
        ) : null}

        <GoogleButton redirectTo={POST_LOGIN_TARGET} />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">или</span>
          </div>
        </div>

        {/* ?mode=signup (used by the guest "Зарегистрироваться" CTAs) opens the
            registration tab directly instead of dropping onto sign-in. */}
        <Tabs
          defaultValue={searchParams.get("mode") === "signup" ? "sign-up" : "sign-in"}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign-in">Вход</TabsTrigger>
            <TabsTrigger value="sign-up">Регистрация</TabsTrigger>
          </TabsList>
          <TabsContent value="sign-in">
            <SignInForm redirectTo={POST_LOGIN_TARGET} />
          </TabsContent>
          <TabsContent value="sign-up">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GoogleButton({ redirectTo }: { redirectTo: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          const supa = getBrowserClient();
          // Send user back to the current origin (Supabase handles ?code=...).
          const absoluteRedirect = new URL(redirectTo, window.location.origin).toString();
          const { error } = await supa.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: absoluteRedirect,
              // Force the Google account picker every time. Without
              // this, Google silently signs the user in with the most
              // recently used profile, so multi-account users can't
              // switch between work / personal without logging out
              // everywhere first.
              queryParams: { prompt: "select_account" },
            },
          });
          if (error) {
            setErr(authErrorRu(error.message));
            setBusy(false);
          }
          // On success Supabase redirects away from this page.
        }}
      >
        <GoogleIcon />
        Войти через Google
      </Button>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        const { error } = await getBrowserClient().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        setBusy(false);
        if (error) {
          setErr(authErrorRu(error.message));
          return;
        }
        router.push(redirectTo);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="signin-pw">Пароль</Label>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setForgotOpen(true)}
          >
            Забыли?
          </button>
        </div>
        <Input
          id="signin-pw"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Входим…" : "Войти"}
      </Button>
      <ForgotPasswordInline open={forgotOpen} setOpen={setForgotOpen} initialEmail={email} />
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        setOk("");
        setBusy(true);
        const { data, error } = await getBrowserClient().auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: new URL("/", window.location.origin).toString(),
          },
        });
        setBusy(false);
        if (error) {
          setErr(authErrorRu(error.message));
          return;
        }
        // If "Confirm email" is enabled in Supabase, session is null and a
        // verification email is sent. Otherwise we're logged in immediately.
        if (data.session) {
          setOk("Аккаунт создан. Перенаправляем…");
          window.location.href = "/";
        } else {
          setOk("Аккаунт создан. Проверьте почту для подтверждения.");
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-pw">Пароль (минимум 8 символов)</Label>
        <Input
          id="signup-pw"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {ok ? <p className="text-xs text-emerald-500">{ok}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Создаём…" : "Создать аккаунт"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Новые аккаунты создаются с балансом 0 кредитов. Их выдаёт администратор.
      </p>
    </form>
  );
}

function ForgotPasswordInline({
  open,
  setOpen,
  initialEmail,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setEmail(initialEmail), [initialEmail]);

  if (!open) return null;

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      {done ? (
        <div className="space-y-2">
          <p>Если такой email существует, мы отправили письмо со ссылкой на сброс.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDone(false);
              setOpen(false);
            }}
          >
            Закрыть
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email для сброса пароля</Label>
          <Input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !email}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await fetch("/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email,
                      redirect_to: new URL("/reset-password", window.location.origin).toString(),
                    }),
                  });
                  setDone(true);
                } catch {
                  setErr("Не удалось отправить письмо. Проверьте соединение и попробуйте снова.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Отправляем…" : "Отправить ссылку"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
        </div>
      )}
    </div>
  );
}
