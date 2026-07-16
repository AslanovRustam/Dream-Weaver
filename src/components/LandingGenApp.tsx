"use client";

// Landing-generator — full "create from scratch" flow, structured like the
// Banner-generator: three columns on desktop (templates / settings / result),
// a step wizard on mobile (Назад + sticky "Сгенерировать"). Generation is
// client-side today (see src/lib/landingGen.ts) but the shape matches the
// banner so a real API can be slotted in later.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { getBrandSettings } from "@/components/SettingsDrawer";
import { ToolCoachmark } from "@/components/ToolCoachmark";
import { SettingsSection, SectionDots } from "@/components/SettingsSection";
import {
  getCreativeLanguage,
  CREATIVE_LANGUAGES,
  creativeLangShort,
} from "@/lib/creative-language";
import { useGeneration } from "@/lib/generation-context";
import {
  LANDING_SECTIONS,
  LANDING_TEMPLATE_CATEGORIES,
  LANDING_TEMPLATE_BY_ID,
  accentForVertical,
  normalizeLandingLang,
  type LandingInput,
  type LandingSectionId,
  type LandingTemplate,
  type LandingVertical,
} from "@/lib/landingGen";

type MobileTab = "templates" | "settings" | "result";
type Status = "idle" | "loading" | "done" | "error";

const DEFAULT_TEMPLATE = "gambling-bonus";

type BannerSeed = {
  brand_name?: string;
  brand_logo?: string;
  subject?: string;
  language?: string;
  banner_text?: string;
  vertical?: LandingVertical;
  from_banner?: boolean;
};

const ALL_ON: Record<LandingSectionId, boolean> = {
  hero: true,
  benefits: true,
  howto: true,
  trust: true,
  cta: true,
  footer: true,
};

const VERTICAL_LABEL: Record<LandingVertical, string> = {
  betting: "Betting",
  gambling: "Gambling",
  sport: "Sport",
};

