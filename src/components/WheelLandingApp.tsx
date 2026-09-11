"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Loader2,
  Monitor,
  Pipette,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { FortuneWheel, type WheelSegment } from "@/components/FortuneWheel";
import { bgPreset, characterPreset, removeBackground, trimTransparent } from "@/lib/landingCreative";
import { downloadText, slugify } from "@/lib/download";
import { buildWheelHtml } from "@/lib/wheelExport";
import { apiFetch } from "@/lib/api-client";
import { useGeneration } from "@/lib/generation-context";
import { toast } from "sonner";
import { imageCredits, CHARACTER_PRICE_CREDITS } from "@/lib/credit-estimate";
import { SuggestButton } from "@/components/landing/SuggestButton";

// Background = gemini-flash (cheap). Character = OpenAI transparent PNG (richer).
const BG_PRICE = imageCredits(1);
const CHAR_PRICE = CHARACTER_PRICE_CREDITS;

const DEFAULT_PRIZES: WheelSegment[] = [
  { label: "100 TFS" },
  { label: "450%", sub: "BONUS" },
  { label: "140 FS" },
  { label: "200 TFS" },
  { label: "100%", sub: "BONUS" },
  { label: "TRY AGAIN" },
];

export function WheelLandingApp() {
  const gen = useGeneration();
  const [brand, setBrand] = useState("LOGO");
  // Optional uploaded brand logo (PNG/data URL). When set, it's shown instead of
  // the brand text — both in the preview and the exported HTML.
  const [brandLogo, setBrandLogo] = useState("");
  const onLogoFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => setBrandLogo(String(r.result));
    r.readAsDataURL(f);
  };
  const [headline, setHeadline] = useState("TRY YOUR LUCK!");
  // Required "Тематика" — drives the ✨ AI suggestions for every field.
  const [topic, setTopic] = useState("");
  const [accent, setAccent] = useState("#f97316");
  const [dark, setDark] = useState(true);
  const [ctaText, setCtaText] = useState("SPIN");
  // Click-through target for the CTA / "Claim bonus": a real URL or a tracker
  // macro/variable (e.g. {clickurl}) that the traffic source replaces.
  const [ctaUrl, setCtaUrl] = useState("");
  const [theme, setTheme] = useState(
    "мультяшный кролик-персонаж с бейсбольной битой на зелёных холмах, монеты и морковь, яркий casino-promo фон",
  );
  const [bgImage, setBgImage] = useState("");
  // Two independent, optional character slots — one on each side of the wheel.
  const [chars, setChars] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [charPrompts, setCharPrompts] = useState<{ left: string; right: string }>({
    left: "мультяшный кролик-маскот с бейсбольной битой, дружелюбный, динамичная поза",
    right: "",
  });
  const [charGenning, setCharGenning] = useState<"left" | "right" | null>(null);
  const [prizes, setPrizes] = useState<WheelSegment[]>(DEFAULT_PRIZES);
  const [won, setWon] = useState<number | null>(null);
  const [spinSignal, setSpinSignal] = useState(0);
  // Which segment the NEXT spin must land on — computed fresh right before
  // every spin, restricted to the checked ("Может выпасть") segments only.
  // Passed straight through to FortuneWheel's own forceIndex prop.
  const [forceIndex, setForceIndex] = useState<number | undefined>(undefined);
  const [viewport, setViewport] = useState<"desktop" | "portrait" | "landscape">("desktop");
  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [costUsd, setCostUsd] = useState(0);
  // "Сделать лендинг из баннера": the approved banner, kept as a STYLE
  // reference for the bg/character i2i calls below — never shown directly,
  // only passed to the generator so a REGENERATED bg/character echoes the
  // banner's palette/mood instead of being invented from text alone.
  const [bannerRef, setBannerRef] = useState("");

  // Persist the whole landing (config + generated images) so nothing is lost on
  // reload or navigation.
  const [restored, setRestored] = useState(false);
  // Mount-time hydration (draft restore + banner-seed override, below) must
  // run EXACTLY once. React StrictMode double-invokes effects in dev; without
  // this guard, the second pass re-reads dw_wheel_draft (unchanged — the
  // debounced persist-effect hasn't written the fresh values yet) and
  // silently clobbers whatever the first pass's banner-seed just applied,
  // making a fresh "Сделать лендинг из баннера" appear to do nothing. Same
  // pattern already used in LandingGenApp.tsx's mount handoff.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem("dw_wheel_draft");
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (typeof d.brand === "string") setBrand(d.brand);
        if (typeof d.brandLogo === "string") setBrandLogo(d.brandLogo);
        if (typeof d.headline === "string") setHeadline(d.headline);
        if (typeof d.topic === "string") setTopic(d.topic);
        if (typeof d.accent === "string") setAccent(d.accent);
        if (typeof d.dark === "boolean") setDark(d.dark);
        if (typeof d.ctaText === "string") setCtaText(d.ctaText);
        if (typeof d.ctaUrl === "string") setCtaUrl(d.ctaUrl);
        if (typeof d.theme === "string") setTheme(d.theme);
        if (typeof d.bgImage === "string") setBgImage(d.bgImage);
        // Characters: new two-slot shape, with backward-compat for the old single slot.
        const cl = typeof d.charLeft === "string" ? d.charLeft : "";
        const cr = typeof d.charRight === "string" ? d.charRight : "";
        if (cl || cr) {
          setChars({ left: cl, right: cr });
        } else if (typeof d.character === "string" && d.character) {
          const side = d.charSide === "left" ? "left" : "right";
          setChars({
            left: side === "left" ? d.character : "",
            right: side === "right" ? d.character : "",
          });
        }
        const oldPrompt = typeof d.charPrompt === "string" ? d.charPrompt : "";
        setCharPrompts((p) => ({
          left:
            typeof d.charPromptLeft === "string"
              ? d.charPromptLeft
              : d.charSide === "left" && oldPrompt
                ? oldPrompt
                : p.left,
          right:
            typeof d.charPromptRight === "string"
              ? d.charPromptRight
              : d.charSide === "right" && oldPrompt
                ? oldPrompt
                : p.right,
        }));
        if (Array.isArray(d.prizes)) setPrizes(d.prizes as WheelSegment[]);
      }
    } catch {
      /* ignore */
    }

    // Banner → wheel handoff: prefill from the approved banner (analysed by
    // analyzeBannerForLanding — see ImageGenApp's "Сделать лендинг из баннера").
    // Its texts, brand and accent fill the fields; the AI-written background/
    // character prompts replace the placeholders; the banner itself becomes an
    // eager backdrop AND a style reference for later i2i regeneration.
    // Overrides the draft just restored above, then clears the seed.
    try {
      const raw = window.localStorage.getItem("dw:landingSeed");
      if (!raw) {
        setRestored(true);
        return;
      }
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (!s.from_banner) {
        setRestored(true);
        return;
      }
      // AUTHORITATIVE overwrite: this fires right after the draft-restore
      // effect above, which may have just repopulated brand/brandLogo/accent
      // from a STALE dw_wheel_draft left over from a previous, unrelated
      // session. A fresh "Сделать лендинг из баннера" must win outright —
      // explicitly set (or clear) every one of these fields instead of only
      // conditionally overriding when the seed happens to have a value,
      // which let the old draft's values silently keep showing whenever the
      // banner analysis came back empty for that one field.
      setBrand(typeof s.brand_name === "string" && s.brand_name ? s.brand_name : "LOGO");
      setBrandLogo(typeof s.brand_logo === "string" && s.brand_logo.startsWith("data:") ? s.brand_logo : "");
      setAccent(
        typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent) ? s.accent : "#f97316",
      );
      const head =
        (typeof s.banner_text === "string" && s.banner_text) ||
        (typeof s.subject === "string" ? s.subject : "");
      if (head) setHeadline(String(head).toUpperCase());
      if (typeof s.cta === "string" && s.cta) setCtaText(s.cta);
      if (typeof s.subject === "string" && s.subject) setTopic(s.subject);
      // AI-written prompts from the vision analysis (analyzeBannerForLanding) —
      // AUTHORITATIVE, same reasoning as brand/brandLogo/accent above: always
      // show what's actually about to be generated in these fields (falling
      // back to the mechanic's own default text, never a stale leftover from
      // a previous draft/session) rather than silently no-op when a field
      // happens to come back empty. Fire off the actual generation
      // immediately (not just prefill-and-wait): pass the fresh values
      // directly rather than relying on the state just set here, which
      // hasn't committed yet in this same effect tick.
      const bannerHasCharacter = typeof s.character_prompt === "string" && s.character_prompt.length > 0;
      const bgPrompt =
        typeof s.background_prompt === "string" && s.background_prompt
          ? s.background_prompt
          : "мультяшный кролик-персонаж с бейсбольной битой на зелёных холмах, монеты и морковь, яркий casino-promo фон";
      const charPrompt = bannerHasCharacter
        ? (s.character_prompt as string)
        : "мультяшный кролик-маскот с бейсбольной битой, дружелюбный, динамичная поза";
      setTheme(bgPrompt);
      setCharPrompts((p) => ({ ...p, left: charPrompt }));
      // AUTHORITATIVE for the rendered character image too, not just its
      // prompt text: clear the left slot outright (a restored draft above
      // may have left an OLD character image showing from a previous banner
      // that DID have one). If this banner has a character, generateCharacter
      // below fills it back in moments later; if it doesn't, the slot now
      // correctly stays empty instead of keeping the stale one.
      setChars((c) => ({ ...c, left: "" }));
      const bannerImg = gen.imageUrl || "";
      if (bannerImg) {
        setBgImage(bannerImg); // instant preview while the real generation runs
        setBannerRef(bannerImg);
      }
      void generateBg(bgPrompt, bannerImg || undefined);
      if (bannerHasCharacter) void generateCharacter("left", charPrompt, bannerImg || undefined);
      window.localStorage.removeItem("dw:landingSeed");
      toast.success("Данные баннера перенесены — генерируем фон и персонажа…");
    } catch {
      /* malformed seed — ignore */
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      const data = {
        brand,
        brandLogo,
        headline,
        topic,
        accent,
        dark,
        ctaText,
        ctaUrl,
        theme,
        bgImage,
        charLeft: chars.left,
        charRight: chars.right,
        charPromptLeft: charPrompts.left,
        charPromptRight: charPrompts.right,
        prizes,
      };
      try {
        window.localStorage.setItem("dw_wheel_draft", JSON.stringify(data));
      } catch {
        // Quota (large data URLs) — keep at least the config.
        try {
          window.localStorage.setItem(
            "dw_wheel_draft",
            JSON.stringify({ ...data, bgImage: "", charLeft: "", charRight: "", brandLogo: "" }),
          );
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [restored, brand, brandLogo, headline, topic, accent, dark, ctaText, ctaUrl, theme, bgImage, chars, charPrompts, prizes]);

  const setPrize = (i: number, patch: Partial<WheelSegment>) =>
    setPrizes((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addPrize = () => setPrizes((p) => (p.length < 12 ? [...p, { label: "Приз", enabled: true }] : p));
  const removePrize = (i: number) =>
    setPrizes((p) => (p.length > 2 ? p.filter((_, idx) => idx !== i) : p));

  // Pick which segment the wheel is ALLOWED to land on (checkbox-enabled
  // ones only — `enabled` defaults to true when the field is absent, so
  // existing/legacy prize lists without the flag still work as "all on"),
  // then trigger the spin. Falls back to the full list if every segment
  // happens to be unchecked (never render a dead SPIN button).
  const spinWheel = () => {
    const pool = prizes
      .map((_, i) => i)
      .filter((i) => prizes[i].enabled !== false);
    const from = pool.length > 0 ? pool : prizes.map((_, i) => i);
    setForceIndex(from[Math.floor(Math.random() * from.length)]);
    setSpinSignal((s) => s + 1);
  };

  // "Забрать бонус" — navigate the visitor to the configured offer. A macro
  // placeholder (e.g. {clickurl}) is meant to be substituted by the traffic
  // source at serve time — it can't be resolved here in the builder preview,
  // so we explain that instead of trying (and failing) to navigate to it.
  const claimBonus = () => {
    setWon(null);
    const url = ctaUrl.trim();
    if (!url) return;
    if (/[{}]/.test(url)) {
      toast.info("Это переменная-макрос — трафик-система подставит ссылку на реальном лендинге");
      return;
    }
    try {
      const abs = new URL(url, window.location.origin).toString();
      window.open(abs, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Некорректная ссылка в поле CTA");
    }
  };

  const genImage = async (payload: Record<string, unknown>): Promise<string> => {
    const res = await apiFetch("/api/generate-email-hero", { method: "POST", json: payload });
    const data = await res.json();
    if (!res.ok || !data.imageUrl) {
      throw new Error([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
    }
    if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
    return data.imageUrl as string;
  };

  // Both accept an optional (theme/prompt, reference) override so the banner-
  // seed effect can trigger generation immediately with the just-fetched
  // values — reading `theme`/`bannerRef` from closure there would race the
  // setState calls that set them (still holding the PREVIOUS render's value).
  const generateBg = async (themeOverride?: string, refOverride?: string) => {
    const useTheme = themeOverride ?? theme;
    const ref = refOverride ?? bannerRef;
    setGenning(true);
    setGenError("");
    try {
      // A themed ENVIRONMENT/backdrop (not a hero banner): immersive scene with a
      // clear central area for the wheel and no characters or central subject.
      setBgImage(
        await genImage({
          presetTemplate: bgPreset(useTheme),
          feature: "landing-bg",
          ...(ref ? { styleReferenceImage: ref } : {}),
        }),
      );
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setGenning(false);
    }
  };

  const generateCharacter = async (
    side: "left" | "right",
    promptOverride?: string,
    refOverride?: string,
  ) => {
    const prompt = (promptOverride ?? charPrompts[side]).trim();
    if (!prompt) return;
    const ref = refOverride ?? bannerRef;
    setCharGenning(side);
    setGenError("");
    try {
      // Primary: OpenAI transparent PNG — clean alpha straight from the model,
      // no rembg cutout. Trim empty margins so the character doesn't levitate.
      // When seeded from a banner, pass it as a reference (i2i) so the
      // character is the SAME recognizable one from the banner, not a guess.
      const res = await apiFetch("/api/generate-character", {
        method: "POST",
        json: {
          prompt: characterPreset(prompt),
          ...(ref ? { reference_image: ref } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
        const trimmed = await trimTransparent(data.imageUrl);
        setChars((c) => ({ ...c, [side]: trimmed }));
        return;
      }
      throw new Error(
        [data?.error, data?.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать",
      );
    } catch {
      // Fallback: gemini image + rembg cutout (old path).
      try {
        const raw = await genImage({
          presetTemplate: characterPreset(prompt),
          aspectRatio: "3:4",
          feature: "landing-character",
        });
        const cut = await removeBackground(raw);
        setChars((c) => ({ ...c, [side]: cut }));
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Ошибка запроса");
      }
    } finally {
      setCharGenning(null);
    }
  };

  const inputCls =
    "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";

  const renderCharSlot = (side: "left" | "right", title: string) => (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {chars[side] ? (
          <button
            type="button"
            onClick={() => setChars((c) => ({ ...c, [side]: "" }))}
            className="text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Убрать
          </button>
        ) : null}
      </div>
      <textarea
        className={`${inputCls} min-h-[52px] resize-y py-2 text-xs`}
        rows={2}
        value={charPrompts[side]}
        onChange={(e) => setCharPrompts((p) => ({ ...p, [side]: e.target.value }))}
        placeholder="Опишите персонажа / маскота"
      />
      <div className="mt-2 flex items-center gap-2">
        <SuggestButton
          topic={topic}
          field="character"
          mechanic="wheel"
          onFill={(t) => setCharPrompts((p) => ({ ...p, [side]: t }))}
        />
        <button
          type="button"
          onClick={() => generateCharacter(side)}
          disabled={charGenning !== null || !charPrompts[side].trim()}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {charGenning === side
            ? "Генерирую…"
            : `${chars[side] ? "Заменить" : "Генерация"} · ${CHAR_PRICE}`}
        </button>
        {chars[side] ? (
          <img
            src={chars[side]}
            alt=""
            className="h-9 w-9 shrink-0 rounded-md border border-border bg-white/5 object-contain"
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,400px)_1fr]">
      {/* ── Config ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <header>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href="/landing"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> К шаблонам лендингов
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Сбросить все настройки лендинга к значениям по умолчанию?")) return;
                try {
                  window.localStorage.removeItem("dw_wheel_draft");
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
              title="Очистить сохранённый черновик и вернуть значения по умолчанию"
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-border/80 hover:text-foreground"
            >
              Сбросить по умолчанию
            </button>
          </div>
          <p className="ds-overline text-accent-green">Лендинг</p>
          <h1 className="ds-h1 mt-1">Колесо фортуны</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Геймифицированный лендинг: крутите колесо, выигрывайте бонус, ведите на регистрацию.
          </p>
        </header>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <label className="ds-h4">Цветовая гамма</label>
            <Pipette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#f97316"}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Акцентный цвет"
            title="Выбрать цвет"
            className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-elevated p-0 [&::-moz-color-swatch]:rounded-[6px] [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[6px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:rounded-[6px] [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <p className="mt-1.5 ds-caption">Определяет акцентный цвет фона, кнопок и подсветки на лендинге.</p>
        </div>

        <Field label="Тематика *">
          <textarea
            className={`${inputCls} min-h-[60px] resize-y py-2`}
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Что хотите на лендинге: тематика, оффер, визуал…"
          />
          <p className="mt-1 ds-caption">
            Обязательно. По тематике ИИ подбирает тексты и промпты — жмите ✨ у полей.
          </p>
        </Field>

        <Field label="Заголовок">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
            <SuggestButton topic={topic} field="headline" mechanic="wheel" onFill={setHeadline} />
          </div>
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Бренд">
            {brandLogo ? (
              <div className="flex h-11 items-center gap-2">
                <img
                  src={brandLogo}
                  alt=""
                  className="h-9 w-auto max-w-[140px] rounded bg-white/5 object-contain p-1"
                />
                <button
                  type="button"
                  onClick={() => setBrandLogo("")}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Убрать лого
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Название или загрузите лого"
                />
                <label
                  className="flex h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
                  title="Загрузить PNG-лого"
                >
                  PNG
                  <input
                    type="file"
                    accept="image/png,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onLogoFile(f);
                    }}
                  />
                </label>
              </div>
            )}
          </Field>
          <div>
            <label className="mb-2 block ds-h4">Тёмный</label>
            <div className="flex h-11 items-center">
              <button
                type="button"
                role="switch"
                aria-checked={dark}
                aria-label="Тёмный фон"
                onClick={() => setDark((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  dark ? "bg-accent-green" : "bg-white/15"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    dark ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* AI background */}
        <div className="rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-3">
          <Field label="Сцена / персонаж (для фона)">
            <div className="flex items-start gap-2">
              <textarea
                className={`${inputCls} min-h-[70px] resize-y py-2`}
                rows={2}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
              <SuggestButton topic={topic} field="bg" mechanic="wheel" onFill={setTheme} />
            </div>
          </Field>
          <button
            type="button"
            onClick={() => void generateBg()}
            disabled={genning}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {genning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genning
              ? "Генерирую фон…"
              : `${bgImage ? "Перегенерировать фон" : "Сгенерировать фон"} · ${BG_PRICE}`}
          </button>
          {bgImage ? (
            <button
              type="button"
              onClick={() => setBgImage("")}
              className="mt-2 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Убрать фон
            </button>
          ) : null}
          {genError ? <p className="mt-2 text-xs text-[color:var(--status-error)]">{genError}</p> : null}
        </div>

        {/* Characters (optional) — up to two, one flanking each side of the wheel */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="ds-h4">
            Персонажи{" "}
            <span className="ds-caption font-normal normal-case tracking-normal">
              (опционально, по бокам колеса)
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {renderCharSlot("left", "Слева")}
            {renderCharSlot("right", "Справа")}
          </div>
        </div>

        {/* Prizes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="ds-h4">Сектора колеса</label>
            <button
              type="button"
              onClick={addPrize}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-green transition hover:text-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить
            </button>
          </div>
          <p className="mb-2 ds-caption">
            Отмеченные ✓ сектора могут выпасть игроку. Снимите галочку, чтобы исключить сектор из
            розыгрыша — он останется на колесе, но никогда не станет призом.
          </p>
          <div className="flex flex-col gap-2">
            {prizes.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.enabled !== false}
                  onChange={(e) => setPrize(i, { enabled: e.target.checked })}
                  aria-label="Может выпасть"
                  title="Может выпасть"
                  className="h-5 w-5 shrink-0 cursor-pointer accent-[color:var(--color-accent-green,#9bff58)]"
                />
                <input
                  className={`${inputCls} h-10`}
                  value={s.label}
                  onChange={(e) => setPrize(i, { label: e.target.value })}
                  placeholder="Приз"
                />
                <input
                  className={`${inputCls} h-10 w-24`}
                  value={s.sub ?? ""}
                  onChange={(e) => setPrize(i, { sub: e.target.value })}
                  placeholder="подпись"
                />
                <button
                  type="button"
                  onClick={() => removePrize(i)}
                  aria-label="Удалить сектор"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-[var(--status-error)]/50 hover:text-[var(--status-error)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Кнопка">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
            <SuggestButton topic={topic} field="cta" mechanic="wheel" onFill={setCtaText} />
          </div>
        </Field>

        <Field label="Ссылка перехода (CTA)">
          <input
            className={inputCls}
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://your-offer.com или {clickurl}"
          />
          <p className="mt-1 ds-caption">
            Куда ведёт кнопка после выигрыша. Можно вставить URL или переменную-макрос
            (напр. {"{clickurl}"}) — трафик-система подставит ссылку.
          </p>
        </Field>

        <button
          type="button"
          onClick={() =>
            downloadText(
              `${slugify(brand, "wheel")}-wheel.html`,
              buildWheelHtml({
                brand,
                brandLogo,
                headline,
                accent,
                dark,
                ctaText,
                ctaUrl,
                bgImage,
                prizes,
                charLeft: chars.left,
                charRight: chars.right,
              }),
            )
          }
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          <Download className="h-4 w-4" /> Скачать HTML
        </button>
      </div>

      {/* ── Live landing preview ───────────────────────────── */}
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="ds-caption">Предпросмотр лендинга</p>
          <div className="flex rounded-lg border border-border p-0.5">
            {(
              [
                ["desktop", Monitor, "Десктоп", ""],
                ["landscape", Smartphone, "Моб. горизонталь", "rotate-90"],
                ["portrait", Smartphone, "Моб. вертикаль", ""],
              ] as const
            ).map(([v, Icon, title, rot]) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewport(v)}
                title={title}
                aria-label={title}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewport === v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${rot}`} />
              </button>
            ))}
          </div>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-2xl border border-border ${
            viewport === "portrait"
              ? "mx-auto aspect-[9/16] max-w-[300px]"
              : viewport === "landscape"
                ? "aspect-[16/9]"
                : "aspect-[16/11]"
          }`}
          style={{ background: dark ? "#1a1030" : "#fde8b0" }}
        >
          {bgImage ? (
            <img src={bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), ${dark ? "#160d29" : "#ffe9a8"}` }}
            />
          )}
          {/* Darkening for legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />

          {/* Characters — anchored to the VIEWPORT bottom so the crop bleeds off the
              edge (no floating, no visible cut line). Behind the wheel/SPIN column. */}
          {(["left", "right"] as const).map((side) =>
            chars[side] ? (
              <img
                key={side}
                src={chars[side]}
                alt=""
                className={`pointer-events-none absolute z-20 object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)] ${
                  viewport === "portrait" ? "h-[84%] max-w-[56%]" : "h-full max-w-[46%]"
                }`}
                style={{
                  [side]: viewport === "portrait" ? "-1%" : "-4%",
                  bottom: viewport === "portrait" ? "-7%" : "-9%",
                }}
              />
            ) : null,
          )}

          <div className="relative z-30 flex h-full flex-col items-center px-4 py-4">
            <div className="flex w-full items-center justify-between">
              {brandLogo ? (
                <img src={brandLogo} alt="" className="h-6 w-auto max-w-[45%] object-contain drop-shadow" />
              ) : (
                <span className="text-sm font-extrabold text-white drop-shadow">{brand || "LOGO"}</span>
              )}
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/80">EN</span>
            </div>

            <h2
              className="mt-1 text-center text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl"
              style={{ color: "#fff", textShadow: `0 2px 0 ${accent}, 0 4px 10px rgba(0,0,0,.5)` }}
            >
              {headline || "TRY YOUR LUCK!"}
            </h2>

            <div
              className={`relative mt-3 flex w-full flex-1 justify-center ${
                viewport === "portrait" ? "items-start pt-1" : "items-center"
              }`}
            >
              <div className="relative z-10 mx-auto aspect-square h-full max-h-[520px] max-w-full">
                <FortuneWheel
                  segments={prizes}
                  accent={accent}
                  forceIndex={forceIndex}
                  spinSignal={spinSignal}
                  onResult={setWon}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={spinWheel}
              className="relative z-30 mb-1 mt-2 w-[82%] max-w-[380px] rounded-full py-3 text-center text-lg font-extrabold uppercase tracking-wide text-white shadow-lg transition active:scale-95"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}
            >
              {ctaText || "SPIN"}
            </button>
          </div>

          {/* Win / try-again modal */}
          {won !== null
            ? (() => {
                const seg = prizes[won];
                const lose = !seg || /try\s*again|снова|ещё раз|заново|again|empty|пусто/i.test(seg.label);
                return (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6">
                    <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
                      {lose ? (
                        <>
                          <p className="text-lg font-extrabold text-[#0f172a]">😅 Почти!</p>
                          <p className="mt-1 text-sm text-[#475569]">
                            В этот раз не повезло — крутите ещё раз, приз ждёт!
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setWon(null);
                              spinWheel();
                            }}
                            className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
                            style={{ backgroundColor: accent }}
                          >
                            Крутить ещё раз
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-extrabold text-[#0f172a]">🎉 Поздравляем!</p>
                          <p className="mt-1 text-sm text-[#475569]">
                            Вы выиграли{" "}
                            <span className="font-bold" style={{ color: accent }}>
                              {seg.label} {seg.sub}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={claimBonus}
                            className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
                            style={{ backgroundColor: accent }}
                          >
                            Забрать бонус
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setWon(null)}
                        aria-label="Закрыть"
                        className="absolute right-3 top-3 text-[#94a3b8] hover:text-[#0f172a]"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                );
              })()
            : null}
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
