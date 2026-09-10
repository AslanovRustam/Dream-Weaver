"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Monitor, Plus, Smartphone, Sparkles, Trash2, X } from "lucide-react";

import { SlotMachine } from "@/components/SlotMachine";
import { bgPreset, characterPreset, removeBackground, trimTransparent } from "@/lib/landingCreative";
import { sliceIconGrid } from "@/lib/spriteSlice";
import { downloadText, slugify } from "@/lib/download";
import { buildSlotHtml } from "@/lib/slotExport";
import { apiFetch } from "@/lib/api-client";
import { useGeneration } from "@/lib/generation-context";
import { toast } from "sonner";
import { imageCredits, CHARACTER_PRICE_CREDITS, SLOT_SYMBOLS_PRICE_CREDITS } from "@/lib/credit-estimate";
import { SuggestButton } from "@/components/landing/SuggestButton";

const BG_PRICE = imageCredits(1);
const CHAR_PRICE = CHARACTER_PRICE_CREDITS;
const SYMBOLS_PRICE = SLOT_SYMBOLS_PRICE_CREDITS;

// Reel symbols are PURELY VISUAL — any of them can land the payline (every
// spin is a guaranteed win, see `attempts` below), which one shows has no
// effect on the bonus. `imageUrl` (optional) is an AI-generated icon PNG —
// when set it's rendered instead of `symbol`'s plain text/emoji glyph, on
// both the reel and the win popup.
export type SlotSymbol = { symbol: string; imageUrl?: string };

/** Accepts either the legacy plain-string symbol format or the current
 *  { symbol, imageUrl } shape (plus any now-dropped legacy bonus/enabled
 *  fields, silently ignored), from localStorage/seed data of unknown
 *  provenance. */
function normalizeSymbol(raw: unknown): SlotSymbol {
  if (typeof raw === "string") return { symbol: raw };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      symbol: typeof r.symbol === "string" ? r.symbol : "⭐",
      imageUrl: typeof r.imageUrl === "string" && r.imageUrl.startsWith("data:") ? r.imageUrl : undefined,
    };
  }
  return { symbol: "⭐" };
}

const DEFAULT_SYMBOLS: SlotSymbol[] = [
  { symbol: "🍒" },
  { symbol: "💎" },
  { symbol: "7️⃣" },
  { symbol: "🔔" },
  { symbol: "⭐" },
  { symbol: "🍋" },
  { symbol: "🍇" },
  { symbol: "🧧" },
];

/** Ordered list of GUARANTEED wins — one bonus text per attempt (e.g.
 *  "50 USD bonus", then "100% deposit bonus"). Every spin always wins; the
 *  bonus shown is picked by how many spins have happened so far, not by
 *  which symbol landed. All attempts but the last show "Крутить ещё"; the
 *  last shows "Забрать бонус" (the real CTA). */
const DEFAULT_ATTEMPTS: string[] = [""];

// One-click themes: set background scene, character, accent and headline together
// so the whole landing matches a single тематика.
const THEMES: {
  id: string;
  label: string;
  accent: string;
  headline: string;
  bg: string;
  char: string;
}[] = [
  {
    id: "cartoon",
    label: "Мультяшный",
    accent: "#f97316",
    headline: "SPIN TO WIN!",
    bg: "яркий мультяшный лес: зелёные холмы, деревья, голубое небо с облаками, парящие золотые монеты",
    char: "мультяшный кролик-маскот с бейсбольной битой, дружелюбный, динамичная поза",
  },
  {
    id: "vegas",
    label: "Вегас",
    accent: "#eab308",
    headline: "JACKPOT NIGHT",
    bg: "ночной Лас-Вегас: неоновые вывески, золотые огни, ретро-казино маркиза, блеск и роскошь",
    char: "мультяшный крупье в смокинге с бабочкой, обаятельная уверенная поза",
  },
  {
    id: "beach",
    label: "Пляж",
    accent: "#06b6d4",
    headline: "LUCKY SPINS",
    bg: "тропический пляж: золотой песок, пальмы, бирюзовое море, воздушные шары, яркое летнее солнце",
    char: "мультяшный король-спасатель на пляже, корона, весёлый, шорты",
  },
  {
    id: "cyber",
    label: "Киберпанк",
    accent: "#8b5cf6",
    headline: "WIN IN CRYPT",
    bg: "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
    char: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
  },
  {
    id: "egypt",
    label: "Египет",
    accent: "#d97706",
    headline: "BOOK OF RICHES",
    bg: "древний Египет: золотые саркофаги, иероглифы на стенах, пирамиды вдали, тёплый песочный свет, богатство",
    char: "мультяшный фараон-маскот, золотые украшения, уверенная поза",
  },
];

