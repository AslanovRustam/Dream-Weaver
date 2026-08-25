"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, Save, Send } from "lucide-react";

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

        <Field label="Заголовок (hero)">
          <input className={inputCls} value={draft.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
        </Field>
        <Field label="Подзаголовок">
          <input className={inputCls} value={draft.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} />
        </Field>
        <Field label="Текст письма">
          <textarea
            className={`${inputCls} min-h-[120px] resize-y py-2.5`}
            rows={4}
            value={draft.body}
            onChange={(e) => set("body", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Текст кнопки">
            <input className={inputCls} value={draft.ctaText} onChange={(e) => set("ctaText", e.target.value)} />
          </Field>
          <Field label="Ссылка кнопки">
            <input className={inputCls} value={draft.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} />
          </Field>
        </div>

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

// A light, real-email-looking canvas rendered from the draft.
function EmailPreview({ draft }: { draft: EmailDraft }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : "#7B5CFF";
  const minimal = draft.style === "minimal";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-[#e9edf2] p-4 sm:p-6">
      {/* Inbox meta */}
      <div className="mb-3 px-1 text-[#4b5563]">
        <p className="truncate text-sm font-semibold text-[#111827]">{draft.subject || "Без темы"}</p>
        <p className="truncate text-xs">{draft.preheader}</p>
      </div>
      {/* The email body */}
      <div className="mx-auto max-w-[560px] overflow-hidden rounded-xl bg-white shadow-sm">
        {/* Brand bar */}
        <div className="px-6 py-4" style={{ borderBottom: "1px solid #eef1f4" }}>
          <span className="text-lg font-extrabold tracking-tight" style={{ color: accent }}>
            {draft.brand || "Brand"}
          </span>
        </div>
        {/* Hero */}
        {!minimal ? (
          <div
            className="px-6 py-8 text-center"
            style={{ background: `linear-gradient(160deg, ${accent}14, #ffffff)` }}
          >
            <h2 className="text-2xl font-extrabold leading-tight text-[#0f172a]">
              {draft.heroTitle || "Заголовок письма"}
            </h2>
            {draft.heroSubtitle ? (
              <p className="mt-2 text-sm text-[#475569]">{draft.heroSubtitle}</p>
            ) : null}
          </div>
        ) : (
          <div className="px-6 pt-6">
            <h2 className="text-xl font-bold text-[#0f172a]">{draft.heroTitle || "Заголовок письма"}</h2>
          </div>
        )}
        {/* Body */}
        <div className="px-6 py-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-[#334155]">
            {draft.body || "Текст письма появится здесь."}
          </p>
          {draft.ctaText ? (
            <div className={minimal ? "mt-5" : "mt-6 text-center"}>
              <span
                className="inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {draft.ctaText}
              </span>
            </div>
          ) : null}
        </div>
        {/* Footer */}
        <div className="px-6 py-5" style={{ background: "#f7f8fa", borderTop: "1px solid #eef1f4" }}>
          <p className="text-[11px] leading-relaxed text-[#94a3b8]">{draft.footer}</p>
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