// Shrinks an uploaded logo to a data URL (mirrors the banner's logo handling).
function compressImageFile(file: File | null, setter: (v: string) => void, maxPx = 256) {
  if (!file) return;
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!isSvg && !file.type.startsWith("image/")) {
    alert("Нужен файл изображения — PNG, JPG или SVG.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("Файл слишком большой (макс 8 МБ).");
    return;
  }
  const draw = (src: string, asPng: boolean) => {
    const img = new Image();
    img.onload = () => {
      const iw = img.width || maxPx;
      const ih = img.height || maxPx;
      const scale = Math.min(1, maxPx / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setter(src);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      setter(canvas.toDataURL(asPng ? "image/png" : "image/jpeg", 0.85));
    };
    img.onerror = () => alert("Не удалось обработать изображение. Попробуйте другой файл.");
    img.src = src;
  };
  const reader = new FileReader();
  reader.onerror = () => alert("Не удалось прочитать файл. Попробуйте другой.");
  if (isSvg) {
    reader.onload = () => {
      const text = reader.result;
      if (typeof text !== "string") return;
      draw(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`, true);
    };
    reader.readAsText(file);
  } else {
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") draw(r, false);
    };
    reader.readAsDataURL(file);
  }
}

export function LandingGenApp() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE);
  const template = LANDING_TEMPLATE_BY_ID.get(templateId) ?? LANDING_TEMPLATE_BY_ID.get(DEFAULT_TEMPLATE)!;

  const [subject, setSubject] = useState("");
  const [occasion, setOccasion] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [language, setLanguage] = useState("auto");
  const [sections, setSections] = useState<Record<LandingSectionId, boolean>>(ALL_ON);
  const [ctaText, setCtaText] = useState("");
  const [offerDetails, setOfferDetails] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [mobileTab, setMobileTab] = useState<MobileTab>("templates");

  // From-banner flow: vertical inherited from the banner (no template picker),
  // the banner image reused as the Hero visual, brand block collapsed by default.
  const gen = useGeneration();
  const router = useRouter();
  const [fromBanner, setFromBanner] = useState(false);
  const [bannerVertical, setBannerVertical] = useState<LandingVertical>("gambling");
  const [useBannerHero, setUseBannerHero] = useState(true);
  const [brandExpanded, setBrandExpanded] = useState(false);
  const bannerImage = gen.imageUrl ?? "";

  const logoInputRef = useRef<HTMLInputElement>(null);
  // Runs the mount handoff exactly once. The effect consumes a one-time seed
  // (removeItem) and reads brand defaults, so it is NOT idempotent — without
  // this guard React StrictMode's double-invoke re-reads the now-empty defaults
  // and clobbers the seed-applied brand/language.
  const initedRef = useRef(false);

  // Mount: title, brand defaults, global-language default, and the optional
  // "create from banner" handoff.
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    document.title = "Лендинг-генератор — Dream Weaver Studio";
    const b = getBrandSettings();
    setBrandName(b.brand_name);
    setBrandLogo(b.brand_logo);
    let lang = b.language && b.language !== "auto" ? b.language : getCreativeLanguage();

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dw:landingSeed");
        if (raw) {
          const s = JSON.parse(raw) as BannerSeed;
          if (s.brand_name) setBrandName(s.brand_name);
          if (s.brand_logo) setBrandLogo(s.brand_logo);
          if (s.subject) setSubject(s.subject);
          if (s.language) lang = s.language;
          if (s.from_banner) {
            setFromBanner(true);
            if (s.vertical) setBannerVertical(s.vertical);
          }
          window.localStorage.removeItem("dw:landingSeed");
          setMobileTab("settings");
          toast.success("Данные бренда перенесены из баннера");
        }
      } catch {
        /* ignore malformed seed */
      }
    }
    setLanguage(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTemplate = (t: LandingTemplate) => {
    setTemplateId(t.id);
    setMobileTab("settings");
  };

  const toggleSection = (id: LandingSectionId) =>
    setSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const sectionsOn = Object.values(sections).some(Boolean);
  const canGenerate = subject.trim().length > 0 && sectionsOn && status !== "loading";

  // Collapsible settings sections (accordion), shared pattern across generators.
  const [openSec, setOpenSec] = useState({
    subject: true,
    occasion: false,
    brand: false,
    structure: true,
    cta: false,
  });
  const toggleSec = (id: keyof typeof openSec) => setOpenSec((p) => ({ ...p, [id]: !p[id] }));
  const landSections = fromBanner
    ? [
        { id: "structure", title: "Структура", done: sectionsOn },
        { id: "cta", title: "CTA и детали", done: true },
      ]
    : [
        { id: "subject", title: "Тематика", done: subject.trim().length > 0 },
        { id: "occasion", title: "Событие", done: true },
        { id: "brand", title: "Бренд", done: true },
        { id: "structure", title: "Структура", done: sectionsOn },
        { id: "cta", title: "CTA и детали", done: true },
      ];
  // In from-banner mode the vertical/accent come from the banner, not a template.
  const vertical = fromBanner ? bannerVertical : template.vertical;
  const accent = fromBanner ? accentForVertical(bannerVertical) : template.accent;
  const heroFromBanner = fromBanner && useBannerHero && Boolean(bannerImage);

  const persistBrand = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("brand_name", brandName);
      if (brandLogo) window.localStorage.setItem("brand_logo", brandLogo);
      else window.localStorage.removeItem("brand_logo");
      window.localStorage.setItem("brand_language", language);
    } catch {
      /* quota — ignore */
    }
  };

  // Generation moved to a dedicated editor page: stash the input and route to
  // /landing/editor/<id>. Generation logic itself is unchanged.
  const onGenerate = () => {
    if (subject.trim().length === 0) {
      toast.error("Заполните тематику лендинга");
      return;
    }
    if (!sectionsOn) {
      toast.error("Выберите хотя бы один блок");
      return;
    }
    persistBrand();
    setStatus("loading");
    try {
      const inputObj: LandingInput = {
        vertical,
        accent,
        brandName,
        brandLogo,
        language,
        subject,
        occasion,
        sections,
        ctaText,
        offerDetails,
        heroImage: heroFromBanner ? bannerImage : "",
      };
      const projectId = Date.now().toString(36);
      window.localStorage.setItem(
        `dw:landingProject:${projectId}`,
        JSON.stringify({
          input: inputObj,
          languages: [normalizeLandingLang(language)],
          overridesByLang: {},
        }),
      );
      router.push(`/landing/editor/${projectId}`);
    } catch {
      setStatus("idle");
      toast.error("Не удалось открыть редактор. Попробуйте ещё раз.");
    }
  };

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section="landing" />
      {/* Fill exactly the viewport below the sticky 4rem header so the columns
          never push the page into a scroll — only the middle column scrolls
          internally, the templates column and the pinned CTA stay fixed. */}
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">Лендинг-генератор</h1>

        {/* COLUMN 1 — templates / verticals. Hidden in from-banner mode: the
            vertical is inherited from the banner, so the picker isn't needed
            (leaves a 2-column settings + result layout). */}
        {!fromBanner ? (
          <div className={`lg:contents ${mobileTab !== "templates" ? "max-lg:hidden" : ""}`}>
            <LandingTemplateSidebar value={templateId} onSelect={selectTemplate} />
          </div>
        ) : null}

        {/* COLUMN 2 — settings */}
        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none lg:h-full lg:flex-[4] lg:rounded-2xl lg:border ${
            mobileTab !== "settings" ? "max-lg:hidden" : ""
          }`}
        >
          {!fromBanner ? (
            <div className="flex items-center gap-3 px-2 pb-2 pt-3 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileTab("templates")}
                className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
                Назад
              </button>
              <SectionDots sections={landSections} />
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              {fromBanner ? (
                <>
                  {/* Collapsed "brought from banner" summary — expand to edit. */}
                  <div className="overflow-hidden rounded-xl border border-accent-green/40 bg-accent-green/5">
                    <button
                      type="button"
                      onClick={() => setBrandExpanded((v) => !v)}
                      aria-expanded={brandExpanded}
                      className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-accent-green/10"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green text-black">
                        <Check className="h-4 w-4" />
                      </span>
                      {brandLogo ? (
                        <img
                          src={brandLogo}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md border border-border bg-white object-contain p-0.5"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Перенесено из баннера</span>
                        <span className="block truncate ds-caption">
                          {[brandName || "Без бренда", creativeLangShort(language), subject.trim()]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition ${
                          brandExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {brandExpanded ? (
                      <div className="flex flex-col gap-3 border-t border-accent-green/20 p-3">
                        <div className="flex items-center gap-2">
                          {brandLogo ? (
                            <div className="relative w-full">
                              <img
                                src={brandLogo}
                                alt="brand logo"
                                className="h-24 w-full rounded-md border border-border bg-white object-contain p-1"
                              />
                              <button
                                type="button"
                                onClick={() => setBrandLogo("")}
                                aria-label="Удалить логотип"
                                className="absolute -right-2 -top-2 rounded-full bg-foreground p-1 text-background hover:opacity-80 after:absolute after:-inset-2.5 after:content-['']"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                              className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border ds-caption hover:border-foreground/40 hover:text-foreground/80"
                            >
                              <Upload size={16} />
                              Лого
                            </button>
                          )}
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*,.svg"
                            className="hidden"
                            onChange={(e) =>
                              compressImageFile(e.target.files?.[0] ?? null, setBrandLogo, 256)
                            }
                          />
                        </div>
                        <input
                          type="text"
                          value={brandName}
                          onChange={(e) => setBrandName(e.target.value)}
                          placeholder="Название бренда / проекта"
                          className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                        />
                        <div>
                          <label className="mb-1.5 block ds-label">
                            Тематика лендинга{" "}
                            <span className="text-[color:var(--status-error)]">*</span>
                          </label>
                          <textarea
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            rows={3}
                            className="min-h-[88px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                            placeholder="Тематика лендинга…"
                          />
                        </div>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          aria-label="Язык лендинга"
                          className="h-12 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                        >
                          {CREATIVE_LANGUAGES.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <p className="ds-caption">
                          Данные унаследованы от баннера — отредактируйте при необходимости.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Use the banner as the Hero visual (from-banner only). */}
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 ds-h2">
                          <ImageIcon className="h-4 w-4 text-accent-green" />
                          Баннер как Hero
                        </p>
                        <p className="mt-0.5 ds-caption">
                          {bannerImage
                            ? "Использовать сгенерированный баннер как главное изображение Hero-секции."
                            : "Изображение баннера недоступно — Hero сгенерируется по тематике."}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={heroFromBanner}
                        disabled={!bannerImage}
                        onClick={() => setUseBannerHero((v) => !v)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
                          heroFromBanner ? "bg-accent-green" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-transform ${
                            heroFromBanner ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    {bannerImage && useBannerHero ? (
                      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
                        <img
                          src={bannerImage}
                          alt="Баннер"
                          className="mx-auto max-h-40 w-full object-contain"
                        />
                      </div>
                    ) : null}
                    <p className="mt-2 ds-micro text-muted-foreground">
                      Вертикаль «{VERTICAL_LABEL[vertical]}» унаследована от баннера
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <SettingsSection
                    title="Тематика лендинга"
                    required
                    done={subject.trim().length > 0}
                    open={openSec.subject}
                    onToggle={() => toggleSec("subject")}
                  >
                    <textarea
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      rows={3}
                      className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                      placeholder="Например: лендинг для приветственного бонуса казино — 100% на депозит + 200 фриспинов…"
                    />
                  </SettingsSection>

                  <SettingsSection
                    title="Событие / повод"
                    done
                    open={openSec.occasion}
                    onToggle={() => toggleSec("occasion")}
                  >
                    <input
                      type="text"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                      placeholder="Новый год, чемпионат, Black Friday…"
                    />
                  </SettingsSection>

                  <SettingsSection
                    title="Бренд"
                    done
                    open={openSec.brand}
                    onToggle={() => toggleSec("brand")}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        {brandLogo ? (
                          <div className="relative w-full">
                            <img
                              src={brandLogo}
                              alt="brand logo"
                              className="h-24 w-full rounded-md border border-border bg-white object-contain p-1"
                            />
                            <button
                              type="button"
                              onClick={() => setBrandLogo("")}
                              aria-label="Удалить логотип"
                              className="absolute -right-2 -top-2 rounded-full bg-foreground p-1 text-background hover:opacity-80 after:absolute after:-inset-2.5 after:content-['']"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border ds-caption hover:border-foreground/40 hover:text-foreground/80"
                          >
                            <Upload size={16} />
                            Лого
                          </button>
                        )}
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*,.svg"
                          className="hidden"
                          onChange={(e) =>
                            compressImageFile(e.target.files?.[0] ?? null, setBrandLogo, 256)
                          }
                        />
                      </div>
                      <input
                        type="text"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="Название бренда / проекта"
                        className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                      />
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        aria-label="Язык лендинга"
                        className="h-12 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                      >
                        {CREATIVE_LANGUAGES.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-2 ds-caption">
                      По умолчанию язык берётся из шапки. Логотип и название попадут на лендинг.
                    </p>
                  </SettingsSection>
                </>
              )}

              <SettingsSection
                title="Структура лендинга"
                done={sectionsOn}
                open={openSec.structure}
                onToggle={() => toggleSec("structure")}
              >
                <p className="mb-3 ds-caption">
                  Какие блоки включить в генерацию. По умолчанию включены все.
                </p>
                <div className="flex flex-col gap-1">
                  {LANDING_SECTIONS.map((s) => {
                    const checked = sections[s.id];
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleSection(s.id)}
                        className="flex items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition ${
                            checked
                              ? "border-accent-green bg-accent-green text-black"
                              : "border-border bg-background"
                          }`}
                        >
                          {checked ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {s.label}
                            {s.compliance ? (
                              <span className="rounded-full border border-[color:var(--status-premium)]/40 bg-[color:var(--status-premium)]/10 px-1.5 py-0.5 ds-micro text-[color:var(--status-premium)]">
                                рекомендуется
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block ds-caption">{s.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!sectionsOn ? (
                  <p className="mt-2 ds-micro text-[color:var(--status-error)]">
                    Выберите хотя бы один блок для генерации.
                  </p>
                ) : null}
              </SettingsSection>

              <SettingsSection
                title="CTA и детали"
                done
                open={openSec.cta}
                onToggle={() => toggleSec("cta")}
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block ds-label">
                      Текст CTA-кнопки <span className="text-muted-foreground">(опционально)</span>
                    </label>
                    <input
                      type="text"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      maxLength={32}
                      className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent-green"
                      placeholder="Играть сейчас · Забрать бонус · Сделать ставку"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block ds-label">
                      Детали оффера <span className="text-muted-foreground">(опционально)</span>
                    </label>
                    <textarea
                      value={offerDetails}
                      onChange={(e) => setOfferDetails(e.target.value)}
                      rows={2}
                      className="min-h-[72px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                      placeholder="Условия акции, вейджер, срок действия, мин. депозит…"
                    />
                  </div>
                </div>
              </SettingsSection>
            </div>
          </div>

          {/* Primary action — pinned to the bottom of the settings panel (result
              now opens on a dedicated editor page, so this is the only CTA). */}
          <div className="shrink-0 border-t border-border bg-panel p-3">
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="min-h-12 w-full rounded-lg bg-accent-green px-8 text-base font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Открываем редактор…" : "Сгенерировать"}
            </button>
            {subject.trim().length === 0 && status !== "loading" ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Заполните «Тематика лендинга», чтобы сгенерировать
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---- Left column ------------------------------------------------------------

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: LandingTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-lg border p-1.5 text-left transition ${
        selected
          ? "border-accent-green shadow-[0_0_40px_rgba(234,255,160,0.16)]"
          : "border-border hover:bg-[var(--bg-surface-hover)]"
      }`}
    >
      <div
        className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
        style={{ background: template.gradient }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{template.name}</span>
        <span className="block truncate ds-caption">{template.description}</span>
      </span>
      {selected ? (
        <span className="mr-1.5 shrink-0 rounded-full bg-accent-green p-0.5 text-black">
          <Check size={10} />
        </span>
      ) : null}
    </button>
  );
}

function LandingTemplateSidebar({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (t: LandingTemplate) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:flex-[2] lg:rounded-2xl lg:border">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="ds-h2">Шаблоны</h2>
      </div>
      {/* Desktop: templates column stays fixed — no internal scroll (the
          compact list fits), only the middle settings column scrolls. Mobile:
          templates are a full-screen tab, so keep it scrollable to never clip
          an expanded category. */}
      <div className="flex-1 overflow-y-auto px-4 py-2 lg:overflow-hidden">
        <div className="flex flex-col gap-4">
          {LANDING_TEMPLATE_CATEGORIES.map((cat) => {
            const isExpanded = expanded[cat.id];
            const shown = isExpanded ? cat.templates : cat.templates.slice(0, 1);
            const hasMore = cat.templates.length > 1;
            return (
              <div
                key={cat.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-[var(--bg-surface)] p-3"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <h3 className="text-sm font-semibold">{cat.label}</h3>
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                      className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-full bg-[var(--bg-surface-hover)] py-1 pl-3 pr-2 text-sm font-medium text-accent-green transition hover:bg-white/10 active:bg-white/[0.14] max-sm:min-h-11 max-sm:pl-4 max-sm:pr-3"
                    >
                      {isExpanded ? "Свернуть" : "Все"}
                      <ChevronRight className={`h-4 w-4 transition ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                  ) : null}
                </div>
                {shown.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={value === t.id}
                    onSelect={() => onSelect(t)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
