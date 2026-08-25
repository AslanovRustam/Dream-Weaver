"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Save, ShieldCheck } from "lucide-react";

import { AD_PLATFORMS, type AdPlatformId } from "@/lib/ads";
import {
  type Credentials,
  type EspProvider,
  getCredentials,
  saveCredentials,
} from "@/lib/credentials";

export function SettingsApp() {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCreds(getCredentials());
  }, []);

  if (!creds) return null;

  const patch = (p: Partial<Credentials>) => {
    setCreds((c) => (c ? { ...c, ...p } : c));
    setSaved(false);
  };
  const patchPlatform = (id: AdPlatformId, p: Partial<Credentials["meta"]>) =>
    patch({ [id]: { ...creds[id], ...p } } as Partial<Credentials>);

  const onSave = () => {
    saveCredentials(creds);
    setSaved(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <p className="ds-overline text-accent-green">Интеграции</p>
        <h1 className="ds-h1 mt-1">Ключи и подключения</h1>
        <p className="ds-body mt-2 text-muted-foreground">
          Добавьте свои ключи — они используются от вашего имени и хранятся в этом браузере.
        </p>
      </header>

      {/* Security note */}
      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-background/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
        <p className="ds-caption">
          Ключи хранятся локально в вашем браузере и передаются нашему серверу только для вызова
          соответствующего сервиса. Не вводите чужие ключи.
        </p>
      </div>

      {/* Ad platforms */}
      <Section title="Рекламные кабинеты" icon={<KeyRound className="h-4 w-4" />}>
        {AD_PLATFORMS.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ backgroundColor: p.color }}
                aria-hidden
              >
                {p.glyph}
              </span>
              <p className="text-sm font-medium">{p.name}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="password"
                autoComplete="off"
                className={inputCls}
                value={creds[p.id].token}
                onChange={(e) => patchPlatform(p.id, { token: e.target.value })}
                placeholder="Access token"
              />
              <input
                type="text"
                className={inputCls}
                value={creds[p.id].accountId}
                onChange={(e) => patchPlatform(p.id, { accountId: e.target.value })}
                placeholder="ID кабинета"
              />
            </div>
          </div>
        ))}
      </Section>

      {/* ESP */}
      <Section title="Email-рассылки (ESP)" icon={<KeyRound className="h-4 w-4" />}>
        <Field label="Провайдер">
          <select
            className={selectCls}
            value={creds.esp.provider}
            onChange={(e) => patch({ esp: { ...creds.esp, provider: e.target.value as EspProvider } })}
          >
            <option value="">Не выбран</option>
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="smtp">SMTP</option>
          </select>
        </Field>
        <Field label="API-ключ">
          <input
            type="password"
            autoComplete="off"
            className={inputCls}
            value={creds.esp.apiKey}
            onChange={(e) => patch({ esp: { ...creds.esp, apiKey: e.target.value } })}
            placeholder="Ключ ESP"
          />
        </Field>
        <Field label="Отправитель" hint="email, с которого идут письма">
          <input
            type="email"
            className={inputCls}
            value={creds.esp.sender}
            onChange={(e) => patch({ esp: { ...creds.esp, sender: e.target.value } })}
            placeholder="noreply@yourbrand.com"
          />
        </Field>
      </Section>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Сохранено" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ds-card mb-4 rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-green/15 text-accent-green">
          {icon}
        </span>
        <h2 className="ds-h4">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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
  "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
const selectCls = `${inputCls} h-11`;
