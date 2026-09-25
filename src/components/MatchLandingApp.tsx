"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Monitor, Pipette, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { MatchCard } from "@/components/MatchCard";
import { SuggestButton } from "@/components/landing/SuggestButton";
import { useAuthGate } from "@/components/AuthGate";
import { CollapsibleSection } from "@/components/landing/CollapsibleSection";
import { AssetRunPanel } from "@/components/landing/AssetRunPanel";
import { BuildingOverlay } from "@/components/landing/BuildingOverlay";
import { analyzeSeedBanner } from "@/lib/landingSeed";
import { BannerReferenceField } from "@/components/landing/BannerReferenceField";
import { useAssetRun, type AssetStep } from "@/lib/useAssetRun";
import { FullscreenPreview } from "@/components/landing/FullscreenPreview";
import { bgPreset, characterPreset, removeBackground, trimTransparent } from "@/lib/landingCreative";
import { downloadText, slugify } from "@/lib/download";
import { buildMatchHtml } from "@/lib/matchExport";
import {
  clampInt,
  PRIZE_LABEL,
  SPORTS,
  type CountdownMode,
  type MatchPick,
  type MatchSport,
  type OddsFormat,
  type PrizeType,
} from "@/lib/matchLogic";
import { apiFetch } from "@/lib/api-client";
import { useGeneration } from "@/lib/generation-context";
import { imageCredits, CHARACTER_PRICE_CREDITS, TEAM_CREST_PRICE_CREDITS } from "@/lib/credit-estimate";

const BG_PRICE = imageCredits(1);
const CHAR_PRICE = CHARACTER_PRICE_CREDITS;
const CREST_PRICE = TEAM_CREST_PRICE_CREDITS;
const DRAFT_KEY = "dw_match_draft";
const DEFAULT_THEME =
  "ночной стадион под софитами: зелёный газон, размытые трибуны, лучи прожекторов, лёгкая дымка, тёмно-синяя база";
const DEFAULT_CHAR = "восторженный болельщик в шарфе и куртке клубных цветов, кулаки вверх, динамичная поза";

type Side = "home" | "away";

