"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Mail,
  Monitor,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Upload,
} from "lucide-react";

import { BriefUploader } from "@/components/BriefUploader";
import { PRESETS } from "@/components/PresetSidebar";
import { apiFetch } from "@/lib/api-client";
import { buildEmailHtml, emailFileName } from "@/lib/emailExport";
import { downloadText } from "@/lib/download";
import { imageCredits } from "@/lib/credit-estimate";

const IMG_PRICE = imageCredits(1);
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

  // The single source of truth for both the preview and the download: the
  // preview used to be a React look-alike, which is exactly how a preview
  // drifts away from what actually gets sent.
  const html = useMemo(() => buildEmailHtml(draft), [draft]);
  const [copied, setCopied] = useState(false);
  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (no permission, insecure origin) — download instead */
      downloadText(emailFileName(draft), html, "text/html;charset=utf-8", "email_exported");
    }
  };

  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [costUsd, setCostUsd] = useState(0);
  const [heroPreset, setHeroPreset] = useState("");
  const [autofilling, setAutofilling] = useState(false);

  const autofill = async () => {
    setAutofilling(true);
    setGenError("");
    try {
      const res = await apiFetch("/api/generate-email-content", {
        method: "POST",
        json: { topic: draft.subject || draft.heroTitle || draft.body || "" },
      });
      const data = await res.json();
      if (!res.ok || !data.fields) {
        setGenError([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
        return;
      }
      if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
      const f = data.fields as Record<string, string | string[]>;
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      const steps = Array.isArray(f.steps) ? f.steps.map(String) : undefined;
      setDraft((d) => ({
        ...d,
        subject: str(f.subject) ?? d.subject,
        preheader: str(f.preheader) ?? d.preheader,
        heroTitle: str(f.heroTitle) ?? d.heroTitle,
        heroSubtitle: str(f.heroSubtitle) ?? d.heroSubtitle,
        body: str(f.body) ?? d.body,
        steps: steps && steps.length ? [steps[0] ?? "", steps[1] ?? "", steps[2] ?? ""] : d.steps,
        ctaText: str(f.ctaText) ?? d.ctaText,
        bonusCtaText: str(f.bonusCtaText) ?? d.bonusCtaText,
        footer: str(f.footer) ?? d.footer,
        name: d.name || (str(f.subject) ? String(f.subject).slice(0, 40) : d.name),
      }));
      setSaved(false);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setAutofilling(false);
    }
  };

  const readAsDataUrl = (file: File, key: "heroImage" | "logo") => {
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result));
    reader.readAsDataURL(file);
  };
  const onHeroFile = (file: File | null) => file && readAsDataUrl(file, "heroImage");
  const onLogoFile = (file: File | null) => file && readAsDataUrl(file, "logo");

  const overlayLogo = (baseUrl: string, logoUrl: string) =>
    new Promise<string>((resolve) => {
      const base = new Image();
      base.crossOrigin = "anonymous";
      base.onload = () => {
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = base.naturalWidth;
          canvas.height = base.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(baseUrl);
          ctx.drawImage(base, 0, 0);
          const lw = canvas.width * 0.24;
          const lh = lw * (logo.naturalHeight / Math.max(1, logo.naturalWidth));
          ctx.drawImage(logo, (canvas.width - lw) / 2, canvas.height * 0.06, lw, lh);
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch {
            resolve(baseUrl);
          }
        };
        logo.onerror = () => resolve(baseUrl);
        logo.src = logoUrl;
      };
      base.onerror = () => resolve(baseUrl);
      base.src = baseUrl;
    });

  const generateHero = async () => {
    setGenning(true);
    setGenError("");
    try {
      let presetTemplate = "";
      if (heroPreset) {
        const p = PRESETS.find((x) => x.id === heroPreset);
        if (p?.template) {
          const subject = [draft.brand, draft.heroTitle, draft.body]
            .filter(Boolean)
            .join(". ")
            .replace(/\*\*/g, "");
          presetTemplate = p.template.replace(/\{SUBJECT\}/g, subject || draft.brand || "the offer");
        }
      }
      const res = await apiFetch("/api/generate-email-hero", {
        method: "POST",
        json: {
          brand: draft.brand,
          heroTitle: draft.heroTitle,
          body: draft.body,
          presetTemplate: presetTemplate || undefined,
          logoBase64: draft.logo && draft.logoMode === "reference" ? draft.logo : undefined,
          logoMode: draft.logoMode,
          feature: "email-hero",
        },
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setGenError([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
        return;
      }
      if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
      const finalUrl =
        draft.logo && draft.logoMode === "overlay"
          ? await overlayLogo(data.imageUrl, draft.logo)
          : data.imageUrl;
      set("heroImage", finalUrl);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setGenning(false);
    }
  };
  const setStep = (i: number, v: string) => {
    const s = [...(draft.steps ?? [])];
    s[i] = v;
    set("steps", s);
  };

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
      <div className="flex flex-col gap-5">
        <header>
          <p className="ds-overline text-accent-green">Email</p>
          <h1 className="ds-h1 mt-1">Генератор писем</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Соберите письмо для рассылки — сохраните и отправьте из кабинета.
          </p>
        </header>

        <button
          type="button"
          onClick={autofill}
          disabled={autofilling}
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-sm font-medium transition hover:border-accent-green/50 hover:text-accent-green disabled:opacity-60"
        >
          {autofilling ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
          ) : (
            <Sparkles className="h-4 w-4 text-accent-green" />
          )}
          {autofilling ? "Генерирую…" : "Заполнить автоматически с помощью ИИ"}
        </button>

        <BriefUploader
          product="email"
          onApply={applyBrief}
          onGenerate={(r) => {
            applyBrief(r.fields);
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
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="ds-h4">Бренд</label>
              <div className="flex rounded-md border border-border p-0.5 text-[11px]">
                {(
                  [
                    ["text", "Текст"],
                    ["logo", "Лого"],
                  ] as const
                ).map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("brandMode", m)}
                    className={`min-h-7 rounded px-2 font-medium transition ${
                      draft.brandMode === m
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {draft.brandMode === "logo" ? (
              draft.logo ? (
                <div className="flex h-12 items-center gap-2">
                  <img
                    src={draft.logo}
                    alt=""
                    className="h-12 w-24 rounded-md border border-border bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() => set("logo", "")}
                    className="text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    Убрать
                  </button>
                </div>
              ) : (
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-elevated px-3 text-sm text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground">
                  <Upload className="h-4 w-4" /> Загрузить лого
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )
            ) : (
              <input
                className={inputCls}
                value={draft.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Ваш бренд"
              />
            )}
          </div>
          <div>
            <label className="mb-2 block ds-h4">Акцент</label>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : "#7B5CFF"}
              onChange={(e) => set("accent", e.target.value)}
              aria-label="Акцентный цвет"
              className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated"
            />
          </div>
        </div>

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
            <div className="flex h-11 items-center">
              <button
                type="button"
                role="switch"
                aria-checked={draft.dark}
                aria-label="Тёмная тема"
                onClick={() => set("dark", !draft.dark)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  draft.dark ? "bg-accent-green" : "bg-white/15"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    draft.dark ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-3">
          <label className="mb-1.5 block ds-label">Шаблон баннера</label>
          <select
            className="mb-2 h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
            value={heroPreset}
            onChange={(e) => setHeroPreset(e.target.value)}
          >
            <option value="">Авто (ИИ подберёт стиль)</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={generateHero}
            disabled={genning}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {genning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genning
              ? "Генерирую баннер…"
              : `${draft.heroImage ? "Перегенерировать баннер" : "Сгенерировать баннер"} · ${IMG_PRICE}`}
          </button>
          <p className="mt-2 ds-caption">
            Баннер заполняется автоматически по полям письма. На картинке не будет текста — только
            цифры, чтобы письмо легко переводилось. Не понравился — смените шаблон или поля и
            перегенерируйте.
          </p>

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="mb-1.5 block ds-label">Логотип бренда</label>
              {draft.logo ? (
                <div className="flex h-10 items-center gap-2">
                  <img
                    src={draft.logo}
                    alt=""
                    className="h-10 w-16 rounded-md border border-border bg-white object-contain p-1"
                  />
                  <span className="ds-caption">в генерации</span>
                </div>
              ) : (
                <p className="flex h-10 items-center ds-caption">
                  Загрузите лого в поле «Бренд» → «Лого».
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block ds-label">Лого как</label>
              <div className="flex rounded-lg border border-border p-0.5 text-xs">
                {(
                  [
                    ["reference", "Референс"],
                    ["overlay", "Поверх"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("logoMode", m)}
                    className={`min-h-8 rounded-md px-2.5 font-medium transition ${
                      draft.logoMode === m
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {genError ? (
            <p className="mt-2 text-xs text-[color:var(--status-error)]">{genError}</p>
          ) : null}
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
        <Field label="Ссылка отписки">
          <input
            className={inputCls}
            value={draft.unsubscribeUrl}
            onChange={(e) => set("unsubscribeUrl", e.target.value)}
            placeholder="https://…/unsubscribe"
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
          <button
            type="button"
            onClick={() =>
              downloadText(emailFileName(draft), html, "text/html;charset=utf-8", "email_exported")
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
          >
            <Download className="h-4 w-4 text-accent-green" />
            Скачать HTML
          </button>
          <button
            type="button"
            onClick={copyHtml}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:border-white/25 hover:bg-white/10"
          >
            {copied ? <Check className="h-4 w-4 text-accent-green" /> : <Copy className="h-4 w-4 text-accent-green" />}
            {copied ? "Скопировано" : "Скопировать HTML"}
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

      <div className="lg:sticky lg:top-6 lg:h-fit">
        <EmailPreview draft={draft} html={html} />
      </div>
    </div>
  );
}

// Renders the exported file in an iframe, so the preview cannot disagree with
// the download. Scripts are off: an email has none, and a sandboxed frame also
// keeps the CTA from navigating the builder away.
function EmailPreview({ draft, html }: { draft: EmailDraft; html: string }) {
  const [narrow, setNarrow] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 ds-caption">
          <Mail className="h-4 w-4" /> Предпросмотр письма
        </span>
        <div className="flex rounded-lg border border-border p-0.5">
          {[
            { id: "wide", label: "Десктоп", icon: Monitor, on: !narrow },
            { id: "narrow", label: "Телефон", icon: Smartphone, on: narrow },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setNarrow(m.id === "narrow")}
                aria-pressed={m.on}
                title={m.label}
                className={`flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                  m.on ? "bg-accent-green text-on-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-[#e9edf2] p-3 sm:p-4">
        {/* The inbox chrome around the message — subject and preheader are what
            a reader sees before opening anything. */}
        <div className="mb-3 px-1">
          <p className="truncate text-sm font-semibold text-[#111827]">
            {draft.subject || "Без темы"}
          </p>
          <p className="truncate text-xs text-[#4b5563]">{draft.preheader}</p>
        </div>
        <div className="mx-auto transition-[max-width]" style={{ maxWidth: narrow ? 380 : 620 }}>
          <iframe
            title="Предпросмотр письма"
            sandbox=""
            srcDoc={html}
            className="h-[560px] w-full rounded-xl border-0 bg-white lg:h-[640px]"
          />
        </div>
      </div>

      <p className="mt-2 ds-caption">
        Это ровно тот HTML, который скачивается кнопкой «Скачать HTML»: таблицы, инлайн-стили и
        кнопки, которые переживают Outlook.
      </p>
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
