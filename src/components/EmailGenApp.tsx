"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Mail,
  Monitor,
  Moon,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";

import { BriefUploader } from "@/components/BriefUploader";
import { PRESETS } from "@/components/PresetSidebar";
import { apiFetch } from "@/lib/api-client";
import { buildEmailHtml, emailFileName } from "@/lib/emailExport";
import { simulateDarkClient } from "@/lib/emailDarkMode";
import { HERO_ASPECT_RATIO, HERO_MAX_BYTES, HERO_RETINA_WIDTH, measureDataUrl } from "@/lib/emailHeroRules";
import { compressImage, rasterizeSvg } from "@/lib/imageCompress";
import { composeHeroWithLogo } from "@/lib/emailHeroCompose";
import { buildPalette } from "@/lib/emailPalette";
import { downloadText } from "@/lib/download";
import { imageCredits } from "@/lib/credit-estimate";

const IMG_PRICE = imageCredits(1);
import {
  EMAIL_BLOCKS,
  EMAIL_STYLES,
  type EmailBlockId,
  type EmailBlocks,
  type EmailDraft,
  type EmailStyle,
  emailBase,
  emailNameFromSubject,
  newDraft,
  saveDraft,
} from "@/lib/mailing";
import { OptionalBlock } from "@/components/email/OptionalBlock";
import { EmailGammaPicker } from "@/components/email/EmailGammaPicker";
import { HeroRules } from "@/components/email/HeroRules";