// «Матч-прогноз» builder. The landing advertises ONE match: teams, crests,
// odds, kick-off countdown, bonus offer. Nothing is played on the page —
// the odds buttons and the CTA all lead to the sportsbook (ctaUrl).
export function MatchLandingApp() {
  const gen = useGeneration();
  const { isGuest, openGate } = useAuthGate();
  const [brand, setBrand] = useState("LOGO");
  const [brandLogo, setBrandLogo] = useState("");
  const onLogoFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => setBrandLogo(String(r.result));
    r.readAsDataURL(f);
  };
  const [headline, setHeadline] = useState("СТАВЬ НА МАТЧ ДНЯ");
  const [topic, setTopic] = useState("");
  const [accent, setAccent] = useState("#38bdf8");
  const [ctaText, setCtaText] = useState("СДЕЛАТЬ СТАВКУ");
  const [ctaUrl, setCtaUrl] = useState("");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [bgImage, setBgImage] = useState("");
  const [chars, setChars] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [charPrompts, setCharPrompts] = useState<{ left: string; right: string }>({ left: DEFAULT_CHAR, right: "" });
  const [charGenning, setCharGenning] = useState<"left" | "right" | null>(null);

  // ── match ──
  const [sport, setSport] = useState<MatchSport>("football");
  const [eventName, setEventName] = useState("Финал кубка · Суббота 21:00");
  const [teams, setTeams] = useState<{ home: string; away: string }>({ home: "Нортбридж", away: "Харбор Сити" });
  const [crests, setCrests] = useState<{ home: string; away: string }>({ home: "", away: "" });
  const [crestTheme, setCrestTheme] = useState("");
  const [crestGenning, setCrestGenning] = useState<Side | null>(null);
  const [odds, setOdds] = useState<{ home: string; draw: string; away: string }>({ home: "1.85", draw: "3.40", away: "4.20" });
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>("decimal");
  const [highlightFavourite, setHighlightFavourite] = useState(true);
  const [showOffer, setShowOffer] = useState(true);
  const [prizeType, setPrizeType] = useState<PrizeType>("freebet");
  const [prizeAmount, setPrizeAmount] = useState("500");
  const [prizeCurrency, setPrizeCurrency] = useState("₽");
  const [offerText, setOfferText] = useState("за первую ставку на этот матч");
  const [countdownMode, setCountdownMode] = useState<CountdownMode>("minutes");
  const [countdownMinutes, setCountdownMinutes] = useState(15);
  const [countdownDate, setCountdownDate] = useState("");

  const [viewport, setViewport] = useState<"desktop" | "portrait" | "landscape">("desktop");
  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [bannerRef, setBannerRef] = useState("");
  const [restored, setRestored] = useState(false);

  const oddsNum = {
    home: Math.max(1.01, parseFloat(odds.home.replace(",", ".")) || 1.01),
    draw: Math.max(1.01, parseFloat(odds.draw.replace(",", ".")) || 1.01),
    away: Math.max(1.01, parseFloat(odds.away.replace(",", ".")) || 1.01),
  };

  // Mount-time hydration — exactly once (StrictMode double-invokes effects).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const str = (k: string, set: (v: string) => void) => {
          if (typeof d[k] === "string") set(d[k] as string);
        };
        str("brand", setBrand);
        str("brandLogo", setBrandLogo);
        str("headline", setHeadline);
        str("topic", setTopic);
        str("accent", setAccent);
        str("ctaText", setCtaText);
        str("ctaUrl", setCtaUrl);
        str("theme", setTheme);
        str("bgImage", setBgImage);
        str("eventName", setEventName);
        str("crestTheme", setCrestTheme);
        str("prizeAmount", setPrizeAmount);
        str("prizeCurrency", setPrizeCurrency);
        str("offerText", setOfferText);
        str("countdownDate", setCountdownDate);
        if (typeof d.sport === "string" && SPORTS.some((s) => s.id === d.sport)) setSport(d.sport as MatchSport);
        if (typeof d.teamHome === "string" || typeof d.teamAway === "string") {
          setTeams((t) => ({
            home: typeof d.teamHome === "string" ? d.teamHome : t.home,
            away: typeof d.teamAway === "string" ? d.teamAway : t.away,
          }));
        }
        if (typeof d.crestHome === "string" || typeof d.crestAway === "string") {
          setCrests({
            home: typeof d.crestHome === "string" ? d.crestHome : "",
            away: typeof d.crestAway === "string" ? d.crestAway : "",
          });
        }
        if (d.odds && typeof d.odds === "object") {
          const o = d.odds as Record<string, unknown>;
          setOdds((p) => ({
            home: typeof o.home === "string" ? o.home : p.home,
            draw: typeof o.draw === "string" ? o.draw : p.draw,
            away: typeof o.away === "string" ? o.away : p.away,
          }));
        }
        if (["decimal", "american", "fractional"].includes(String(d.oddsFormat))) setOddsFormat(d.oddsFormat as OddsFormat);
        if (typeof d.highlightFavourite === "boolean") setHighlightFavourite(d.highlightFavourite);
        if (typeof d.showOffer === "boolean") setShowOffer(d.showOffer);
        if (["freebet", "deposit", "cashback"].includes(String(d.prizeType))) setPrizeType(d.prizeType as PrizeType);
        if (["off", "minutes", "date"].includes(String(d.countdownMode))) setCountdownMode(d.countdownMode as CountdownMode);
        if (typeof d.countdownMinutes === "number") setCountdownMinutes(clampInt(d.countdownMinutes, 1, 100000, 15));
        const cl = typeof d.charLeft === "string" ? d.charLeft : "";
        const cr = typeof d.charRight === "string" ? d.charRight : "";
        if (cl || cr) setChars({ left: cl, right: cr });
        if (typeof d.charPromptLeft === "string" || typeof d.charPromptRight === "string") {
          setCharPrompts((p) => ({
            left: typeof d.charPromptLeft === "string" ? d.charPromptLeft : p.left,
            right: typeof d.charPromptRight === "string" ? d.charPromptRight : p.right,
          }));
        }
      }
    } catch {
      /* ignore */
    }

    // Banner → landing handoff (same contract as the wheel/slot/crash builders).
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
      setBrand(typeof s.brand_name === "string" && s.brand_name ? s.brand_name : "LOGO");
      setBrandLogo(typeof s.brand_logo === "string" && s.brand_logo.startsWith("data:") ? s.brand_logo : "");
      setAccent(typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent) ? s.accent : "#38bdf8");
      const head = (typeof s.banner_text === "string" && s.banner_text) || (typeof s.subject === "string" ? s.subject : "");
      if (head) setHeadline(String(head).toUpperCase());
      if (typeof s.cta === "string" && s.cta) setCtaText(s.cta);
      if (typeof s.subject === "string" && s.subject) setTopic(s.subject);
      const bannerImg = gen.imageUrl || "";
      if (bannerImg) {
        setBgImage(bannerImg);
        setBannerRef(bannerImg);
      }
      // AUTHORITATIVE и для самой картинки персонажа: восстановленный черновик
      // мог оставить персонажа от прошлого баннера. Если на этом баннере
      // человек есть, шаг сборки вернёт картинку через несколько секунд.
      setChars((c) => ({ ...c, left: "" }));
      window.localStorage.removeItem("dw:landingSeed");

      // Разбор баннера — первый шаг сборки, а не ожидание на прошлом экране.
      // Тексты, акцент и промпты перекрываем только тем, что модель реально
      // вернула: пустой ответ не должен затирать данные из баннер-генератора.
      void (async () => {
        setSeedAnalyzing(true);
        const a = s.needs_analysis ? await analyzeSeedBanner(bannerImg, "crash") : null;
        setSeedAnalyzing(false);
        if (a?.headline) setHeadline(a.headline.toUpperCase());
        if (a?.cta) setCtaText(a.cta);
        if (a?.accent) setAccent(a.accent);

        const bannerHasCharacter = a
          ? a.hasPerson
          : typeof s.character_prompt === "string" && s.character_prompt.length > 0;
        const bgPrompt =
          a?.bgPrompt ||
          (typeof s.background_prompt === "string" && s.background_prompt
            ? s.background_prompt
            : DEFAULT_THEME);
        const charPrompt =
          a?.charPrompt ||
          (typeof s.character_prompt === "string" && s.character_prompt
            ? s.character_prompt
            : DEFAULT_CHAR);
        setTheme(bgPrompt);
        setCharPrompts((p) => ({ ...p, left: charPrompt }));

        await assetRun.start([
        {
          id: "bg",
          label: "Фон лендинга",
          credits: BG_PRICE,
          blocking: true,
          run: () => generateBg(bgPrompt, bannerImg || undefined),
        },
        ...(bannerHasCharacter
          ? [
              {
                id: "char-left",
                label: "Персонаж слева",
                credits: CHAR_PRICE,
                run: () => generateCharacter("left", charPrompt, bannerImg || undefined),
              },
            ]
          : []),
        ...(["home", "away"] as const)
          .filter((side) => teams[side].trim())
          .map((side) => ({
            id: `crest-${side}`,
            label: `Эмблема: ${teams[side].trim()}`,
            credits: CREST_PRICE,
            run: () => generateCrest(side),
          })),
        ]);
      })();
      toast.success("Данные баннера перенесены — собираем лендинг…");
    } catch {
      /* ignore */
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      const data = {
        brand, brandLogo, headline, topic, accent, ctaText, ctaUrl, theme, bgImage,
        charLeft: chars.left, charRight: chars.right, charPromptLeft: charPrompts.left, charPromptRight: charPrompts.right,
        sport, eventName, teamHome: teams.home, teamAway: teams.away, crestHome: crests.home, crestAway: crests.away, crestTheme,
        odds, oddsFormat, highlightFavourite, showOffer, prizeType, prizeAmount, prizeCurrency, offerText,
        countdownMode, countdownMinutes, countdownDate,
      };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch {
        try {
          window.localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ ...data, bgImage: "", charLeft: "", charRight: "", brandLogo: "", crestHome: "", crestAway: "" }),
          );
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [
    restored, brand, brandLogo, headline, topic, accent, ctaText, ctaUrl, theme, bgImage, chars, charPrompts,
    sport, eventName, teams, crests, crestTheme, odds, oddsFormat, highlightFavourite, showOffer,
    prizeType, prizeAmount, prizeCurrency, offerText, countdownMode, countdownMinutes, countdownDate,
  ]);

  // Same ctaUrl / {macro} handling as the other builders: a tracker macro
  // shows an info toast, a real URL opens in a new tab (never navigating the
  // builder away). The chosen outcome is appended as ?pick=… like the export.
  const goToOffer = (pick?: MatchPick) => {
    const url = ctaUrl.trim();
    if (!url) {
      toast.info("Укажите ссылку перехода (CTA) — на лендинге все кнопки ведут туда");
      return;
    }
    if (/[{}]/.test(url)) {
      toast.info("Это переменная-макрос — трафик-система подставит ссылку на реальном лендинге");
      return;
    }
    try {
      const u = new URL(url, window.location.origin);
      if (pick) u.searchParams.set("pick", pick);
      window.open(u.toString(), "_blank", "noopener,noreferrer");
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
    return data.imageUrl as string;
  };

  // Возвращают успех: пакетной сборке нужно знать, какой шаг не удался.
  const generateBg = async (themeOverride?: string, refOverride?: string): Promise<boolean> => {
    if (isGuest) {
      openGate();
      return false;
    }
    const useTheme = themeOverride ?? theme;
    const ref = refOverride ?? bannerRef;
    setGenning(true);
    setGenError("");
    try {
      setBgImage(
        await genImage({ presetTemplate: bgPreset(useTheme), feature: "landing-bg", ...(ref ? { styleReferenceImage: ref } : {}) }),
      );
      return true;
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
      return false;
    } finally {
      setGenning(false);
    }
  };

  const generateCharacter = async (
    side: "left" | "right",
    promptOverride?: string,
    refOverride?: string,
  ): Promise<boolean> => {
    if (isGuest) {
      openGate();
      return false;
    }
    const prompt = (promptOverride ?? charPrompts[side]).trim();
    if (!prompt) return false;
    const ref = refOverride ?? bannerRef;
    setCharGenning(side);
    setGenError("");
    try {
      const res = await apiFetch("/api/generate-character", {
        method: "POST",
        json: { prompt: characterPreset(prompt), ...(ref ? { reference_image: ref } : {}) },
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        const trimmed = await trimTransparent(data.imageUrl);
        setChars((c) => ({ ...c, [side]: trimmed }));
        return true;
      }
      throw new Error([data?.error, data?.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать");
    } catch {
      try {
        const raw = await genImage({ presetTemplate: characterPreset(prompt), aspectRatio: "3:4", feature: "landing-character" });
        const cut = await removeBackground(raw);
        setChars((c) => ({ ...c, [side]: cut }));
        return true;
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Ошибка запроса");
        return false;
      }
    } finally {
      setCharGenning(null);
    }
  };

  const generateCrest = async (side: Side): Promise<boolean> => {
    if (isGuest) {
      openGate();
      return false;
    }
    const team = teams[side].trim();
    if (!team) {
      toast.error("Сначала введите название команды");
      return false;
    }
    setCrestGenning(side);
    setGenError("");
    try {
      const res = await apiFetch("/api/generate-team-crest", {
        method: "POST",
        json: { team, sport, theme: crestTheme || topic, ...(bannerRef ? { reference_image: bannerRef } : {}) },
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать");
      }
      const trimmed = await trimTransparent(data.imageUrl);
      setCrests((c) => ({ ...c, [side]: trimmed }));
      toast.success(`Эмблема «${team}» сгенерирована`);
      return true;
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
      return false;
    } finally {
      setCrestGenning(null);
    }
  };

  const applyTeams = (text: string) => {
    const m = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(text.trim());
    if (m) setTeams({ home: m[1].trim(), away: m[2].trim() });
    else setTeams((t) => ({ ...t, home: text.trim() }));
  };

  /**
   * Пакетная сборка: фон первым и в одиночку, остальное следом парами.
   * Шаг без исходных данных (пустое описание персонажа, не введённая команда)
   * пропускаем — генерировать «что-нибудь» значит списать кредиты за картинку,
   * которую всё равно выбросят.
   */
  const assetRun = useAssetRun();
  const [seedAnalyzing, setSeedAnalyzing] = useState(false);

  /**
   * Загруженный клиентом баннер: разбираем его так же, как свой, и оставляем
   * стилевым референсом — дальше фон и персонаж рисуются от него (i2i).
   * Генерацию не запускаем: она платная, а загрузка файла — ещё не согласие
   * потратить кредиты.
   */
  const onBannerRefPick = (dataUrl: string) => {
    setBannerRef(dataUrl);
    if (!bgImage) setBgImage(dataUrl);
    void (async () => {
      setSeedAnalyzing(true);
      const a = await analyzeSeedBanner(dataUrl, "crash");
      setSeedAnalyzing(false);
      if (!a) {
        toast.error("Не удалось разобрать баннер — поля оставили как есть");
        return;
      }
      if (a.headline) setHeadline(a.headline.toUpperCase());
      if (a.cta) setCtaText(a.cta);
      if (a.accent) setAccent(a.accent);
      if (a.bgPrompt) setTheme(a.bgPrompt);
      if (a.charPrompt) setCharPrompts((p) => ({ ...p, left: a.charPrompt as string }));
      toast.success("Баннер разобран — поля заполнены, можно генерировать ассеты");
    })();
  };
  const assetSteps = (): AssetStep[] => {
    const steps: AssetStep[] = [
      { id: "bg", label: "Фон лендинга", credits: BG_PRICE, blocking: true, run: () => generateBg() },
    ];
    for (const side of ["left", "right"] as const) {
      if (!charPrompts[side].trim()) continue;
      steps.push({
        id: `char-${side}`,
        label: side === "left" ? "Персонаж слева" : "Персонаж справа",
        credits: CHAR_PRICE,
        run: () => generateCharacter(side),
      });
    }
    for (const side of ["home", "away"] as const) {
      if (!teams[side].trim()) continue;
      steps.push({
        id: `crest-${side}`,
        label: `Эмблема: ${teams[side].trim()}`,
        credits: CREST_PRICE,
        run: () => generateCrest(side),
      });
    }
    return steps;
  };
  const assetCredits = assetSteps().reduce((sum, s) => sum + s.credits, 0);

  const inputCls = "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
  const sportMeta = SPORTS.find((s) => s.id === sport) ?? SPORTS[0];
  const prizeTitle = `${PRIZE_LABEL[prizeType]} ${prizeAmount} ${prizeCurrency}`.trim();

  const renderCharSlot = (side: "left" | "right", title: string) => (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {chars[side] ? (
          <button type="button" onClick={() => setChars((c) => ({ ...c, [side]: "" }))} className="text-[11px] text-muted-foreground transition hover:text-foreground">
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
          placeholder="Опишите персонажа / болельщика"
        />
        <SuggestButton topic={topic} field="character" mechanic="match" onFill={(t) => setCharPrompts((p) => ({ ...p, [side]: t }))} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => generateCharacter(side)}
          disabled={charGenning !== null || !charPrompts[side].trim()}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {charGenning === side ? "Генерирую…" : `${chars[side] ? "Заменить" : "Генерация"} · ${CHAR_PRICE}`}
        </button>
        {chars[side] ? <img src={chars[side]} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border bg-white/5 object-contain" /> : null}
      </div>
    </div>
  );

  const renderTeam = (side: Side, title: string) => (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {crests[side] ? (
          <button type="button" onClick={() => setCrests((c) => ({ ...c, [side]: "" }))} className="text-[11px] text-muted-foreground transition hover:text-foreground">
            Убрать эмблему
          </button>
        ) : null}
      </div>
      <input className={`${inputCls} text-xs`} value={teams[side]} onChange={(e) => setTeams((t) => ({ ...t, [side]: e.target.value }))} placeholder="Название команды" />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void generateCrest(side)}
          disabled={crestGenning !== null || !teams[side].trim()}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {crestGenning === side ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {crestGenning === side ? "Генерирую…" : `${crests[side] ? "Заменить" : "Эмблема"} · ${CREST_PRICE}`}
        </button>
        {crests[side] ? <img src={crests[side]} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border bg-black/10 object-contain" /> : null}
      </div>
    </div>
  );

  const segmented = <T extends string>(value: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="flex rounded-lg border border-border p-0.5">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={value === v}
          className={`flex min-h-9 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
            value === v ? "bg-[var(--lime-tint)] text-accent-green" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const toggle = (checked: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
    </label>
  );

  const exportHtml = () =>
    downloadText(
      `${slugify(brand, "match")}-match.html`,
      buildMatchHtml({
        brand, brandLogo, headline, accent, ctaText, ctaUrl, bgImage,
        charLeft: chars.left, charRight: chars.right,
        sport, eventName, teamHome: teams.home, teamAway: teams.away, crestHome: crests.home, crestAway: crests.away,
        odds: oddsNum, oddsFormat, highlightFavourite,
        showOffer, prizeType, prizeAmount, prizeCurrency, offerText,
        countdownMode, countdownMinutes, countdownDate,
      }),
    );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,400px)_1fr]">
      <div className="flex flex-col gap-4">
        <header>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href="/landing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> К шаблонам лендингов
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Сбросить все настройки лендинга к значениям по умолчанию?")) return;
                try {
                  window.localStorage.removeItem(DRAFT_KEY);
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-border/80 hover:text-foreground"
            >
              Сбросить по умолчанию
            </button>
          </div>
          <p className="ds-overline text-accent-green">Лендинг · Betting</p>
          <h1 className="ds-h1 mt-1">Матч-прогноз</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Лендинг под конкретный матч: команды, коэффициенты, таймер до начала и оффер. Ставка не делается на странице — коэффициенты и кнопка ведут на букмекера.
          </p>
        </header>

        <div>
          <label className="mb-2 block ds-h4">
            Тематика <span className="text-accent-green">*</span>
          </label>
          <textarea
            data-tour="landing-topic"
            className={`${inputCls} min-h-[64px] resize-y py-2`}
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Что хотите на лендинге: вид спорта, оффер, визуал…"
          />
          <p className="mt-1.5 ds-caption">Обязательно. По тематике ИИ подбирает тексты, команды и промпты — жмите ✨ у полей.</p>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <label className="ds-h4">Цветовая гамма</label>
            <Pipette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#38bdf8"}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Акцентный цвет"
            className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-elevated p-0 [&::-moz-color-swatch]:rounded-[6px] [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[6px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:rounded-[6px] [&::-webkit-color-swatch-wrapper]:p-0"
          />
        </div>

        <Field label="Заголовок">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
            <SuggestButton topic={topic} field="headline" mechanic="match" onFill={setHeadline} />
          </div>
        </Field>
        <Field label="Бренд">
          {brandLogo ? (
            <div className="flex h-11 items-center gap-2">
              <img src={brandLogo} alt="" className="h-9 w-auto max-w-[140px] rounded bg-white/5 object-contain p-1" />
              <button type="button" onClick={() => setBrandLogo("")} className="text-xs text-muted-foreground transition hover:text-foreground">
                Убрать лого
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Название или загрузите лого" />
              <label className="flex h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground">
                PNG
                <input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f); }} />
              </label>
            </div>
          )}
        </Field>

        <CollapsibleSection title="Матч" tone="accent">
          <Field label="Вид спорта">
            <select className={`${inputCls} appearance-none`} value={sport} onChange={(e) => setSport(e.target.value as MatchSport)}>
              {SPORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 ds-caption">{sportMeta.hasDraw ? "Три исхода: П1 / Ничья / П2." : "Два исхода: П1 / П2 — ничьей нет."}</p>
          </Field>
          <Field label="Турнир / дата (строка над карточкой)">
            <input className={inputCls} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Финал кубка · Суббота 21:00" />
          </Field>
          <div className="mt-3 flex items-center justify-between">
            <span className="ds-h4">Команды</span>
            <div className="flex items-center gap-1.5">
              <span className="ds-caption">Придумать пару</span>
              <SuggestButton topic={topic} field="teams" mechanic="match" onFill={applyTeams} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {renderTeam("home", "Хозяева (П1)")}
            {renderTeam("away", "Гости (П2)")}
          </div>
          <Field label="Стиль эмблем">
            <div className="flex items-start gap-2">
              <textarea
                className={`${inputCls} min-h-[52px] resize-y py-2 text-xs`}
                rows={2}
                value={crestTheme}
                onChange={(e) => setCrestTheme(e.target.value)}
                placeholder={topic ? `По умолчанию — тематика лендинга: «${topic}»` : "Напр.: геральдический щит, эмаль и золото, сине-белые цвета"}
              />
              <SuggestButton topic={topic} field="icon" mechanic="match" onFill={setCrestTheme} />
            </div>
            <p className="mt-1 ds-caption">Без генерации на карточке показываются кружки с инициалами команд.</p>
          </Field>
        </CollapsibleSection>

        <CollapsibleSection title="Коэффициенты" tone="accent">
          <div className={`grid gap-2 ${sportMeta.hasDraw ? "grid-cols-3" : "grid-cols-2"}`}>
            {(sportMeta.hasDraw ? (["home", "draw", "away"] as const) : (["home", "away"] as const)).map((k) => (
              <div key={k}>
                <span className="mb-1 block ds-caption">{k === "home" ? "П1" : k === "draw" ? "Ничья" : "П2"}</span>
                <input className={`${inputCls} tabular-nums`} inputMode="decimal" value={odds[k]} onChange={(e) => setOdds((o) => ({ ...o, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <span className="mb-1 block ds-caption">Формат отображения</span>
            {segmented<OddsFormat>(oddsFormat, setOddsFormat, [
              ["decimal", "1.85"],
              ["american", "-118"],
              ["fractional", "17/20"],
            ])}
          </div>
          <div className="mt-3">{toggle(highlightFavourite, setHighlightFavourite, "Подсветить фаворита (наименьший кэф)")}</div>
          <p className="mt-2 ds-caption">Клик по коэффициенту ведёт на ссылку CTA с параметром ?pick=home|draw|away — букмекер или трекер могут предвыбрать исход.</p>
        </CollapsibleSection>

        <CollapsibleSection title="Оффер" tone="accent">
          {toggle(showOffer, setShowOffer, "Показывать плашку оффера под карточкой")}
          {showOffer ? (
            <>
              <div className="mt-3">
                {segmented<PrizeType>(prizeType, setPrizeType, [
                  ["freebet", "Фрибет"],
                  ["deposit", "Бонус на депозит"],
                  ["cashback", "Кэшбек"],
                ])}
              </div>
              <div className="mt-3 grid grid-cols-[1fr_88px] gap-2">
                <div>
                  <span className="mb-1 block ds-caption">Сумма</span>
                  <input className={`${inputCls} tabular-nums`} value={prizeAmount} onChange={(e) => setPrizeAmount(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <span className="mb-1 block ds-caption">Валюта</span>
                  <input className={inputCls} value={prizeCurrency} onChange={(e) => setPrizeCurrency(e.target.value)} placeholder="₽" />
                </div>
              </div>
              <Field label="Условие / подпись">
                <input className={inputCls} value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="за первую ставку на этот матч" />
              </Field>
            </>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Обратный отсчёт" hint="Срочность: таймер до матча">
          {segmented<CountdownMode>(countdownMode, setCountdownMode, [
            ["off", "Выкл"],
            ["minutes", "N минут с открытия"],
            ["date", "До даты"],
          ])}
          {countdownMode === "minutes" ? (
            <div className="mt-3">
              <span className="mb-1 block ds-caption">Минут до «матча»</span>
              <input type="number" min={1} className={inputCls} value={countdownMinutes} onChange={(e) => setCountdownMinutes(clampInt(e.target.value, 1, 100000, 15))} />
            </div>
          ) : null}
          {countdownMode === "date" ? (
            <div className="mt-3">
              <span className="mb-1 block ds-caption">Дата и время матча</span>
              <input type="datetime-local" className={inputCls} value={countdownDate} onChange={(e) => setCountdownDate(e.target.value)} />
            </div>
          ) : null}
          <p className="mt-2 ds-caption">На нуле таймер переключается в «LIVE».</p>
        </CollapsibleSection>

        <BannerReferenceField
          value={bannerRef}
          analyzing={seedAnalyzing}
          onPick={onBannerRefPick}
          onClear={() => setBannerRef("")}
        />

        <AssetRunPanel
          steps={assetRun.steps}
          running={assetRun.running}
          notEnough={assetRun.notEnough}
          credits={assetCredits}
          onStart={() => {
            if (isGuest) {
              openGate();
              return;
            }
            void assetRun.start(assetSteps());
          }}
          onCancel={assetRun.cancel}
        />

        <CollapsibleSection title="Фон" tone="accent">
          <Field label="Сцена (для фона)">
            <div className="flex items-start gap-2">
              <textarea className={`${inputCls} min-h-[70px] resize-y py-2`} rows={2} value={theme} onChange={(e) => setTheme(e.target.value)} />
              <SuggestButton topic={topic} field="bg" mechanic="match" onFill={setTheme} />
            </div>
          </Field>
          <button
            type="button"
            onClick={() => void generateBg()}
            disabled={genning}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {genning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genning ? "Генерирую фон…" : `${bgImage ? "Перегенерировать фон" : "Сгенерировать фон"} · ${BG_PRICE}`}
          </button>
          {bgImage ? (
            <button type="button" onClick={() => setBgImage("")} className="mt-2 text-xs text-muted-foreground transition hover:text-foreground">
              Убрать фон
            </button>
          ) : null}
          {genError ? <p className="mt-2 text-xs text-[color:var(--status-error)]">{genError}</p> : null}
        </CollapsibleSection>

        <CollapsibleSection title="Персонажи" hint="Опционально, болельщики по бокам">
          <div className="grid grid-cols-2 gap-2">
            {renderCharSlot("left", "Слева")}
            {renderCharSlot("right", "Справа")}
          </div>
        </CollapsibleSection>

        <Field label="Кнопка">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
            <SuggestButton topic={topic} field="cta" mechanic="match" onFill={setCtaText} />
          </div>
        </Field>
        <Field label="Ссылка перехода (CTA)">
          <input className={inputCls} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://your-offer.com или {clickurl}" />
          <p className="mt-1 ds-caption">Куда ведут кнопка и коэффициенты. URL или переменная-макрос (напр. {"{clickurl}"}).</p>
        </Field>

        <button
          data-tour="landing-export"
          type="button"
          onClick={exportHtml}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          <Download className="h-4 w-4" /> Скачать HTML
        </button>
      </div>

      <div className="lg:sticky lg:top-6 lg:h-fit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="ds-caption">Предпросмотр лендинга</p>
            <FullscreenPreview title="Матч-прогноз" buildHtml={() => buildMatchHtml({ brand, brandLogo, headline, accent, ctaText, ctaUrl, bgImage, charLeft: chars.left, charRight: chars.right, sport, eventName, teamHome: teams.home, teamAway: teams.away, crestHome: crests.home, crestAway: crests.away, odds: oddsNum, oddsFormat, highlightFavourite, showOffer, prizeType, prizeAmount, prizeCurrency, offerText, countdownMode, countdownMinutes, countdownDate })} />
          </div>
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
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${viewport === v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className={`h-4 w-4 ${rot}`} />
              </button>
            ))}
          </div>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-2xl border border-border ${
            viewport === "portrait" ? "mx-auto aspect-[9/16] max-w-[300px]" : viewport === "landscape" ? "aspect-[16/9]" : "aspect-[16/11]"
          }`}
          style={{ background: "#071022" }}
        >
          {assetRun.running || seedAnalyzing ? (
            <BuildingOverlay
              steps={
                assetRun.steps.length > 0
                  ? assetRun.steps
                  : [{ id: "seed", label: "Разбираем баннер", status: "running" as const }]
              }
            />
          ) : null}
          {bgImage ? (
            <img src={bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), #071022` }} />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/50" />

          {(["left", "right"] as const).map((side) =>
            chars[side] ? (
              <img
                key={side}
                src={chars[side]}
                alt=""
                className={`pointer-events-none absolute z-20 object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)] ${viewport === "portrait" ? "h-[84%] max-w-[56%]" : "h-full max-w-[46%]"}`}
                style={{ [side]: viewport === "portrait" ? "-1%" : "-4%", bottom: viewport === "portrait" ? "-7%" : "-9%" }}
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
            </div>
            <h2
              className="mt-1 text-center text-xl font-extrabold uppercase leading-none tracking-tight sm:text-2xl"
              style={{ color: "#fff", textShadow: `0 2px 0 ${accent}, 0 4px 10px rgba(0,0,0,.5)` }}
            >
              {headline || "СТАВЬ НА МАТЧ ДНЯ"}
            </h2>
            {countdownMode !== "off" ? (
              <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
                {countdownMode === "minutes" ? `До матча: 00:${String(countdownMinutes).padStart(2, "0")}:00` : "До матча: 02д 14:30:00"}
              </span>
            ) : null}

            <div className={`relative mt-3 flex w-full flex-1 flex-col items-center justify-center gap-3 ${viewport === "portrait" ? "justify-start pt-1" : ""}`}>
              <MatchCard
                accent={accent}
                sport={sport}
                eventName={eventName}
                teamHome={teams.home}
                teamAway={teams.away}
                crestHome={crests.home || undefined}
                crestAway={crests.away || undefined}
                odds={oddsNum}
                oddsFormat={oddsFormat}
                highlightFavourite={highlightFavourite}
                onPick={goToOffer}
              />
              {showOffer ? (
                <div
                  className="flex w-full max-w-[420px] items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
                  style={{ borderColor: `${accent}66`, background: `linear-gradient(90deg, ${accent}33, rgba(255,255,255,.06))` }}
                >
                  <span className="whitespace-nowrap text-lg font-black" style={{ color: accent, textShadow: `0 0 10px ${accent}66` }}>
                    {prizeTitle}
                  </span>
                  <span className="text-xs leading-tight text-white/85">{offerText || "за первую ставку на этот матч"}</span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => goToOffer()}
              className="relative z-30 mb-1 mt-2 w-[82%] max-w-[380px] rounded-full py-3 text-center text-base font-extrabold uppercase tracking-wide text-white shadow-lg transition active:scale-95"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}
            >
              {ctaText || "СДЕЛАТЬ СТАВКУ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <label className="mb-2 block ds-h4">{label}</label>
      {children}
    </div>
  );
}
