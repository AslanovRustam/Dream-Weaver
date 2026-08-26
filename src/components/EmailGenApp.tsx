"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Mail, Save, Send, Sparkles, Upload } from "lucide-react";

import { BriefUploader } from "@/components/BriefUploader";
import { PRESETS } from "@/components/PresetSidebar";
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

  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [heroPreset, setHeroPreset] = useState(""); // "" = агент подберёт сам
  const [autofilling, setAutofilling] = useState(false);

  // AI-fill the copy fields (via ChatGPT) — brand is left for the user to set.
  const autofill = async () => {
    setAutofilling(true);
    setGenError("");
    try {
      const res = await fetch("/api/generate-email-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: draft.subject || draft.heroTitle || draft.body || "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.fields) {
        setGenError([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
        return;
      }
      const f = data.fields as Record<string, string | string[]>;
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      const steps = Array.isArray(f.steps) ? f.steps.map(String) : undefined;
      setDraft((d) => ({
        ...d,
        // brand intentionally NOT filled — the user sets their own brand
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

  // Composite the logo PNG on top of a generated image (client-side canvas).
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

  // Generate the hero banner: an agent composes a no-text prompt from the brief,
  // an image model renders it; a logo is a reference or a PNG overlay.
  const generateHero = async () => {
    setGenning(true);
    setGenError("");
    try {
      // A chosen banner preset drives the visual style; fill its {SUBJECT} from
      // the email fields. Empty → the agent composes freely.
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
      const res = await fetch("/api/generate-email-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: draft.brand,
          heroTitle: draft.heroTitle,
          body: draft.body,
          presetTemplate: presetTemplate || undefined,
          logoBase64: draft.logo && draft.logoMode === "reference" ? draft.logo : undefined,
          logoMode: draft.logoMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setGenError([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
        return;
      }
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

        {/* AI hero generation + logo */}
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
              : draft.heroImage
                ? "Перегенерировать баннер"
                : "Сгенерировать баннер (ИИ)"}
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
            className="flex h-40 w-full items-center justify-center px-6"
            style={{ background: `linear-gradient(160deg, ${accent}44, ${dark ? "#0b1226" : "#eef2ff"})` }}
          >
            {draft.brandMode === "logo" && draft.logo ? (
              <img src={draft.logo} alt="" className="max-h-16 max-w-[60%] object-contain" />
            ) : (
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: dark ? "#fff" : accent }}>
                {draft.brand || "ВАШ БРЕНД"}
              </span>
            )}
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
          <a
            href={draft.unsubscribeUrl || undefined}
            className="mt-2 inline-block text-[11px] font-semibold uppercase tracking-wide underline-offset-2 hover:underline"
            style={{ color: accent }}
          >
            Unsubscribe
          </a>
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