export function EmailGenApp() {
  const [draft, setDraft] = useState<EmailDraft>(() => newDraft());
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof EmailDraft>(key: K, value: EmailDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  /**
   * Внутреннее имя черновика человек не заполняет: поля для него в форме нет,
   * а нужно оно списку черновиков, имени файла при выгрузке и названию
   * кампании. Выводим из темы — латиницей и без пробелов, потому что имя
   * уезжает в файлы и на почтовый сервис, где кириллица и пробелы ломают
   * ссылки.
   */
  const setSubject = (subject: string) => {
    setDraft((d) => ({ ...d, subject, name: emailNameFromSubject(subject) }));
    setSaved(false);
  };

  const setBlock = (id: EmailBlockId, on: boolean) => {
    setDraft((d) => ({ ...d, blocks: { ...d.blocks, [id]: on } }));
    setSaved(false);
  };
  const blockMeta = (id: EmailBlockId) => EMAIL_BLOCKS.find((b) => b.id === id)!;

  /**
   * Пришёл текст — включаем блок, в который он ляжет. Выключенный блок с
   * заполненным полем выглядит как поломка: ИИ «написал», а в письме пусто.
   * Обратное не делаем: пустое поле сам блок не выключает, человек мог
   * включить его заранее и дописать позже.
   */
  const enableFilled = (blocks: EmailBlocks, filled: Partial<Record<EmailBlockId, boolean>>) => {
    const next = { ...blocks };
    for (const [id, has] of Object.entries(filled)) {
      if (has) next[id as EmailBlockId] = true;
    }
    return next;
  };
  /** Общие пропсы секции блока — чтобы не повторять их девять раз. */
  const blockProps = (id: EmailBlockId) => {
    const meta = blockMeta(id);
    return {
      title: meta.label,
      hint: meta.hint,
      enabled: draft.blocks?.[id] ?? true,
      onToggle: (next: boolean) => setBlock(id, next),
    };
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
        name: str(f.subject) ? emailNameFromSubject(String(f.subject)) : d.name,
        blocks: enableFilled(d.blocks, {
          subtitle: !!str(f.heroSubtitle),
          body: !!str(f.body),
          steps: !!(steps && steps.some((x) => x.trim())),
          cta: !!str(f.ctaText),
          bonusCta: !!str(f.bonusCtaText),
          footer: !!str(f.footer),
        }),
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

  /**
   * Картинка письма собирается из исходного баннера: в режиме «Поверх» к нему
   * приклеивается логотип медальоном на верхней кромке. Пересобирать нужно на
   * каждую смену логотипа, режима и гаммы — полоса над баннером красится
   * цветом полотна письма.
   */
  useEffect(() => {
    const source = draft.heroSource;
    if (!source) {
      if (draft.heroImage) set("heroImage", "");
      return;
    }
    if (!(draft.logo && draft.logoMode === "overlay")) {
      if (draft.heroImage !== source) set("heroImage", source);
      return;
    }
    let alive = true;
    void composeHeroWithLogo({
      banner: source,
      logo: draft.logo,
      background: buildPalette(draft.accent, emailBase(draft)).panel,
    }).then((url) => {
      if (alive) set("heroImage", url);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.heroSource, draft.logo, draft.logoMode, draft.accent, draft.base]);

  /** Сколько весил баннер до сжатия — показываем рядом с новым весом. */
  const [heroSaved, setHeroSaved] = useState<{ before: number; after: number } | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);

  /**
   * Баннер жмётся сразу, а не по кнопке: письмо на 2 МБ — это не выбор между
   * «лучше» и «легче», это письмо, которое половина получателей не дождётся.
   * Прозрачность теряется, поэтому подкладываем цвет полотна письма.
   */
  const putHero = async (dataUrl: string) => {
    setHeroBusy(true);
    try {
      const out = await compressImage(dataUrl, {
        maxWidth: HERO_RETINA_WIDTH,
        maxBytes: HERO_MAX_BYTES,
        background: buildPalette(draft.accent, emailBase(draft)).panel,
      });
      set("heroSource", out.dataUrl);
      setHeroSaved(out.skipped ? null : { before: out.bytesBefore, after: out.bytes });
    } catch {
      // Не смогли сжать — кладём как есть, подсказка про вес всё равно придёт.
      set("heroSource", dataUrl);
      setHeroSaved(null);
    } finally {
      setHeroBusy(false);
    }
  };
  // Размеры и вес баннера нужны только для подсказок, поэтому живут рядом с
  // формой, а не в черновике: у сохранённого письма их можно померить заново.
  const [heroMeta, setHeroMeta] = useState<{ width: number; height: number; bytes: number } | null>(null);
  useEffect(() => {
    if (!draft.heroImage) {
      setHeroMeta(null);
      return;
    }
    let alive = true;
    measureDataUrl(draft.heroImage)
      .then((m) => alive && setHeroMeta(m))
      .catch(() => alive && setHeroMeta(null));
    return () => {
      alive = false;
    };
  }, [draft.heroImage]);

  const onHeroFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void putHero(String(reader.result));
    reader.readAsDataURL(file);
  };
  const onLogoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    // SVG генератор картинок не принимает, поэтому переводим его в PNG сразу
    // при загрузке — иначе «Референс» падал бы с ошибкой про формат файла.
    reader.onload = () => void rasterizeSvg(String(reader.result)).then((url) => set("logo", url));
    reader.readAsDataURL(file);
  };

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
          palette: { accent: draft.accent, base: emailBase(draft) },
          aspectRatio: HERO_ASPECT_RATIO,
          feature: "email-hero",
        },
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setGenError([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
        return;
      }
      if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
      await putHero(data.imageUrl);
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
      next.blocks = enableFilled(d.blocks, {
        subtitle: !!fields.heroSubtitle,
        body: !!fields.body,
        cta: !!fields.ctaText,
        footer: !!fields.footer,
      });
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
          <input className={inputCls} value={draft.subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Прехедер">
          <input className={inputCls} value={draft.preheader} onChange={(e) => set("preheader", e.target.value)} />
        </Field>

        <EmailGammaPicker
          accent={draft.accent}
          base={emailBase(draft)}
          onChange={(accent, base) => setDraft((d) => ({ ...d, accent, base }))}
        />

        <OptionalBlock {...blockProps("hero")}>
          <div>
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
          </div>

          <div>
            <label className="mb-2 block ds-h4">Hero-картинка</label>
            {draft.heroSource ? (
              <div className="flex items-center gap-2">
                <img
                  src={draft.heroSource}
                  alt=""
                  className="h-11 w-20 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    set("heroSource", "");
                    setHeroSaved(null);
                  }}
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
            <HeroRules meta={heroMeta} saved={heroSaved} busy={heroBusy} />
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
              : `${draft.heroSource ? "Перегенерировать баннер" : "Сгенерировать баннер"} · ${IMG_PRICE}`}
          </button>
          <p className="mt-2 ds-caption">
            Баннер заполняется автоматически по полям письма. На картинке не будет текста — только
            цифры и, если выбран режим «Референс», логотип: остальное не переводится вместе с
            письмом. Не понравился — смените шаблон или поля и перегенерируйте.
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
                  Загрузите выше — лого пойдёт и в письмо, и в баннер.
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
              <p className="mt-1.5 ds-caption">
                {draft.logoMode === "reference"
                  ? "ИИ впишет лого в картинку сам."
                  : "Лого ляжет медальоном на верхнюю кромку баннера — форма не пострадает."}
              </p>
            </div>
          </div>
          {genError ? (
            <p className="mt-2 text-xs text-[color:var(--status-error)]">{genError}</p>
          ) : null}
        </div>

        </OptionalBlock>

        {/* Заголовок обязателен: письмо без него не имеет первого экрана. */}
        <Field label="Заголовок (hero)">
          <input className={inputCls} value={draft.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
        </Field>

        <OptionalBlock {...blockProps("subtitle")}>
          <input
            className={inputCls}
            value={draft.heroSubtitle}
            onChange={(e) => set("heroSubtitle", e.target.value)}
            placeholder="Строка под заголовком"
          />
        </OptionalBlock>

        <OptionalBlock {...blockProps("body")}>
          <textarea
            className={`${inputCls} min-h-[110px] resize-y py-2.5`}
            rows={4}
            value={draft.body}
            onChange={(e) => set("body", e.target.value)}
          />
          <p className="mt-1.5 ds-caption">
            Выделяйте акцентом через <span className="font-mono">**двойные звёздочки**</span>.
          </p>
        </OptionalBlock>

        <OptionalBlock {...blockProps("steps")}>
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
        </OptionalBlock>

        <OptionalBlock {...blockProps("cta")}>
          <input
            className={inputCls}
            value={draft.ctaText}
            onChange={(e) => set("ctaText", e.target.value)}
            placeholder="ЗАБРАТЬ БОНУС"
          />
        </OptionalBlock>

        <OptionalBlock {...blockProps("bonusCta")}>
          <input
            className={inputCls}
            value={draft.bonusCtaText}
            onChange={(e) => set("bonusCtaText", e.target.value)}
            placeholder="GET BONUS"
          />
        </OptionalBlock>

        {/* Ссылка общая для обеих кнопок, поэтому живёт вне их блоков. */}
        <Field label="Ссылка кнопки">
          <input className={inputCls} value={draft.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} />
        </Field>

        <OptionalBlock {...blockProps("apps")}>
          <p className="ds-caption">
            Чёрные кнопки «App Store» и «Google Play» со значками магазинов. Настроек нет — блок
            либо есть, либо нет.
          </p>
        </OptionalBlock>

        <OptionalBlock {...blockProps("payments")}>
          <input
            className={inputCls}
            value={draft.payments}
            onChange={(e) => set("payments", e.target.value)}
            placeholder="VISA, Mastercard, Skrill"
          />
          <p className="mt-1.5 ds-caption">
            Через запятую. В письме встанут тегами в том же порядке; в ряд помещается до
            двенадцати.
          </p>
        </OptionalBlock>

        <OptionalBlock {...blockProps("footer")}>
          <div className="flex flex-col gap-3">
            <Field label="Текст футера">
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
          </div>
        </OptionalBlock>

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

      {/* min-w-0: иначе масштабируемый блок предпросмотра задаёт колонке
          минимальную ширину по содержимому и отъедает место у формы. */}
      <div className="min-w-0 lg:sticky lg:top-6 lg:h-fit">
        <EmailPreview draft={draft} html={html} />
      </div>
    </div>
  );
}

// Показывает сам экспортируемый файл, а не его двойника, — иначе предпросмотр
// рано или поздно разойдётся с тем, что уходит адресату.
//
// Письмо свёрстано на фиксированных 600px: свод запрещает медиазапросы, а без
// них оно не умеет сужаться. Поэтому в узкой колонке его не обрезаем, а
// уменьшаем целиком — так же, как это делает почтовый клиент на телефоне.
// Скрипты у письма отключены; allow-same-origin нужен только чтобы померить
// высоту документа, и без allow-scripts он ничего не открывает.
const EMAIL_WIDTH = 600;
const PHONE_WIDTH = 375;

function EmailPreview({ draft, html }: { draft: EmailDraft; html: string }) {
  const [narrow, setNarrow] = useState(false);
  const [darkClient, setDarkClient] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [available, setAvailable] = useState(EMAIL_WIDTH);
  const [docHeight, setDocHeight] = useState(900);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setAvailable(box.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Высота письма известна только после отрисовки, и меняется с каждой правкой
  // полей — пересчитываем на каждый новый html.
  const onLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) setDocHeight(Math.max(320, doc.body.scrollHeight));
  };

  const targetWidth = narrow ? PHONE_WIDTH : Math.min(available, EMAIL_WIDTH);
  const scale = Math.min(1, targetWidth / EMAIL_WIDTH);
  // Экспорт не меняется: тёмная тема — это то, что с письмом делает клиент,
  // а не другая сборка письма.
  const shown = useMemo(() => (darkClient ? simulateDarkClient(html) : html), [darkClient, html]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 ds-caption">
          <Mail className="h-4 w-4" /> Предпросмотр письма
        </span>
        <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {[
            { id: "light", label: "Светлая тема почтовика", icon: Sun, on: !darkClient },
            { id: "dark", label: "Тёмная тема почтовика", icon: Moon, on: darkClient },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDarkClient(m.id === "dark")}
                aria-pressed={m.on}
                title={m.label}
                aria-label={m.label}
                className={`flex min-h-8 items-center rounded-md px-2.5 text-xs font-medium transition ${
                  m.on ? "bg-accent-green text-on-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
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
      </div>

      {/* Обрамление тоже переключается: письмо в тёмном клиенте видно в тёмном
          интерфейсе, и сравнивать его со светлой рамкой бессмысленно. */}
      <div
        className={`overflow-hidden rounded-2xl border border-border p-3 sm:p-4 ${
          darkClient ? "bg-[#1b1c1f]" : "bg-[#e9edf2]"
        }`}
      >
        {/* Обрамление почтовика: тема и прехедер — это то, что человек видит
            до того, как откроет письмо. */}
        <div className="mb-3 px-1">
          <p className={`truncate text-sm font-semibold ${darkClient ? "text-[#e8eaed]" : "text-[#111827]"}`}>
            {draft.subject || "Без темы"}
          </p>
          <p className={`truncate text-xs ${darkClient ? "text-[#9aa0a6]" : "text-[#4b5563]"}`}>
            {draft.preheader}
          </p>
        </div>
        <div ref={boxRef} className="mx-auto" style={{ maxWidth: EMAIL_WIDTH }}>
          <div
            className={`mx-auto overflow-hidden rounded-xl ${darkClient ? "bg-[#202124]" : "bg-white"}`}
            style={{ width: EMAIL_WIDTH * scale, height: Math.min(docHeight, 1600) * scale }}
          >
            <iframe
              ref={frameRef}
              title="Предпросмотр письма"
              sandbox="allow-same-origin"
              srcDoc={shown}
              onLoad={onLoad}
              scrolling="no"
              style={{
                width: EMAIL_WIDTH,
                height: Math.min(docHeight, 1600),
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </div>

      <p className="mt-2 ds-caption">
        {darkClient ? (
          <>
            Так письмо покажет клиент, который перекрашивает его целиком, — Gmail на Android.
            Apple Mail и Gmail в вебе оставят ваши цвета: об этом им говорят мета-теги
            color-scheme в письме. Outlook.com перекрасит только фон и текст, бренд не тронет.
            Картинки не перекрашиваются нигде — если в баннере впечатан текст, здесь видно, как
            он останется от прошлой темы. Экспорт от переключателя не меняется.
          </>
        ) : (
          <>
            Это ровно тот HTML, который скачивается кнопкой «Скачать HTML»: таблицы, инлайн-стили,
            фиксированные 600 пикселей — так письмо собирают по нашему своду правил вёрстки.
          </>
        )}
        {scale < 1 ? " Показан в уменьшенном масштабе, чтобы поместиться в колонку." : ""}
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
