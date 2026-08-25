"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, Save, Send, Upload } from "lucide-react";

import { BriefUploader } from "@/components/BriefUploader";
import {
  EMAIL_STYLES,
  type EmailDraft,
  type EmailStyle,
  newDraft,
  saveDraft,
} from "@/lib/mailing";

export function EmailGenApp() {
  const [draft, setDraft] = useState<EmailDraft>(() => newDraft());
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof EmailDraft>(key: K, value: EmailDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const onSave = () => {
    saveDraft(draft);
    setSaved(true);
  };

  const onHeroFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("heroImage", String(reader.result));
    reader.readAsDataURL(file);
  };
  const setStep = (i: number, v: string) => {
    const s = [...(draft.steps ?? [])];
    s[i] = v;
    set("steps", s);
  };

  // Apply brief-extracted fields (keys match EmailDraft) to the draft.
  const applyBrief = (fields: Record<string, string>) => {
    const allow: (keyof EmailDraft)[] = [
      "name",
      "subject",
      "preheader",
      "brand",
      "style",
      "heroTitle",
      "heroSubtitle",
      "body",
      "ctaText",
      "ctaUrl",
      "footer",
    ];
    setDraft((d) => {
      const next = { ...d };
      for (const k of allow) if (fields[k]) (next[k] as string) = fields[k];
      return next;
    });
    setSaved(false);
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ── Form ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <header>
          <p className="ds-overline text-accent-green">Email</p>
          <h1 className="ds-h1 mt-1">Генератор писем</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Соберите письмо для рассылки — сохраните и отправьте из кабинета.
          </p>
        </header>

        <BriefUploader
          product="email"
          onApply={applyBrief}
          onGenerate={(r) => {
            applyBrief(r.fields);
            // Email has no separate AI backend — "generate" fills fields and
            // uses the generation prompt as the body when none was extracted.
            if (!r.fields.body && r.generationPrompt) {
              setDraft((d) => ({ ...d, body: r.generationPrompt }));
            }
          }}
        />

        <Field label="Название письма (внутреннее)">
          <input
            className={inputCls}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Напр. Welcome — сентябрь"
          />
        </Field>

        <div>
          <label className="mb-2 block ds-h4">Стиль</label>
          <select
            className={`${inputCls} h-12`}
            value={draft.style}
            onChange={(e) => set("style", e.target.value as EmailStyle)}
          >
            {EMAIL_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <Field label="Тема письма">
          <input className={inputCls} value={draft.subject} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field label="Прехедер">
          <input className={inputCls} value={draft.preheader} onChange={(e) => set("preheader", e.target.value)} />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Бренд">
            <input className={inputCls} value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <div>
            <label className="mb-2 block ds-h4">Акцент</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : "#7B5CFF"}
                onChange={(e) => set("accent", e.target.value)}
                aria-label="Акцентный цвет"
                className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated"
              />
            </div>
          </div>
        </div>

        {/* Hero image + dark theme */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="mb-2 block ds-h4">Hero-картинка</label>
            {draft.heroImage ? (
              <div className="flex items-center gap-2">
                <img
                  src={draft.heroImage}
                  alt=""
                  className="h-11 w-20 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => set("heroImage", "")}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Убрать
                </button>
              </div>
            ) : (
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-elevated px-3 text-sm text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground">
                <Upload className="h-4 w-4" /> Загрузить баннер
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onHeroFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
          <div>
            <label className="mb-2 block ds-h4">Тёмная</label>
            <button
              type="button"
              onClick={() => set("dark", !draft.dark)}
              className={`h-11 w-20 rounded-lg border text-xs font-medium transition ${
                draft.dark
                  ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {draft.dark ? "Вкл" : "Выкл"}
            </button>
          </div>
        </div>

        <Field label="Заголовок (hero)">
          <input className={inputCls} value={draft.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
        </Field>
        <Field label="Подзаголовок">
          <input className={inputCls} value={draft.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} />
        </Field>
        <Field label="Текст письма">
          <textarea
            className={`${inputCls} min-h-[110px] resize-y py-2.5`}
            rows={4}
            value={draft.body}
            onChange={(e) => set("body", e.target.value)}
          />
          <p className="mt-1.5 ds-caption">
            Выделяйте акцентом через <span className="font-mono">**двойные звёздочки**</span>.
          </p>
        </Field>

        <Field label="Шаги активации бонуса">
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                className={inputCls}
                value={draft.steps?.[i] ?? ""}
                onChange={(e) => setStep(i, e.target.value)}
                placeholder={`Шаг ${i + 1}`}
              />
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Кнопка (верх)">
            <input className={inputCls} value={draft.ctaText} onChange={(e) => set("ctaText", e.target.value)} />
          </Field>
          <Field label="Кнопка (бонус)">
            <input
              className={inputCls}
              value={draft.bonusCtaText}
              onChange={(e) => set("bonusCtaText", e.target.value)}
              placeholder="GET BONUS"
            />
          </Field>
        </div>
        <Field label="Ссылка кнопки">
          <input className={inputCls} value={draft.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} />
        </Field>

        <Field label="Футер">
          <textarea
            className={`${inputCls} min-h-[64px] resize-y py-2.5`}
            rows={2}
            value={draft.footer}
            onChange={(e) => set("footer", e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Сохранено" : "Сохранить письмо"}
          </button>
          <Link
            href="/mailing"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
          >
            <Send className="h-4 w-4 text-accent-green" />
            В рассылки
          </Link>
        </div>
        {saved ? (
          <p className="ds-caption">Письмо сохранено — доступно в кабинете рассылок для отправки.</p>
        ) : null}
      </div>

      {/* ── Live email preview ───────────────────────────────── */}
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <div className="mb-2 flex items-center gap-2 ds-caption">
          <Mail className="h-4 w-4" /> Предпросмотр письма
        </div>
        <EmailPreview draft={draft} />
      </div>
    </div>
  );
}

// Render **highlighted** spans in the accent colour (simple bold markdown).
function renderMd(text: string, accent: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    return m ? (
      <strong key={i} style={{ color: accent }}>
        {m[1]}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    );
  });
}

const PAYMENTS = ["VISA", "Mastercard", "Skrill", "NETELLER", "Yandex", "QIWI", "Trustly"];

// Rich promo email template rendered live from the draft — dark iGaming look
// (hero, big gradient CTAs, bonus steps, payments) or a clean light layout.
function EmailPreview({ draft }: { draft: EmailDraft }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : "#22c55e";
  const dark = draft.dark;
  const bg = dark ? "#0b1226" : "#ffffff";
  const textMain = dark ? "#eaf0ff" : "#0f172a";
  const textMuted = dark ? "#93a4cc" : "#475569";
  const footerBg = dark ? "#080d1c" : "#f7f8fa";
  const divider = dark ? "rgba(255,255,255,0.08)" : "#eef1f4";

  const Cta = ({ label }: { label: string }) => (
    <span
      className="inline-block w-full rounded-full py-3.5 text-center text-base font-extrabold uppercase tracking-wide text-white shadow-lg"
      style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)`, boxShadow: `0 8px 24px -8px ${accent}` }}
    >
      {label}
    </span>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-[#e9edf2] p-4 sm:p-6">
      {/* Inbox meta */}
      <div className="mb-3 px-1">
        <p className="truncate text-sm font-semibold text-[#111827]">{draft.subject || "Без темы"}</p>
        <p className="truncate text-xs text-[#4b5563]">{draft.preheader}</p>
      </div>

      {/* Email body */}
      <div className="mx-auto max-w-[500px] overflow-hidden rounded-2xl shadow-sm" style={{ background: bg }}>
        {/* Hero */}
        {draft.heroImage ? (
          <img src={draft.heroImage} alt="" className="block h-auto w-full" draggable={false} />
        ) : (
          <div
            className="flex h-40 w-full items-center justify-center"
            style={{ background: `linear-gradient(160deg, ${accent}44, ${dark ? "#0b1226" : "#eef2ff"})` }}
          >
            <span className="text-2xl font-extrabold tracking-tight" style={{ color: dark ? "#fff" : accent }}>
              {draft.brand || "BRAND"}
            </span>
          </div>
        )}

        {/* Headline + primary CTA */}
        <div className="px-6 pb-2 pt-6 text-center">
          <h2 className="text-2xl font-extrabold uppercase leading-tight" style={{ color: textMain }}>
            {renderMd(draft.heroTitle || "Заголовок акции", accent)}
          </h2>
          {draft.heroSubtitle ? (
            <p className="mt-1.5 text-sm" style={{ color: textMuted }}>
              {draft.heroSubtitle}
            </p>
          ) : null}
          {draft.ctaText ? <div className="mt-4">{<Cta label={draft.ctaText} />}</div> : null}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="whitespace-pre-line text-center text-sm leading-relaxed" style={{ color: textMuted }}>
            {renderMd(draft.body || "Текст письма появится здесь.", accent)}
          </p>

          {/* Bonus steps */}
          {draft.steps?.filter(Boolean).length ? (
            <div className="mt-5">
              <p className="mb-3 text-center text-sm font-extrabold uppercase" style={{ color: textMain }}>
                Чтобы активировать бонус:
              </p>
              <ul className="flex flex-col gap-2.5">
                {draft.steps.filter(Boolean).map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-snug" style={{ color: textMuted }}>
                      {renderMd(s, accent)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {draft.bonusCtaText ? <div className="mt-5">{<Cta label={draft.bonusCtaText} />}</div> : null}
        </div>

        {/* App + payments (dark promo only) */}
        {dark ? (
          <div className="px-6 pb-5" style={{ borderTop: `1px solid ${divider}` }}>
            <p className="mb-3 mt-4 text-center text-xs font-bold uppercase tracking-wide" style={{ color: textMuted }}>
              Download our mobile app
            </p>
            <div className="mb-4 flex justify-center gap-2">
              {["App Store", "Google Play"].map((a) => (
                <span
                  key={a}
                  className="rounded-lg border px-3 py-1.5 text-[11px] font-medium"
                  style={{ borderColor: divider, color: textMuted }}
                >
                  {a}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {PAYMENTS.map((p) => (
                <span
                  key={p}
                  className="rounded px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", color: textMuted }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-6 py-4 text-center" style={{ background: footerBg, borderTop: `1px solid ${divider}` }}>
          <p className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
            {draft.footer}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
            Unsubscribe
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block ds-h4">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