export function SlotLandingApp() {
  const gen = useGeneration();
  const [brand, setBrand] = useState("LOGO");
  const [brandLogo, setBrandLogo] = useState("");
  const onLogoFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => setBrandLogo(String(r.result));
    r.readAsDataURL(f);
  };
  const [headline, setHeadline] = useState("SPIN TO WIN!");
  const [topic, setTopic] = useState("");
  const [accent, setAccent] = useState("#818cf8");
  const [dark, setDark] = useState(true);
  const [ctaText, setCtaText] = useState("SPIN");
  const [ctaUrl, setCtaUrl] = useState("");
  const [theme, setTheme] = useState(
    "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
  );
  const [bgImage, setBgImage] = useState("");
  // Two independent, optional character slots — one on each side of the machine.
  const [chars, setChars] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [charPrompts, setCharPrompts] = useState<{ left: string; right: string }>({
    left: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
    right: "",
  });
  const [charGenning, setCharGenning] = useState<"left" | "right" | null>(null);
  const [symbols, setSymbols] = useState<SlotSymbol[]>(DEFAULT_SYMBOLS);
  // AI icon-set generation: one call draws `symbolCount` icons on a single
  // grid image (see /api/generate-slot-symbols), sliceIconGrid() cuts it into
  // individual symbol PNGs client-side.
  const [symbolTheme, setSymbolTheme] = useState("");
  const [symbolCount, setSymbolCount] = useState<6 | 8>(8);
  const [symbolRef, setSymbolRef] = useState("");
  const [symbolsGenning, setSymbolsGenning] = useState(false);
  const onSymbolRefFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => setSymbolRef(String(r.result));
    r.readAsDataURL(f);
  };
  // Ordered, guaranteed-win bonus sequence — see DEFAULT_ATTEMPTS above.
  const [attempts, setAttempts] = useState<string[]>(DEFAULT_ATTEMPTS);
  // Mirrors SlotMachine's own internal spin counter (via onSpinsChange) so
  // the external CTA button below the reel can disable/relabel itself once
  // every configured attempt has been played — SlotMachine is the single
  // source of truth since it also gates its own internal lever.
  const [attemptIndex, setAttemptIndex] = useState(0);
  const attemptIndexRef = useRef(0);
  const [won, setWon] = useState<{ symbol: string; imageUrl?: string; bonus: string; isLast: boolean } | null>(
    null,
  );
  const [spinSignal, setSpinSignal] = useState(0);
  const [viewport, setViewport] = useState<"desktop" | "portrait" | "landscape">("desktop");
  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [costUsd, setCostUsd] = useState(0);
  // "Сделать лендинг из баннера": the approved banner, kept as a STYLE
  // reference for the bg/character i2i calls below — never shown directly,
  // only passed to the generator so a REGENERATED bg/character echoes the
  // banner's palette/mood instead of being invented from text alone.
  const [bannerRef, setBannerRef] = useState("");

  // Persist the whole landing (config + generated images).
  const [restored, setRestored] = useState(false);
  // Mount-time hydration (draft restore + banner-seed override, below) must
  // run EXACTLY once. React StrictMode double-invokes effects in dev; without
  // this guard, the second pass re-reads dw_slot_draft (unchanged — the
  // debounced persist-effect hasn't written the fresh values yet) and
  // silently clobbers whatever the first pass's banner-seed just applied,
  // making a fresh "Сделать лендинг из баннера" appear to do nothing. Same
  // pattern already used in LandingGenApp.tsx's mount handoff.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem("dw_slot_draft");
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
        const cl = typeof d.charLeft === "string" ? d.charLeft : "";
        const cr = typeof d.charRight === "string" ? d.charRight : "";
        if (cl || cr) setChars({ left: cl, right: cr });
        if (typeof d.charPromptLeft === "string" || typeof d.charPromptRight === "string") {
          setCharPrompts((p) => ({
            left: typeof d.charPromptLeft === "string" ? d.charPromptLeft : p.left,
            right: typeof d.charPromptRight === "string" ? d.charPromptRight : p.right,
          }));
        }
        if (Array.isArray(d.symbols) && d.symbols.length >= 3) {
          setSymbols((d.symbols as unknown[]).map(normalizeSymbol));
        }
        if (Array.isArray(d.attempts) && d.attempts.length > 0) {
          const list = (d.attempts as unknown[]).map((v) => (typeof v === "string" ? v : ""));
          setAttempts(list);
        }
      }
    } catch {
      /* ignore */
    }

    // Banner → slot handoff: prefill from the banner (the reference) — its
    // texts, brand, CTA and palette fill the fields, and the banner image
    // itself becomes the backdrop (read live from the generation context).
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
      // from a STALE dw_slot_draft left over from a previous, unrelated
      // session. A fresh "Сделать лендинг из баннера" must win outright —
      // explicitly set (or clear) every one of these fields instead of only
      // conditionally overriding when the seed happens to have a value,
      // which let the old draft's values silently keep showing whenever the
      // banner analysis came back empty for that one field.
      setBrand(typeof s.brand_name === "string" && s.brand_name ? s.brand_name : "LOGO");
      setBrandLogo(typeof s.brand_logo === "string" && s.brand_logo.startsWith("data:") ? s.brand_logo : "");
      setAccent(
        typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent) ? s.accent : "#818cf8",
      );
      const head =
        (typeof s.banner_text === "string" && s.banner_text) ||
        (typeof s.subject === "string" ? s.subject : "");
      if (head) setHeadline(String(head).toUpperCase());
      if (typeof s.cta === "string" && s.cta) setCtaText(s.cta);
      if (typeof s.subject === "string" && s.subject) setTopic(s.subject);
      // AI-derived slot-reel symbols (6, themed to the banner) — replace the
      // generic defaults outright when present. Purely visual; bonus text
      // lives in `attempts`, configured separately by the user below.
      if (Array.isArray(s.symbols) && s.symbols.length >= 3) {
        setSymbols(s.symbols.map((x) => ({ symbol: String(x) })));
      }
      // AI-written prompts from the vision analysis (analyzeBannerForLanding) —
      // AUTHORITATIVE, same reasoning as brand/brandLogo/accent above: always
      // show what's actually about to be generated in these fields (falling
      // back to the mechanic's own default text, never a stale leftover from
      // a previous draft/session) rather than silently no-op when a field
      // happens to come back empty. Fire off the actual generation
      // immediately (not just prefill-and-wait): pass the fresh values
      // directly rather than relying on the state just set here, which
      // hasn't committed yet in this same effect tick.
      // Whether the banner actually had a detected person — analysis leaves
      // character_prompt empty when it doesn't (see ImageGenApp's seed
      // build). Only auto-generate a character when it did; the field
      // itself still always shows something sensible (below), but we must
      // not invent/auto-render a generic character for a banner that had none.
      const bannerHasCharacter = typeof s.character_prompt === "string" && s.character_prompt.length > 0;
      const bgPrompt =
        typeof s.background_prompt === "string" && s.background_prompt
          ? s.background_prompt
          : "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база";
      const charPrompt = bannerHasCharacter
        ? (s.character_prompt as string)
        : "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль";
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
        symbols,
        attempts,
      };
      try {
        window.localStorage.setItem("dw_slot_draft", JSON.stringify(data));
      } catch {
        try {
          window.localStorage.setItem(
            "dw_slot_draft",
            JSON.stringify({
              ...data,
              bgImage: "",
              charLeft: "",
              charRight: "",
              brandLogo: "",
              symbols: symbols.map((s) => ({ ...s, imageUrl: undefined })),
            }),
          );
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [
    restored,
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
    chars,
    charPrompts,
    symbols,
    attempts,
  ]);

  const applyTheme = (t: (typeof THEMES)[number]) => {
    setAccent(t.accent);
    setHeadline(t.headline);
    setTheme(t.bg);
    setCharPrompts((p) => ({ ...p, left: t.char }));
  };

  const setSymbol = (i: number, patch: Partial<SlotSymbol>) =>
    setSymbols((s) => s.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addSymbol = () => setSymbols((s) => (s.length < 12 ? [...s, { symbol: "⭐" }] : s));
  const removeSymbol = (i: number) =>
    setSymbols((s) => (s.length > 3 ? s.filter((_, idx) => idx !== i) : s));

  // Bonus sequence — arbitrary length, one guaranteed-win bonus text each.
  const setAttemptBonus = (i: number, bonus: string) =>
    setAttempts((a) => a.map((v, idx) => (idx === i ? bonus : v)));
  const addAttempt = () => setAttempts((a) => (a.length < 20 ? [...a, ""] : a));
  const removeAttempt = (i: number) => setAttempts((a) => (a.length > 1 ? a.filter((_, idx) => idx !== i) : a));

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

  // Generate `symbolCount` unique icons in ONE call (a single grid image),
  // then slice it into individual symbol PNGs — replaces the current symbol
  // list outright, keeping each slot's existing bonus/glyph text where the
  // new list is at least as long (so re-rolling doesn't wipe bonus amounts
  // the user already typed in).
  const generateSlotIcons = async () => {
    const prompt = (symbolTheme || topic).trim();
    if (!prompt) {
      toast.error("Укажите тематику иконок (или тематику лендинга выше)");
      return;
    }
    setSymbolsGenning(true);
    setGenError("");
    try {
      const rows = 2;
      const cols = symbolCount / rows;
      const res = await apiFetch("/api/generate-slot-symbols", {
        method: "POST",
        json: {
          prompt,
          count: symbolCount,
          ...(symbolRef ? { reference_image: symbolRef } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        throw new Error(
          [data?.error, data?.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать",
        );
      }
      if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
      const tiles = await sliceIconGrid(data.imageUrl, cols, rows);
      setSymbols((prev) =>
        tiles.map((imageUrl, i) => ({
          symbol: prev[i]?.symbol || DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length].symbol,
          imageUrl,
        })),
      );
      toast.success(`Сгенерировано ${tiles.length} иконок символов`);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setSymbolsGenning(false);
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
      // Primary: OpenAI transparent PNG (clean alpha, no rembg). Trim margins.
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
      // Fallback: gemini image + rembg cutout.
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
      <div className="flex items-start gap-2">
        <textarea
          className={`${inputCls} min-h-[52px] resize-y py-2 text-xs`}
          rows={2}
          value={charPrompts[side]}
          onChange={(e) => setCharPrompts((p) => ({ ...p, [side]: e.target.value }))}
          placeholder="Опишите персонажа / маскота"
        />
        <SuggestButton
          topic={topic}
          field="character"
          mechanic="slot"
          onFill={(t) => setCharPrompts((p) => ({ ...p, [side]: t }))}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
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
                  window.localStorage.removeItem("dw_slot_draft");
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
          <h1 className="ds-h1 mt-1">Слот-машина</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Геймифицированный лендинг: крутите барабаны, ловите три в ряд, ведите на регистрацию.
          </p>
        </header>

        <div>
          <label className="mb-2 block ds-h4">
            Тематика <span className="text-accent-green">*</span>
          </label>
          <textarea
            className={`${inputCls} min-h-[64px] resize-y py-2`}
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Что хотите на лендинге: тематика, оффер, визуал…"
          />
          <p className="mt-1.5 ds-caption">
            Обязательно. По тематике ИИ подбирает тексты и промпты — жмите ✨ у полей.
          </p>
        </div>

        <div>
          <label className="mb-2 block ds-h4">Быстрые темы</label>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTheme(t)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.accent }} />
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 ds-caption">
            Задаёт фон, персонажа, цвет и заголовок под тему — затем сгенерируйте фон и персонажа.
          </p>
        </div>

        <Field label="Заголовок">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
            <SuggestButton topic={topic} field="headline" mechanic="slot" onFill={setHeadline} />
          </div>
        </Field>
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
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
            <label className="mb-2 block ds-h4">Акцент</label>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#818cf8"}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Акцент машины"
              className="h-11 w-11 cursor-pointer rounded-lg border border-border bg-elevated"
            />
          </div>
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
              <SuggestButton topic={topic} field="bg" mechanic="slot" onFill={setTheme} />
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

        {/* Characters (optional) — up to two, one flanking each side */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="ds-h4">
            Персонажи{" "}
            <span className="ds-caption font-normal normal-case tracking-normal">
              (опционально, по бокам машины)
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {renderCharSlot("left", "Слева")}
            {renderCharSlot("right", "Справа")}
          </div>
        </div>

        {/* Symbols */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="ds-h4">Символы барабанов</label>
            <button
              type="button"
              onClick={addSymbol}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-green transition hover:text-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить
            </button>
          </div>
          {/* AI-generated icon set: one call draws the whole grid, then we
              slice it into individual symbol images below. */}
          <div className="mb-3 rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="ds-h4">Иконки символов (ИИ)</span>
              <div className="flex rounded-lg border border-border p-0.5">
                {([6, 8] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSymbolCount(n)}
                    className={`h-7 w-9 rounded-md text-xs font-semibold transition ${
                      symbolCount === n
                        ? "bg-accent-green text-on-accent"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className={`${inputCls} min-h-[54px] resize-y py-2 text-xs`}
              rows={2}
              value={symbolTheme}
              onChange={(e) => setSymbolTheme(e.target.value)}
              placeholder={
                topic
                  ? `По умолчанию — тематика лендинга: «${topic}»`
                  : "Тематика иконок (например: фрукты и самоцветы в стиле киберпанк)"
              }
            />
            <div className="mt-2 flex items-center gap-2">
              {symbolRef ? (
                <div className="relative h-9 w-9 shrink-0">
                  <img
                    src={symbolRef}
                    alt=""
                    className="h-9 w-9 rounded-md border border-border bg-white/5 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setSymbolRef("")}
                    title="Убрать референс"
                    aria-label="Убрать референс"
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[9px] text-white"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label
                  className="flex h-9 shrink-0 cursor-pointer items-center rounded-lg border border-border px-2 text-[11px] font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
                  title="Референс стиля (опционально)"
                >
                  Референс
                  <input
                    type="file"
                    accept="image/png,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onSymbolRefFile(f);
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => void generateSlotIcons()}
                disabled={symbolsGenning}
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {symbolsGenning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {symbolsGenning ? "Генерирую…" : `Сгенерировать ${symbolCount} иконок · ${SYMBOLS_PRICE}`}
              </button>
            </div>
            <p className="mt-1.5 ds-caption">
              ИИ рисует {symbolCount} уникальных иконок на одном холсте по теме — затем автоматически режем
              на отдельные символы. Заменит текущий список символов ниже.
            </p>
          </div>

          <p className="mb-2 ds-caption">
            Чисто визуальные — какой символ выпадет, не важно, любой считается выигрышем (см. «Бонусы по
            попыткам» ниже).
          </p>
          <div className="flex flex-col gap-2">
            {symbols.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                {s.imageUrl ? (
                  <div className="relative h-10 w-14 shrink-0">
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-10 w-14 rounded-md border border-border bg-black/10 object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setSymbol(i, { imageUrl: undefined })}
                      title="Убрать иконку, вернуть эмодзи"
                      aria-label="Убрать иконку, вернуть эмодзи"
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[9px] text-white"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    className={`${inputCls} h-10 w-16 shrink-0 text-center text-lg`}
                    value={s.symbol}
                    onChange={(e) => setSymbol(i, { symbol: e.target.value })}
                    placeholder="🍒"
                    maxLength={4}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeSymbol(i)}
                  aria-label="Удалить символ"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-[var(--status-error)]/50 hover:text-[var(--status-error)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 ds-caption">
            Эмодзи, короткий текст или сгенерированная ИИ иконка (сверху). Минимум 3 символа.
          </p>
        </div>

        {/* Bonus sequence — arbitrary length, one guaranteed-win bonus per attempt */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="ds-h4">Бонусы по попыткам</label>
            <button
              type="button"
              onClick={addAttempt}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-green transition hover:text-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить попытку
            </button>
          </div>
          <p className="mb-2 ds-caption">
            Каждая попытка — гарантированный выигрыш с указанным бонусом. После всех попыток, кроме
            последней, кнопка — «Крутить ещё»; после последней — «Забрать бонус» (ведёт по ссылке CTA
            ниже).
          </p>
          <div className="flex flex-col gap-2">
            {attempts.map((bonus, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <input
                  className={inputCls}
                  value={bonus}
                  onChange={(e) => setAttemptBonus(i, e.target.value)}
                  placeholder={
                    i === attempts.length - 1
                      ? "Финальный бонус (например, 100% на депозит)"
                      : "Бонус (например, 50 USD)"
                  }
                />
                <button
                  type="button"
                  onClick={() => removeAttempt(i)}
                  aria-label="Удалить попытку"
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
            <SuggestButton topic={topic} field="cta" mechanic="slot" onFill={setCtaText} />
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
            Куда ведёт кнопка после выигрыша. URL или переменная-макрос (напр. {"{clickurl}"}).
          </p>
        </Field>

        <button
          type="button"
          onClick={() =>
            downloadText(
              `${slugify(brand, "slot")}-slot.html`,
              buildSlotHtml({
                brand,
                brandLogo,
                headline,
                accent,
                dark,
                ctaText,
                ctaUrl,
                bgImage,
                symbols,
                attempts,
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

          {/* Characters — anchored to the VIEWPORT bottom (crop bleeds off the edge). */}
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
              {headline || "SPIN TO WIN!"}
            </h2>

            <div
              className={`relative mt-3 flex w-full flex-1 justify-center ${
                viewport === "portrait" ? "items-start pt-2" : "items-center"
              }`}
            >
              <div className="relative z-10 mx-auto flex h-full w-full max-w-[440px] items-center justify-center">
                <SlotMachine
                  symbols={symbols.map((s) => s.symbol)}
                  symbolImages={symbols.map((s) => s.imageUrl)}
                  forceWin
                  maxSpins={attempts.length}
                  accent={accent}
                  spinSignal={spinSignal}
                  onSpinsChange={(used) => {
                    attemptIndexRef.current = used;
                    setAttemptIndex(used);
                  }}
                  onResult={(_win, symbol, index) => {
                    // The round that JUST settled is attemptIndexRef.current - 1
                    // (onSpinsChange already incremented it when this spin
                    // STARTED, well before this onResult fires).
                    const idx = attemptIndexRef.current - 1;
                    setWon({
                      symbol,
                      imageUrl: index >= 0 ? symbols[index]?.imageUrl : undefined,
                      bonus: attempts[idx] || "",
                      isLast: idx >= attempts.length - 1,
                    });
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSpinSignal((s) => s + 1)}
              disabled={attemptIndex >= attempts.length}
              className="relative z-30 mb-1 mt-2 w-[82%] max-w-[380px] rounded-full py-3 text-center text-lg font-extrabold uppercase tracking-wide text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}
            >
              {attemptIndex >= attempts.length ? "Бонусы закончились" : ctaText || "SPIN"}
            </button>
            {attempts.length > 1 && attemptIndex > 0 && attemptIndex < attempts.length ? (
              <p className="relative z-30 -mt-0.5 text-center text-xs text-white/70 drop-shadow">
                Осталось попыток: {attempts.length - attemptIndex}
              </p>
            ) : null}
          </div>

          {/* Win modal — every spin is a guaranteed win; the bonus text and
              button come from how many spins have happened, not the symbol. */}
          {won !== null ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
              <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
                <p className="text-lg font-extrabold text-[#0f172a]">🎉 Джекпот!</p>
                {won.imageUrl ? (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    {[0, 1, 2].map((k) => (
                      <img key={k} src={won.imageUrl} alt="" className="h-11 w-11 object-contain" />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-3xl">
                    {won.symbol} {won.symbol} {won.symbol}
                  </p>
                )}
                <p className="mt-1 text-sm text-[#475569]">
                  {won.bonus ? (
                    <>
                      Вы выиграли{" "}
                      <span className="font-bold" style={{ color: accent }}>
                        {won.bonus}
                      </span>
                    </>
                  ) : (
                    "Три в ряд — забирайте бонус!"
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (won.isLast) {
                      claimBonus();
                    } else {
                      setWon(null);
                      setSpinSignal((s) => s + 1);
                    }
                  }}
                  className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {won.isLast ? "Забрать бонус" : "Крутить ещё"}
                </button>
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
          ) : null}
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
