"use client";

// «Ключи и подключения»: пользователь подключает свои рекламные кабинеты и
// почтовый сервис. Ключи уходят на сервер и хранятся там зашифрованными —
// обратно приходит только маска «••••abcd». Пустое поле ключа при
// сохранении — «оставить прежний».
import { useEffect, useState } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, Save, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";

import { AD_PLATFORMS, type AdPlatformId } from "@/lib/ads";
import {
  IntegrationsUnavailable,
  listIntegrations,
  migrateLegacyCredentials,
  removeIntegration,
  saveIntegration,
} from "@/lib/credentials";
import { mask, type EspProvider, type IntegrationProvider, type IntegrationView } from "@/lib/integrations/types";

type AdForm = { secret: string; accountId: string };
type EspForm = { secret: string; espProvider: EspProvider; sender: string };

export function SettingsApp() {
  const [list, setList] = useState<IntegrationView[] | null>(null);
  const [problem, setProblem] = useState<string>("");
  const [ads, setAds] = useState<Record<AdPlatformId, AdForm>>({
    meta: { secret: "", accountId: "" },
    google: { secret: "", accountId: "" },
    tiktok: { secret: "", accountId: "" },
  });
  const [esp, setEsp] = useState<EspForm>({ secret: "", espProvider: "", sender: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fill = (items: IntegrationView[]) => {
    setList(items);
    const by = (p: IntegrationProvider) => items.find((i) => i.provider === p)?.public ?? {};
    setAds({
      meta: { secret: "", accountId: by("meta").accountId ?? "" },
      google: { secret: "", accountId: by("google").accountId ?? "" },
      tiktok: { secret: "", accountId: by("tiktok").accountId ?? "" },
    });
    setEsp({ secret: "", espProvider: by("esp").espProvider ?? "", sender: by("esp").sender ?? "" });
  };

  useEffect(() => {
    (async () => {
      try {
        // Ключи от старой версии лежали в браузере — переносим на сервер.
        const moved = await migrateLegacyCredentials();
        if (moved) toast.success(`Ключи перенесены в защищённое хранилище: ${moved}`);
        fill(await listIntegrations());
      } catch (e) {
        setProblem(
          e instanceof IntegrationsUnavailable
            ? `Хранилище ключей ещё не настроено: ${e.message}. Ключи из браузера никуда не делись — перенесём, как только оно заработает.`
            : "Не удалось загрузить подключения. Войдите в аккаунт и обновите страницу.",
        );
        setList([]);
      }
    })();
  }, []);

  if (!list) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const view = (p: IntegrationProvider) => list.find((i) => i.provider === p);
  const disabled = !!problem;

  const onSave = async () => {
    setSaving(true);
    try {
      let next = list;
      for (const p of AD_PLATFORMS) {
        const f = ads[p.id];
        const cur = view(p.id);
        const changed = f.secret.trim() || (cur && f.accountId.trim() !== (cur.public.accountId ?? ""));
        if (!changed) continue;
        if (!cur && !f.secret.trim()) continue;
        next = await saveIntegration({ provider: p.id, secret: f.secret, accountId: f.accountId });
      }
      const curEsp = view("esp");
      const espChanged =
        esp.secret.trim() ||
        (curEsp && (esp.espProvider !== (curEsp.public.espProvider ?? "") || esp.sender.trim() !== (curEsp.public.sender ?? "")));
      if (espChanged && (curEsp || esp.secret.trim())) {
        next = await saveIntegration({ provider: "esp", secret: esp.secret, espProvider: esp.espProvider, sender: esp.sender });
      }
      fill(next);
      setSaved(true);
      toast.success("Сохранено — ключи зашифрованы на сервере");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const onDisconnect = async (p: IntegrationProvider, name: string) => {
    try {
      await removeIntegration(p);
      fill(list.filter((i) => i.provider !== p));
      toast(`${name}: отключено, ключ удалён с сервера`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отключить");
    }
  };

  const secretHint = (p: IntegrationProvider) => {
    const v = view(p);
    return v?.public.last4 ? `Сохранён ${mask(v.public.last4)} — оставьте пустым, чтобы не менять` : "";
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <p className="ds-overline text-accent-green">Интеграции</p>
        <h1 className="ds-h1 mt-1">Ключи и подключения</h1>
        <p className="ds-body mt-2 text-muted-foreground">
          Подключите свои кабинеты и почтовый сервис — GenGO будет работать с ними от вашего имени.
        </p>
      </header>

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-background/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
        <p className="ds-caption">
          Ключи хранятся на сервере зашифрованными (AES-256) и обратно в браузер не возвращаются — вы видите только последние
          4 символа. Используются только для вызова соответствующего сервиса. Не вводите чужие ключи.
        </p>
      </div>

      {problem ? (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="ds-caption text-amber-200">{problem}</p>
        </div>
      ) : null}

      <Section title="Рекламные кабинеты" icon={<KeyRound className="h-4 w-4" />}>
        {AD_PLATFORMS.map((p) => {
          const v = view(p.id);
          return (
            <div key={p.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.glyph}
                </span>
                <p className="flex-1 text-sm font-medium">{p.name}</p>
                {v ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-accent-green">
                      <Check className="h-3.5 w-3.5" /> Подключён
                    </span>
                    <button
                      type="button"
                      onClick={() => void onDisconnect(p.id, p.name)}
                      title="Отключить и удалить ключ"
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                    >
                      <Unplug className="h-3.5 w-3.5" /> Отключить
                    </button>
                  </>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="password"
                  autoComplete="off"
                  disabled={disabled}
                  className={inputCls}
                  value={ads[p.id].secret}
                  onChange={(e) => {
                    setAds((a) => ({ ...a, [p.id]: { ...a[p.id], secret: e.target.value } }));
                    setSaved(false);
                  }}
                  placeholder={v?.public.last4 ? mask(v.public.last4) : "Access token"}
                />
                <input
                  type="text"
                  disabled={disabled}
                  className={inputCls}
                  value={ads[p.id].accountId}
                  onChange={(e) => {
                    setAds((a) => ({ ...a, [p.id]: { ...a[p.id], accountId: e.target.value } }));
                    setSaved(false);
                  }}
                  placeholder="ID кабинета"
                />
              </div>
              {secretHint(p.id) ? <p className="mt-1.5 ds-caption">{secretHint(p.id)}</p> : null}
            </div>
          );
        })}
      </Section>

      <Section title="Email-рассылки (ESP)" icon={<KeyRound className="h-4 w-4" />}>
        {view("esp") ? (
          <div className="-mt-1 flex items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-accent-green">
              <Check className="h-3.5 w-3.5" /> Подключён
            </span>
            <button
              type="button"
              onClick={() => void onDisconnect("esp", "Почтовый сервис")}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <Unplug className="h-3.5 w-3.5" /> Отключить
            </button>
          </div>
        ) : null}
        <Field label="Провайдер">
          <select
            className={selectCls}
            disabled={disabled}
            value={esp.espProvider}
            onChange={(e) => {
              setEsp((s) => ({ ...s, espProvider: e.target.value as EspProvider }));
              setSaved(false);
            }}
          >
            <option value="">Не выбран</option>
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="smtp">SMTP</option>
          </select>
        </Field>
        <Field label="API-ключ" hint={secretHint("esp") || undefined}>
          <input
            type="password"
            autoComplete="off"
            disabled={disabled}
            className={inputCls}
            value={esp.secret}
            onChange={(e) => {
              setEsp((s) => ({ ...s, secret: e.target.value }));
              setSaved(false);
            }}
            placeholder={view("esp")?.public.last4 ? mask(view("esp")!.public.last4) : "Ключ ESP"}
          />
        </Field>
        <Field label="Отправитель" hint="email, с которого идут письма">
          <input
            type="email"
            disabled={disabled}
            className={inputCls}
            value={esp.sender}
            onChange={(e) => {
              setEsp((s) => ({ ...s, sender: e.target.value }));
              setSaved(false);
            }}
            placeholder="noreply@yourbrand.com"
          />
        </Field>
      </Section>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={disabled || saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Сохраняем…" : saved ? "Сохранено" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ds-card mb-4 rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">{icon}</span>
        <h2 className="ds-h4">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 ds-label">
        {label}
        {hint ? <span className="ds-caption font-normal normal-case tracking-normal">· {hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green disabled:opacity-50";
const selectCls = `${inputCls} h-11`;
