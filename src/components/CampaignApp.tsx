"use client";

// Кампания: один бриф — лендинг, плейбл, письмо и баннер в одном стиле.
// Слева бриф: референс (с него цвета, фон и тексты), язык, оффер, механики;
// справа превью каждой части (собираются в браузере). «Скачать всё» — ZIP
// с готовыми файлами, «Открыть в редакторе» — черновик нужного редактора
// с брифом внутри, чтобы довести руками и ИИ-графикой в стиле рефа.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dices, Download, ExternalLink, ImageIcon, Loader2, Mail, Megaphone, MonitorSmartphone, Gamepad2, Pipette, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { BrandLookup } from "@/components/BrandLookup";
import { lookupBrand } from "@/lib/brandLookup";
import { looksLikeUrl, nameFromHost } from "@/lib/brandExtract";
import { useAuthGate } from "@/components/AuthGate";
import { AssetRunPanel } from "@/components/landing/AssetRunPanel";
import { useExtrasAssets } from "@/components/landing/useExtrasAssets";
import { idbGet, idbSet } from "@/lib/idbStore";
import { prepareScenePart, sceneAiStyle, scenePartRequest } from "@/lib/scenes/assets";
import { useAssetRun, type AssetStep } from "@/lib/useAssetRun";
import { bannerRequestBody, generateImage, type GeneratePayload } from "@/lib/imageGen";
import { BANNER_PRICE_CREDITS, EMAIL_HERO_PRICE_CREDITS } from "@/lib/credit-estimate";
import { browserLoader } from "@/lib/scenes/build";
import { SCENES, scenePartsFor } from "@/lib/scenes/presets";
import { buildEmailHtml } from "@/lib/emailExport";
import { persistDraft } from "@/lib/emailDraftsStore";
import { shrinkPng } from "@/lib/imageCompress";
import { apiFetch } from "@/lib/api-client";
import { sourceHash, type CampaignI18n } from "@/lib/campaignI18n";
import { EU_LANGS, isBuiltInLang } from "@/lib/euLangs";
import type { CampaignTzPlan } from "@/lib/campaignTz";
import { EMAIL_TEMPLATES } from "@/lib/emailTemplates";
import { paletteFromImage } from "@/lib/imagePalette";
import type { LandingKind } from "@/lib/landingKit";
import { isSectionEnabled } from "@/lib/mvp";
import { forgetProject } from "@/lib/projects";
import {
  briefAccent,
  briefBanner,
  briefDefaults,
  briefEditorDraft,
  briefExtras,
  briefEmail,
  briefHeadline,
  briefLandingHtml,
  briefPlayableHtml,
  briefSource,
  defaultBrief,
  LUCKY_SCENES,
  luckyBannerPayload,
  luckyRoll,
  briefParts,
  CAMPAIGN_PARTS,
  type CampaignArt,
  type CampaignBrief,
  type LuckyRoll,
  type CampaignLanding,
} from "@/lib/campaign";

const KEY = "dw_campaign_brief";
const ART_KEY = "campaign_art";
const INPUT = "h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
const CHIP_ON = "border-accent-green bg-accent-green/10 text-accent-green";
const CHIP_OFF = "border-border text-foreground/70 hover:bg-white/5";

type Tab = "landing" | "playable" | "email" | "banner";

const LANDING_OPTIONS: Record<LandingKind, { id: CampaignLanding; label: string }[]> = {
  casino: [
    { id: "wheel", label: "Колесо" },
    { id: "slot", label: "Слот" },
    { id: "crash", label: "Crash" },
    { id: "scene", label: "Сцена плейбла" },
  ],
  sport: [
    { id: "match", label: "Матч" },
    { id: "scene", label: "Сцена плейбла" },
  ],
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("read")));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

/** Реф для хранения — сторона до 1024, как есть по пропорциям. */
async function shrinkRef(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image"));
    i.src = src;
  });
  const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL("image/webp", 0.86);
  return out.startsWith("data:image/webp") ? out : c.toDataURL("image/jpeg", 0.86);
}

const trKey = (lang: string, hash: string) => `dw_campaign_tr:${lang}:${hash}`;

function loadBrief(): CampaignBrief {
  try {
    const raw = window.localStorage.getItem(KEY);
    // старые брифы с темой: тему просто не читаем, язык — любой из списка
    if (raw) {
      const p = { ...defaultBrief(), ...(JSON.parse(raw) as Partial<CampaignBrief>) };
      return EU_LANGS.some((l) => l.id === p.lang) ? p : { ...p, lang: "ru" };
    }
  } catch {
    /* хранилище недоступно */
  }
  return defaultBrief();
}

export function CampaignApp() {
  const router = useRouter();
  const { isGuest, openGate } = useAuthGate();
  const [b, setB] = useState<CampaignBrief>(defaultBrief);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("landing");
  const [landingHtml, setLandingHtml] = useState("");
  const [playableHtml, setPlayableHtml] = useState("");
  const [zipping, setZipping] = useState(false);
  /** Перевод для языка без готовых текстов (и письма — для всех, кроме русского). */
  const [i18n, setI18n] = useState<CampaignI18n>({});
  const [translating, setTranslating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasEyeDropper, setHasEyeDropper] = useState(false);
  /** Графика «Мне повезёт» — в IndexedDB: несколько мегабайт картинок в localStorage не влезают. */
  const [art, setArt] = useState<CampaignArt | null>(null);
  const [artLoaded, setArtLoaded] = useState(false);
  const full = useMemo(() => ({ ...b, i18n, art }), [b, i18n, art]);
  const logoInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  useEffect(() => setHasEyeDropper(typeof window !== "undefined" && "EyeDropper" in window), []);

  const showPlayable = isSectionEnabled("playable");
  /** Что делаем в этой кампании (галочки); плейбл — ещё и если раздел открыт. */
  const parts = briefParts(b);
  const doPlayable = parts.playable && showPlayable;
  /** Письмо — всегда часть кампании; открыть его в редакторе — только где раздел писем открыт. */
  const emailEditor = isSectionEnabled("email");
  const set = <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => setB((p) => ({ ...p, [k]: v }));
  const latestB = useRef(b);
  latestB.current = b;

  useEffect(() => {
    setB(loadBrief());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...b, logo: "", ref: "" }));
      } catch {
        /* без сохранения */
      }
    }
  }, [b, ready]);

  useEffect(() => {
    void idbGet<CampaignArt>(ART_KEY).then((a) => {
      if (a && typeof a === "object" && a.scene) setArt(a);
      setArtLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (artLoaded) void idbSet(ART_KEY, art ?? undefined);
  }, [art, artLoaded]);

  // ---- «Мне повезёт»: случайная тема (или с рефа) и сцена → вся графика от ИИ одной кнопкой
  // ---- ТЗ: файл (.txt, .docx, .pdf) или текст → поля брифа кампании
  const [topicMode, setTopicMode] = useState<"topic" | "tz">("topic");
  const [tzText, setTzText] = useState("");
  const [tzBusy, setTzBusy] = useState(false);
  const [tzFilled, setTzFilled] = useState<string[]>([]);
  const tzFile = useRef<HTMLInputElement>(null);
  const TZ_LABELS: Record<string, string> = {
    topic: "тематика", brand: "бренд", site: "бренд и лого с сайта", kind: "тип трафика", lang: "язык", offer: "оффер",
    headline: "заголовок", cta: "кнопка", link: "ссылка", amount: "выигрыш", unit: "единица", parts: "что делаем",
  };
  const applyTz = async (fields: Record<string, string>, plan: CampaignTzPlan | null = null) => {
    const filled: string[] = [];
    // Новый бриф считаем сразу (а не в updater React — тот выполнится позже, и список «что заполнено» был бы пуст).
    {
      const p = latestB.current;
      const next = { ...p };
      const str = (k: keyof CampaignBrief, v: string | undefined, max: number) => {
        if (v && v.trim()) {
          (next as Record<string, unknown>)[k] = v.trim().slice(0, max);
          filled.push(TZ_LABELS[k as string] ?? String(k));
        }
      };
      if (fields.kind === "casino" || fields.kind === "sport") {
        next.kind = fields.kind;
        filled.push(TZ_LABELS.kind);
      }
      if (fields.lang && EU_LANGS.some((l) => l.id === fields.lang.trim().toLowerCase())) {
        next.lang = fields.lang.trim().toLowerCase();
        filled.push(TZ_LABELS.lang);
      }
      str("topic", fields.topic, 200);
      // Игра из ТЗ — сцена лендинга и плейбла, закреплена для «Мне повезёт».
      const game = SCENES.find((sc) => sc.id === fields.game?.trim());
      if (game) {
        next.scene = game.id;
        next.fixedScene = game.id;
        next.landing = "scene";
        filled.push(`игра «${game.label}»`);
      }
      // Название игры — не бренд (в ТЗ «название казино — Plinko»): тогда бренд возьмём с сайта.
      const isGameName = (s: string) => {
        const v = s.trim().toLowerCase();
        return SCENES.some((sc) => sc.id === v || sc.label.toLowerCase() === v) || /^(plinko|aviator|mines|crash|slots?|sweet bonanza|gates of olympus)$/.test(v);
      };
      if (fields.brand && !looksLikeUrl(fields.brand) && !isGameName(fields.brand)) str("brand", fields.brand, 40);
      else if (fields.brand && isGameName(fields.brand) && !fields.site) next.brand = "";
      str("offer", fields.offer, 80);
      str("headline", fields.headline, 60);
      str("cta", fields.cta, 24);
      if (fields.link && /^https?:\/\//i.test(fields.link.trim())) str("link", fields.link, 500);
      const amount = Number(String(fields.amount ?? "").replace(/[^\d.]/g, ""));
      if (amount > 0) {
        next.amount = Math.round(amount);
        filled.push(TZ_LABELS.amount);
      }
      str("unit", fields.unit, 12);
      if (fields.parts) {
        const want = fields.parts.toLowerCase();
        const chosen = { landing: want.includes("landing"), playable: want.includes("playable"), email: want.includes("email"), banner: want.includes("banner") };
        if (Object.values(chosen).some(Boolean)) {
          next.parts = chosen;
          filled.push(TZ_LABELS.parts);
        }
      }
      next.tzPlan = plan;
      next.emailTemplate = "";
      next.bannerText = "";
      if (plan) {
        // Тематика плана главнее поля: поле модель иногда додумывает из примеров подсказки.
        if (plan.topic) {
          next.topic = plan.topic.slice(0, 200);
          if (!filled.includes(TZ_LABELS.topic)) filled.push(TZ_LABELS.topic);
        }
        // Механика лендинга — из доступных для типа трафика.
        const mech = LANDING_OPTIONS[next.kind].some((o) => o.id === plan.landing.mechanic) ? plan.landing.mechanic : null;
        const sceneId = (mech === "scene" ? plan.landing.scene : null) ?? plan.playable.scene;
        const sc = SCENES.find((x) => x.id === sceneId);
        if (sc) {
          next.scene = sc.id;
          next.fixedScene = sc.id;
          if (!filled.some((f) => f.startsWith("игра"))) filled.push(`игра «${sc.label}»`);
        }
        if (mech && (mech !== "scene" || sc)) next.landing = mech;
        if (!fields.parts) next.parts = { landing: plan.landing.make, playable: plan.playable.make, email: plan.email.make, banner: plan.banner.make };
        next.emailTemplate = plan.email.template;
        next.bannerText = plan.bannerText;
        if (!next.headline.trim() && plan.headline) next.autoHeadline = plan.headline;
        filled.push("подбор креативов");
      }
      setB(next);
    }
    // Сайт бренда в ТЗ — лого, название и цвет с него (как «Найти по сайту»).
    if (fields.site && !isGuest) {
      try {
        const r = await lookupBrand(fields.site);
        const logo = await shrinkPng(r.logo_data_url, 256).catch(() => r.logo_data_url);
        setB((p) => ({
          ...p,
          logo,
          brand:
            p.brand.trim() && !(fields.brand && p.brand.trim() === fields.brand.trim() && SCENES.some((sc) => sc.id === p.brand.trim().toLowerCase()))
              ? p.brand
              : r.brand_name && !looksLikeUrl(r.brand_name)
                ? r.brand_name
                : nameFromHost(r.site_url || fields.site),
          ...(/^#[0-9a-f]{6}$/i.test(r.accent_color_hex) && !p.pickColor && !p.ref ? { pickColor: r.accent_color_hex } : {}),
        }));
        filled.push(TZ_LABELS.site);
      } catch {
        /* сайт не нашёлся — остальное из ТЗ уже на месте */
      }
    }
    setTzFilled(filled);
    return filled;
  };
  const parseTz = async (file?: File) => {
    if (isGuest) return openGate("Разбор ТЗ — после входа");
    const text = tzText.trim();
    if (!file && !text) return;
    if (file && file.size > 10 * 1024 * 1024) return toast.error("Файл ТЗ до 10 МБ");
    setTzBusy(true);
    setTzFilled([]);
    try {
      const payload = file ? { product: "campaign", fileBase64: await readFile(file), fileName: file.name } : { product: "campaign", text };
      const res = await apiFetch("/api/parse-brief", { method: "POST", json: payload });
      const data = (await res.json().catch(() => ({}))) as { fields?: Record<string, string>; plan?: CampaignTzPlan | null; error?: string };
      if (!res.ok || !data.fields) throw new Error(data.error || "Не удалось разобрать ТЗ");
      const filled = await applyTz(data.fields, data.plan ?? null);
      if (filled.length) toast.success(`Из ТЗ: ${filled.join(", ")}`);
      else toast("В ТЗ не нашлось данных для кампании — впишите тематику руками");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось разобрать ТЗ");
    } finally {
      setTzBusy(false);
    }
  };

  const [roll, setRoll] = useState<LuckyRoll | null>(null);
  const [planning, setPlanning] = useState(false);
  const topic = b.topic.trim();
  // Без тематики — тема с рефа или случайная.
  /** Сцены для «Мне повезёт»: игра из ТЗ — только она. */
  const luckyScenes = b.fixedScene ? [b.fixedScene] : LUCKY_SCENES[b.kind];
  useEffect(() => {
    if (ready && !topic) setRoll((prev) => {
      const r = luckyRoll(b.kind, b.refScene, prev);
      return b.fixedScene ? { ...r, scene: b.fixedScene } : r;
    });
  }, [ready, b.kind, b.refScene, topic, b.fixedScene]);
  // Тематика задана — сцена, визуал и заголовок подбираются по ней (после паузы в наборе).
  useEffect(() => {
    if (!ready || !topic) return;
    let alive = true;
    const id = window.setTimeout(async () => {
      const scenes = luckyScenes;
      if (isGuest) {
        // Без входа — без подбора: тема как есть, сцена случайная.
        setRoll({ scene: scenes[Math.floor(Math.random() * scenes.length)], theme: topic, themeName: topic });
        return;
      }
      const tz = latestB.current.tzPlan;
      if (tz && tz.topic && tz.topic === topic && tz.visual) {
        setRoll({ scene: latestB.current.fixedScene ?? scenes[0], theme: tz.visual, themeName: topic });
        return;
      }
      setPlanning(true);
      try {
        const res = await apiFetch("/api/campaign-plan", { method: "POST", json: { theme: topic, kind: b.kind, lang: b.lang, scenes } });
        const plan = (await res.json().catch(() => ({}))) as { scene?: string; visual?: string; headline?: string; error?: string };
        if (!alive) return;
        if (!res.ok || !plan.scene) throw new Error(plan.error || "Не удалось подобрать");
        setRoll({ scene: plan.scene as LuckyRoll["scene"], theme: plan.visual || topic, themeName: topic });
        setB((p) => ({ ...p, autoHeadline: plan.headline ?? "" }));
      } catch {
        if (alive) setRoll({ scene: scenes[0], theme: topic, themeName: topic });
      } finally {
        if (alive) setPlanning(false);
      }
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [ready, topic, b.kind, b.lang, isGuest, b.fixedScene]); // eslint-disable-line react-hooks/exhaustive-deps
  /** «Другая»: с тематикой — другая сцена в той же теме; без неё — другая тема и сцена. */
  const rerollLucky = () =>
    setRoll((prev) => {
      if (b.fixedScene) {
        // Игра задана в ТЗ — «Другая» меняет только тему.
        const r = luckyRoll(b.kind, b.refScene, prev);
        return { ...(topic && prev ? prev : r), scene: b.fixedScene };
      }
      if (!topic || !prev) return luckyRoll(b.kind, b.refScene, prev);
      const others = LUCKY_SCENES[b.kind].filter((s) => s !== prev.scene);
      return { ...prev, scene: others[Math.floor(Math.random() * others.length)] ?? prev.scene };
    });
  /** Сцена, под которую идёт текущая сборка, — для раскладки деталей, пришедших позже. */
  const luckyScene = useRef(b.scene);
  const luckyBrief = useMemo(() => ({ ...full, landing: "scene" as const, scene: roll?.scene ?? b.scene }), [full, roll, b.scene]);
  const luckyExtras = useMemo(() => briefExtras(luckyBrief), [luckyBrief]);
  const extrasAssets = useExtrasAssets({
    value: luckyExtras,
    // Хук отдаёт блоки целиком — нам нужны только картинки: бонусы по карточкам с заголовками, игры по порядку.
    onChange: (x) =>
      setArt((a) =>
        a && {
          ...a,
          bonusImgs: x.bonuses.items.filter((it) => it.title.trim()).map((it) => it.image ?? ""),
          gameImgs: x.games.items.map((g) => g.image ?? ""),
        },
      ),
    kind: b.kind,
    theme: roll?.theme ?? "",
  });
  const applyLucky = async (key: string, dataUrl: string) => {
    if (key === "banner") {
      setArt((a) => a && { ...a, banner: dataUrl });
      if (briefParts(latestB.current).email) void makeEmailHero(dataUrl);
      return;
    }
    if (key.startsWith("x-")) {
      await extrasAssets.apply(key.slice(2), dataUrl);
      return;
    }
    const part = scenePartsFor(luckyScene.current).find((p) => `s-${p.id}` === key);
    if (!part) return;
    const patch = await prepareScenePart(part, dataUrl);
    // Фон задаёт гамму, если нет рефа и пипетки.
    const palette = patch.bgImage ? await paletteFromImage(patch.bgImage).catch(() => null) : undefined;
    setArt((a) =>
      a && {
        ...a,
        ...(patch.bgImage ? { bg: patch.bgImage, palette } : {}),
        ...(patch.reward ? { reward: patch.reward } : {}),
        ...(patch.symbols ? { symbols: patch.symbols } : {}),
        ...(patch.art ? { art: { ...(a.art ?? {}), ...patch.art } } : {}),
      },
    );
  };
  const lucky = useAssetRun({ resumeKey: "dw_jobs_campaign", apply: applyLucky });
  /**
   * Шапка письма — тот же баннер, но без текстов (правкой готового баннера,
   * а не новой генерацией — иначе картинка была бы другой). Идёт после
   * баннера: ей нужен готовый.
   */
  const [heroBusy, setHeroBusy] = useState(false);
  const makeEmailHero = async (banner: string) => {
    if (isGuest) return;
    setHeroBusy(true);
    try {
      // Баннер ужимаем до 1536 px по ширине: запросу хватает, а тело — в разы меньше.
      const src = await shrinkPng(banner, 1536).catch(() => banner);
      // Лого бренда — вторым референсом: в шапке оно остаётся, тексты — нет.
      const logo = b.logo ? { logoBase64: b.logo, logoMode: "reference" } : {};
      const res = await apiFetch("/api/generate-email-hero", { method: "POST", json: { textlessOf: src, aspectRatio: "16:9", feature: "email-hero", brand: b.brand, ...logo } });
      const data = (await res.json().catch(() => ({}))) as { imageUrl?: string; error?: string };
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "Не удалось сделать шапку письма");
      const hero = data.imageUrl;
      setArt((a) => a && { ...a, emailHero: hero });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сделать шапку письма");
    } finally {
      setHeroBusy(false);
    }
  };
  const callStep = (key: string, route: string, body: Record<string, unknown>) => async () => {
    const res = await apiFetch(route, { method: "POST", json: body });
    const data = (await res.json().catch(() => ({}))) as { imageUrl?: string; error?: string; detail?: string };
    if (!res.ok || !data.imageUrl) throw new Error([data.error, data.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать");
    await applyLucky(key, data.imageUrl);
    return true;
  };
  /** Вся графика: детали сцены, фон, награда — и картинки блоков лендинга. */
  const luckySteps = (): AssetStep[] => {
    if (!roll) return [];
    const style = sceneAiStyle(roll.theme);
    return [
      // Детали сцены — для лендинга на сцене и для плейбла.
      ...(parts.landing || doPlayable
        ? scenePartsFor(roll.scene).map((p) => {
            const r = scenePartRequest(p, style, roll.theme);
            return { id: `s-${p.id}`, label: p.label, credits: r.credits, run: callStep(`s-${p.id}`, r.route, r.body), server: { route: r.route, body: r.body } };
          })
        : []),
      // Картинки блоков — только у лендинга.
      ...(parts.landing ? extrasAssets.allSteps({ floaters: false }).map((st) => ({ ...st, id: `x-${st.id}` })) : []),
      // Баннер — сам по себе или как основа шапки письма.
      ...(parts.banner || parts.email ? [bannerStep(roll.theme)] : []),
    ];
  };
  /** Баннер в той же теме — генератором баннеров; попадает и в «Мои проекты» как обычный баннер. */
  const bannerStep = (theme: string): AssetStep => {
    const payload = luckyBannerPayload(full, theme) as GeneratePayload;
    return {
      id: "banner",
      label: parts.banner ? "Баннер 16:9" : "Баннер — основа для шапки письма",
      credits: BANNER_PRICE_CREDITS,
      run: async () => {
        const r = await generateImage(payload);
        await applyLucky("banner", r.image);
        return true;
      },
      server: { route: "/api/generate-image", body: bannerRequestBody(payload) },
    };
  };
  /** В смете — ещё шапка письма: делается из готового баннера, после него. */
  const HERO_PLAN = { id: "email-hero", label: "Шапка письма — баннер без текстов", credits: EMAIL_HERO_PRICE_CREDITS };
  const luckyPlan = [...luckySteps(), ...(parts.email ? [HERO_PLAN] : [])];
  const luckyCredits = luckyPlan.reduce((sum, st) => sum + st.credits, 0);
  const startLucky = () => {
    if (!roll) return;
    if (isGuest) return openGate("Графика от ИИ тратит кредиты — войдите, чтобы собрать кампанию");
    luckyScene.current = roll.scene;
    setArt({ scene: roll.scene, theme: roll.theme, themeName: roll.themeName });
    setB((p) => ({ ...p, landing: "scene", scene: roll.scene }));
    setTab("landing");
    void lucky.start(luckySteps());
  };
  const sceneLabel = (id: string) => SCENES.find((s) => s.id === id)?.label ?? id;

  // Перевод: один раз на язык и набор текстов (тип трафика, сцена), с кэшем в браузере.
  const source = useMemo(() => briefSource(b), [b.lang, b.kind, b.scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    const keys = Object.keys(source);
    if (!keys.length) {
      setI18n({});
      return;
    }
    const key = trKey(b.lang, sourceHash(source));
    try {
      const cached = window.localStorage.getItem(key);
      if (cached) {
        setI18n(JSON.parse(cached) as CampaignI18n);
        return;
      }
    } catch {
      /* без кэша */
    }
    setI18n({});
    if (isGuest) return;
    let alive = true;
    setTranslating(true);
    void apiFetch("/api/translate-texts", { method: "POST", json: { lang: b.lang, texts: source } })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { texts?: CampaignI18n; error?: string };
        if (!res.ok || !data.texts) throw new Error(data.error || "Не удалось перевести");
        if (!alive) return;
        setI18n(data.texts);
        try {
          window.localStorage.setItem(key, JSON.stringify(data.texts));
        } catch {
          /* без кэша */
        }
      })
      .catch((e) => alive && toast.error(e instanceof Error ? e.message : "Не удалось перевести"))
      .finally(() => alive && setTranslating(false));
    return () => {
      alive = false;
    };
  }, [source, b.lang, ready, isGuest]);

  // Перевод пришёл — умолчания брифа (ещё не тронутые руками) тоже на этом языке.
  useEffect(() => {
    if (!i18n["brief.offer"] && !i18n["brief.cta"]) return;
    const en = briefDefaults(b.kind, "en");
    const now = briefDefaults(b.kind, b.lang, i18n);
    setB((p) => ({ ...p, offer: p.offer === en.offer ? now.offer : p.offer, cta: p.cta === en.cta ? now.cta : p.cta }));
  }, [i18n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Превью — после паузы в наборе.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const id = window.setTimeout(async () => {
      try {
        const [l, p] = await Promise.all([parts.landing ? briefLandingHtml(full, browserLoader) : Promise.resolve(""), doPlayable ? briefPlayableHtml(full, browserLoader) : Promise.resolve("")]);
        if (!alive) return;
        setLandingHtml(l);
        setPlayableHtml(p);
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : "Не удалось собрать превью");
      }
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [full, ready, parts.landing, doPlayable]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailHtml = useMemo(() => buildEmailHtml(briefEmail(full)), [full]);
  /** Поле ещё не трогали руками: пустое или равно умолчанию брифа на этом языке. */
  const untouched = (p: CampaignBrief, k: "offer" | "cta" | "headline") => {
    const v = p[k].trim();
    return !v || v === briefDefaults(p.kind, p.lang, i18n)[k];
  };
  const switchKind = (kind: LandingKind) => {
    if (kind === b.kind) return;
    const d = defaultBrief(kind, b.lang);
    const now = briefDefaults(kind, b.lang, i18n);
    // Своё (оффер, заголовок, кнопка, сумма) не теряем — меняем только то, что ещё по умолчанию.
    setB((p) => ({
      ...d,
      brand: p.brand,
      logo: p.logo,
      link: p.link,
      lang: p.lang,
      ref: p.ref,
      refScene: p.refScene,
      refPalette: p.refPalette,
      pickColor: p.pickColor,
      offer: untouched(p, "offer") ? now.offer : p.offer,
      cta: untouched(p, "cta") ? now.cta : p.cta,
      headline: untouched(p, "headline") ? "" : p.headline,
    }));
  };
  const switchLang = (lang: string) => {
    if (lang === b.lang) return;
    const was = briefDefaults(b.kind, b.lang, i18n);
    const now = briefDefaults(b.kind, lang);
    // Свои тексты не трогаем; заменяем только то, что ещё из пресета (или перевода).
    setB((p) => ({ ...p, lang, offer: p.offer === was.offer ? now.offer : p.offer, cta: p.cta === was.cta ? now.cta : p.cta }));
  };

  /**
   * Реф: ужимаем, считаем палитру (цвета всей кампании) и разбираем картинку:
   * бренд, заголовок, оффер, кнопка — если они на ней есть, и сцена — тема для ИИ.
   */
  const pickRef = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    let ref = "";
    try {
      ref = await shrinkRef(await readFile(file));
    } catch {
      toast.error("Не удалось прочитать картинку");
      return;
    }
    const refPalette = await paletteFromImage(ref).catch(() => null);
    setB((p) => ({ ...p, ref, refPalette, pickColor: undefined, refScene: "" }));
    if (isGuest) {
      toast("Цвета взяты с рефа. Тексты с картинки читаем после входа.");
      return;
    }
    setAnalyzing(true);
    try {
      const mechanic = b.landing === "wheel" || b.landing === "slot" || b.landing === "crash" ? b.landing : undefined;
      const res = await apiFetch("/api/analyze-banner-for-landing", { method: "POST", json: { source_image: ref, mechanic } });
      const data = (await res.json().catch(() => ({}))) as {
        result?: { headline?: string; subheadline?: string; cta_text?: string; brand_name?: string; background_prompt?: string };
        error?: string;
      };
      if (!res.ok || !data.result) throw new Error(data.error || "Не удалось разобрать реф");
      const r = data.result;
      // Тексты с картинки — на языке кампании (переводчик оставит как есть, если язык уже тот).
      let texts: Record<string, string> = {};
      for (const [k, v] of [["headline", r.headline], ["offer", r.subheadline], ["cta", r.cta_text]] as const) {
        if (v && v.trim()) texts[k] = v.trim();
      }
      if (Object.keys(texts).length) {
        const tr = await apiFetch("/api/translate-texts", { method: "POST", json: { lang: b.lang, texts } })
          .then((res) => (res.ok ? (res.json() as Promise<{ texts?: Record<string, string> }>) : null))
          .catch(() => null);
        if (tr?.texts) texts = { ...texts, ...tr.texts };
      }
      // Заполняем только пустое и стандартное — вписанное руками не трогаем.
      setB((p) => ({
        ...p,
        brand: p.brand.trim() || (r.brand_name ?? "").slice(0, 40),
        headline: texts.headline && untouched(p, "headline") ? texts.headline.slice(0, 60) : p.headline,
        offer: texts.offer && untouched(p, "offer") ? texts.offer.slice(0, 80) : p.offer,
        cta: texts.cta && untouched(p, "cta") ? texts.cta.slice(0, 24) : p.cta,
        refScene: (r.background_prompt ?? "").trim(),
      }));
      toast.success("Реф разобран: цвета и тексты — с картинки, на языке кампании. Вписанное вами не меняли.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось разобрать реф");
    } finally {
      setAnalyzing(false);
    }
  };
  const pickFromScreen = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const { sRGBHex } = await new Ctor().open();
      if (/^#[0-9a-f]{6}$/i.test(sRGBHex)) set("pickColor", sRGBHex);
    } catch {
      /* закрыли пипетку — ничего не меняем */
    }
  };
  const pickLogo = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      set("logo", await shrinkPng(await readFile(file), 480));
    } catch {
      toast.error("Не удалось прочитать картинку");
    }
  };

  const openEditor = async (part: "landing" | "playable" | "email" | "banner") => {
    try {
      if (part === "email") {
        const d = briefEmail(full);
        await persistDraft(d, !isGuest);
        router.push(`/email?draft=${encodeURIComponent(d.id)}`);
        return;
      }
      if (part === "banner") {
        const s = briefBanner(full);
        window.localStorage.setItem("dw_hub_prompt", s.prompt);
        if (b.brand.trim()) window.localStorage.setItem("brand_name", b.brand.trim());
        if (b.logo) window.localStorage.setItem("brand_logo", b.logo);
        router.push(`/banner?preset=${s.preset}`);
        return;
      }
      const { writes, route } = briefEditorDraft(full, part);
      for (const [k, v] of writes) {
        window.localStorage.setItem(k, JSON.stringify(v));
        forgetProject(k); // открываем как новый проект
      }
      router.push(route);
    } catch {
      toast.error("Браузер не дал сохранить черновик — проверьте место или настройки cookie");
    }
  };

  const downloadAll = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const slug = (b.brand.trim() || "campaign").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "campaign";
      if (parts.landing) zip.file("landing/index.html", await briefLandingHtml(full, browserLoader));
      if (doPlayable) {
        zip.file("playable/web.html", await briefPlayableHtml(full, browserLoader, "web"));
        zip.file("playable/mraid.html", await briefPlayableHtml(full, browserLoader, "mraid"));
      }
      if (parts.email) zip.file("email/email.html", emailHtml);
      // Баннер «Мне повезёт» — как есть, в его формате.
      const banner = art?.banner?.match(/^data:image\/(\w+);base64,(.+)$/);
      if (banner && parts.banner) zip.file(`banner/banner-16x9.${banner[1] === "jpeg" ? "jpg" : banner[1]}`, banner[2], { base64: true });
      zip.file(
        "README.txt",
        [
          `Кампания ${b.brand || ""}`.trim(),
          "",
          parts.landing ? "landing/index.html — лендинг, один файл: загрузите на хостинг или в трекер." : "",
          doPlayable ? "playable/mraid.html — плейбл для MRAID-сетей (AppLovin, Unity, Liftoff); web.html — для сайта." : "",
          art?.banner && parts.banner ? "banner/ — баннер 16:9; другие размеры — в генераторе баннеров (раздел «Мои проекты»)." : "",
          parts.email ? "email/email.html — письмо: шапка — баннер кампании без текстов; картинки перед рассылкой разместите на хостинге (генератор писем делает это при выгрузке)." : "",
          "",
          `Ссылка по кнопкам: ${b.link || "не задана — добавьте в редакторах"}`,
        ]
          .filter((l) => l !== "")
          .join("\n"),
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-campaign.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Кампания скачана — лендинг, плейбл и письмо в одном архиве");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось собрать архив");
    } finally {
      setZipping(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Mail; on: boolean }[] = [
    { id: "landing", label: "Лендинг", icon: MonitorSmartphone, on: parts.landing },
    { id: "playable", label: "Плейбл", icon: Gamepad2, on: doPlayable },
    { id: "email", label: "Письмо", icon: Mail, on: parts.email },
    { id: "banner", label: "Баннер", icon: Megaphone, on: parts.banner },
  ];
  // Сняли галочку с открытой вкладки — на первую оставшуюся.
  const shownTabs = tabs.filter((t) => t.on).map((t) => t.id).join(",");
  useEffect(() => {
    const list = shownTabs.split(",") as Tab[];
    if (list.length && !list.includes(tab)) setTab(list[0]);
  }, [shownTabs, tab]);
  const accent = briefAccent(b);
  const needsScene = b.landing === "scene" || showPlayable;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 lg:flex-row lg:items-start lg:p-6">
      <section className="flex w-full flex-col gap-4 lg:sticky lg:top-6 lg:w-[420px] lg:shrink-0">
        <div>
          <p className="ds-caption">Кампания</p>
          <h1 className="ds-h1 mt-1">Всё из одного брифа</h1>
          <p className="mt-1 ds-caption">Лендинг, плейбл, письмо и баннер — в одной теме, с одним оффером и одной ссылкой.</p>
        </div>

        <div>
          <div role="tablist" className="mb-2 grid grid-cols-2 gap-2">
            {(
              [
                ["topic", "Ввести тематику"],
                ["tz", "Загрузить ТЗ"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={topicMode === id}
                onClick={() => setTopicMode(id)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${topicMode === id ? CHIP_ON : CHIP_OFF}`}
              >
                {label}
              </button>
            ))}
          </div>
          {topicMode === "topic" ? (
            <>
              <label htmlFor="campaign-topic" className="mb-1.5 block ds-caption">Тематика — остальное подберём сами</label>
              <input
                id="campaign-topic"
                value={b.topic}
                maxLength={200}
                onChange={(e) => setB((p) => ({ ...p, topic: e.target.value, ...(e.target.value.trim() ? {} : { autoHeadline: "" }) }))}
                className={INPUT}
                placeholder="Викинги, Хэллоуин, Супермен, финал Лиги чемпионов…"
              />
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="ds-caption">
                ТЗ файлом (.docx, .pdf, .txt) или текстом: возьмём тематику, бренд и сайт (лого с него), оффер, заголовок, кнопку,
                ссылку, язык, тип трафика и что делать.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={tzBusy}
                  onClick={() => tzFile.current?.click()}
                  className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm transition disabled:opacity-60 ${CHIP_OFF}`}
                >
                  {tzBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {tzBusy ? "Разбираем ТЗ…" : "Загрузить файл ТЗ"}
                </button>
                <input
                  ref={tzFile}
                  type="file"
                  accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void parseTz(f);
                  }}
                />
              </div>
              <textarea
                id="campaign-tz"
                value={tzText}
                onChange={(e) => setTzText(e.target.value)}
                rows={4}
                placeholder="…или вставьте текст ТЗ"
                className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green"
              />
              <button
                type="button"
                disabled={tzBusy || !tzText.trim()}
                onClick={() => void parseTz()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent-green px-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {tzBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Разобрать текст ТЗ
              </button>
              {tzFilled.length ? (
                <p className="ds-caption">
                  Заполнено из ТЗ: {tzFilled.join(", ")}.{b.topic ? <> Тематика: <b className="text-foreground">{b.topic}</b>.</> : null}
                </p>
              ) : null}
              {b.tzPlan ? <TzPlanCard plan={b.tzPlan} kind={b.kind} /> : null}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 ds-caption">Что делаем</legend>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_PARTS.filter((p) => p.id !== "playable" || showPlayable).map((p) => {
              const on = parts[p.id];
              // Хотя бы одна часть остаётся.
              const last = on && CAMPAIGN_PARTS.filter((x) => parts[x.id] && (x.id !== "playable" || showPlayable)).length === 1;
              return (
                <label
                  key={p.id}
                  className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition ${on ? CHIP_ON : CHIP_OFF} ${last ? "cursor-not-allowed opacity-70" : ""}`}
                  title={last ? "Хотя бы одну часть оставьте" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={last}
                    onChange={(e) => setB((prev) => ({ ...prev, parts: { ...briefParts(prev), [p.id]: e.target.checked } }))}
                    className="h-4 w-4 accent-[var(--accent-green,#c6ff3d)]"
                  />
                  {p.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <p className="ds-caption">
              {planning ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Подбираем сцену, визуал и заголовок…</span>
              ) : roll ? (
                <>
                  Тема: <b className="text-foreground">{roll.themeName}</b> · сцена: <b className="text-foreground">{sceneLabel(roll.scene)}</b>. Лендинг, плейбл и баннер — с графикой от ИИ на всех элементах.
                </>
              ) : (
                "Выбираем тему…"
              )}
            </p>
            <button
              type="button"
              onClick={rerollLucky}
              disabled={lucky.running || planning}
              title={topic ? "Другая сцена в той же тематике" : b.refScene ? "Другая сцена (тема — с рефа)" : "Другая тема и сцена"}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition disabled:opacity-50 ${CHIP_OFF}`}
            >
              <Dices className="h-3.5 w-3.5" /> Другая
            </button>
          </div>
          <AssetRunPanel
            title="Мне повезёт"
            plan={luckyPlan}
            steps={lucky.steps}
            running={lucky.running}
            notEnough={lucky.notEnough}
            credits={luckyCredits}
            onStart={startLucky}
            onCancel={lucky.cancel}
            disabled={!roll || planning}
          />
          {art ? (
            <p className="ds-caption">
              Графика кампании: {art.themeName} — {sceneLabel(art.scene)}
              {art.scene !== b.scene ? " (детали — для другой сцены; фон и блоки — на месте)" : ""}.{" "}
              <button type="button" onClick={() => setArt(null)} disabled={lucky.running} className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline">
                Убрать графику
              </button>
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["casino", "sport"] as LandingKind[]).map((k) => (
            <button key={k} type="button" onClick={() => switchKind(k)} aria-pressed={b.kind === k} className={`rounded-lg border px-3 py-2 text-sm transition ${b.kind === k ? CHIP_ON : CHIP_OFF}`}>
              {k === "casino" ? "Казино" : "Ставки на спорт"}
            </button>
          ))}
        </div>

        {/* Найти по сайту: лого (уйдёт в баннер и шапку письма), название и фирменный цвет. */}
        <BrandLookup
          onFound={(f) =>
            setB((p) => ({
              ...p,
              brand: f.brandName || p.brand,
              logo: f.logoDataUrl,
              // Фирменный цвет — гаммой кампании, если её не задали пипеткой и нет рефа.
              ...(/^#[0-9a-f]{6}$/i.test(f.accentHex) && !p.pickColor && !p.ref ? { pickColor: f.accentHex } : {}),
            }))
          }
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block ds-caption">Бренд — название, лого или оба</label>
            <input value={b.brand} maxLength={40} onChange={(e) => set("brand", e.target.value)} className={INPUT} placeholder={b.logo ? "Можно без названия — есть лого" : "Название бренда"} />
          </div>
          <div>
            <label className="mb-1.5 block ds-caption">Лого</label>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => logoInput.current?.click()} className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-elevated" aria-label="Загрузить лого">
                {b.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Upload className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {b.logo ? (
                <button type="button" onClick={() => set("logo", "")} aria-label="Убрать лого" className="flex h-10 w-8 items-center justify-center text-muted-foreground hover:text-foreground">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pickLogo(e.target.files?.[0])} />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Референс — по нему цвета, фон и тексты кампании</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => refInput.current?.click()}
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-elevated"
              aria-label="Загрузить референс"
            >
              {b.ref ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.ref} alt="" className="h-full w-full object-cover" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
            <div className="min-w-0 flex-1 ds-caption">
              {analyzing ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Разбираем картинку…</span>
              ) : b.ref ? (
                <>
                  {b.refScene ? <span className="line-clamp-3">Сцена: {b.refScene}</span> : "Цвета — с рефа."}
                  <span className="mt-1 flex gap-3">
                    <button type="button" onClick={() => refInput.current?.click()} className="text-foreground/80 hover:text-foreground">Заменить</button>
                    <button type="button" onClick={() => setB((p) => ({ ...p, ref: "", refScene: "", refPalette: null }))} className="text-foreground/80 hover:text-foreground">Убрать</button>
                  </span>
                </>
              ) : (
                "Баннер, ключевой визуал или скрин конкурента: возьмём цвета, бренд, заголовок и оффер, а сцену передадим ИИ в редакторах."
              )}
            </div>
            <input ref={refInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickRef(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Гамма — кнопки, плашки, колесо, письмо</label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => set("pickColor", undefined)}
              aria-pressed={!b.pickColor}
              title={b.ref ? "Цвета берутся с рефа" : "Загрузите реф — цвета возьмём с него"}
              className={`flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm transition ${!b.pickColor ? CHIP_ON : CHIP_OFF}`}
            >
              <span className="h-4 w-4 rounded-full ring-2 ring-[var(--bg-panel,#111)]" style={{ background: briefAccent({ ...b, pickColor: undefined }) }} />
              {b.ref ? "Авто — по рефу" : "Авто"}
            </button>
            {hasEyeDropper ? (
              <button type="button" onClick={() => void pickFromScreen()} title="Взять цвет с экрана — с рефа, превью или любой картинки" className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition ${CHIP_OFF}`}>
                <Pipette className="h-4 w-4" /> Пипетка
              </button>
            ) : null}
            <label title="Выбрать цвет" className={`relative flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm transition ${b.pickColor ? CHIP_ON : CHIP_OFF}`}>
              <span className="h-5 w-5 rounded-full ring-1 ring-white/30" style={{ background: b.pickColor ?? accent }} />
              {b.pickColor ? b.pickColor.toUpperCase() : "Свой цвет"}
              <input type="color" value={b.pickColor ?? accent} onChange={(e) => set("pickColor", e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Язык</label>
          <select value={b.lang} onChange={(e) => switchLang(e.target.value)} className={INPUT}>
            {EU_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {!isBuiltInLang(b.lang) ? (
            <p className="mt-1.5 ds-caption">
              {translating ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Переводим тексты кампании…</span>
              ) : isGuest && !Object.keys(i18n).length ? (
                "Перевод — после входа; пока тексты на английском."
              ) : (
                "Тексты переведены ИИ — проверьте оффер и кнопку."
              )}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Заголовок</label>
          <input value={b.headline} maxLength={60} onChange={(e) => set("headline", e.target.value)} className={INPUT} placeholder={briefHeadline({ ...full, headline: "" })} />
        </div>
        <div>
          <label className="mb-1.5 block ds-caption">Оффер</label>
          <input value={b.offer} maxLength={80} onChange={(e) => set("offer", e.target.value)} className={INPUT} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block ds-caption">Выигрыш в игре</label>
            <input type="number" min={1} value={b.amount} onChange={(e) => set("amount", Math.max(1, Number(e.target.value) || 1))} className={INPUT} />
          </div>
          <div className="w-28">
            <label className="mb-1.5 block ds-caption">Единица</label>
            <input value={b.unit} maxLength={12} onChange={(e) => set("unit", e.target.value)} className={INPUT} />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-40">
            <label className="mb-1.5 block ds-caption">Кнопка</label>
            <input value={b.cta} maxLength={24} onChange={(e) => set("cta", e.target.value)} className={INPUT} />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block ds-caption">Ссылка по кнопкам</label>
            <input type="url" value={b.link} onChange={(e) => set("link", e.target.value)} className={INPUT} placeholder="https://… — оффер или трекер" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Механика лендинга</label>
          <div className="grid grid-cols-2 gap-2">
            {LANDING_OPTIONS[b.kind].map((o) => (
              <button key={o.id} type="button" onClick={() => set("landing", o.id)} aria-pressed={b.landing === o.id} className={`rounded-lg border px-2 py-2 text-sm transition ${b.landing === o.id ? CHIP_ON : CHIP_OFF}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {needsScene ? (
          <div>
            <label className="mb-1.5 block ds-caption">{b.landing === "scene" ? "Сцена — лендинга и плейбла" : "Сцена плейбла"}</label>
            <select value={b.scene} onChange={(e) => set("scene", e.target.value as CampaignBrief["scene"])} className={INPUT}>
              {SCENES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void downloadAll()}
          disabled={zipping}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> {zipping ? "Собираем…" : "Скачать всё — ZIP"}
        </button>
        <p className="-mt-2 ds-caption">Цвета — гамма рефа. ИИ-графику в стиле рефа добавите в редакторе каждой части.</p>
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs
            .filter((t) => t.on)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${tab === t.id ? CHIP_ON : CHIP_OFF}`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
        </div>

        <div className="flex justify-center rounded-2xl border border-border bg-card p-3">
          {tab === "landing" ? (
            <iframe title="Лендинг кампании" srcDoc={landingHtml} sandbox="allow-scripts" className="block h-[720px] w-full max-w-[400px] rounded-xl border border-border bg-black" />
          ) : tab === "playable" ? (
            <iframe title="Плейбл кампании" srcDoc={playableHtml} sandbox="allow-scripts" className="block w-full max-w-[340px] rounded-xl border border-border bg-black" style={{ aspectRatio: "9 / 16" }} />
          ) : tab === "email" ? (
            <div className="flex w-full flex-col items-center gap-2 overflow-x-auto">
              {heroBusy ? (
                <p className="inline-flex items-center gap-1.5 ds-caption">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Делаем шапку письма из баннера — без текстов…
                </p>
              ) : art?.banner && !art.emailHero ? (
                <button type="button" onClick={() => void makeEmailHero(art.banner!)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${CHIP_OFF}`}>
                  <ImageIcon className="h-4 w-4" /> Сделать шапку из баннера · {EMAIL_HERO_PRICE_CREDITS}
                </button>
              ) : null}
              <iframe title="Письмо кампании" srcDoc={emailHtml} sandbox="" className="mx-auto block h-[720px] w-[640px] rounded-xl border border-border bg-white" />
            </div>
          ) : (
            art?.banner ? (
              <div className="flex w-full flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art.banner} alt="Баннер кампании" className="w-full max-w-2xl rounded-xl border border-border" />
                <p className="ds-caption">Баннер 16:9 из «Мне повезёт». Другие размеры — в генераторе баннеров (кнопка ниже).</p>
              </div>
            ) : (
            <div className="flex w-full max-w-xl flex-col items-center gap-3 py-10 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="ds-h4">Баннер рисует ИИ — в генераторе баннеров</p>
              <p className="ds-caption">
                Откроем генератор с вашим брендом, лого и промптом из оффера и темы: «{briefBanner(b).prompt}»
              </p>
            </div>
            )
          )}
        </div>

        <div className={`flex flex-wrap items-center justify-center gap-2 ${tab === "email" && !emailEditor ? "hidden" : ""}`}>
          <button
            type="button"
            onClick={() => void openEditor(tab)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-white/5"
          >
            <ExternalLink className="h-4 w-4" />
            {tab === "landing" ? "Открыть лендинг в редакторе" : tab === "playable" ? "Открыть плейбл в редакторе" : tab === "email" ? "Открыть письмо в редакторе" : "Открыть генератор баннеров"}
          </button>
        </div>
        <p className="text-center ds-caption">
          {tab === "landing"
            ? `Заголовок: «${briefHeadline(full)}». Лендинг играется прямо в превью и прокручивается до блоков.`
            : tab === "playable"
              ? "Плейбл играется в превью. В архиве — версии для MRAID-сетей и для сайта."
              : tab === "email"
                ? "Письмо по шаблону под ваш тип трафика — тексты, кнопка и цвет из брифа; шапка — баннер кампании без текстов (после «Мне повезёт»)."
                : "Генерация баннера тратит кредиты; остальные части кампании — бесплатно."}
        </p>
      </section>
    </div>
  );
}

/** «Как поняли ТЗ»: что делаем и почему — выбор креативов по ТЗ. */
function TzPlanCard({ plan, kind }: { plan: CampaignTzPlan; kind: LandingKind }) {
  const sceneLabel = (id: string | null) => SCENES.find((s) => s.id === id)?.label ?? id ?? "";
  const mech = LANDING_OPTIONS[kind].find((o) => o.id === plan.landing.mechanic)?.label ?? plan.landing.mechanic;
  const rows: { on: boolean; title: string; what: string; why: string }[] = [
    { on: plan.landing.make, title: "Лендинг", what: plan.landing.mechanic === "scene" ? `игра «${sceneLabel(plan.landing.scene)}»` : mech, why: plan.landing.why },
    { on: plan.playable.make, title: "Плейбл", what: plan.playable.scene ? `«${sceneLabel(plan.playable.scene)}»` : "", why: plan.playable.why },
    { on: plan.banner.make, title: "Баннер", what: plan.bannerText ? `«${plan.bannerText}»` : "", why: plan.banner.why },
    { on: plan.email.make, title: "Письмо", what: EMAIL_TEMPLATES.find((t) => t.id === plan.email.template)?.name ?? plan.email.template, why: plan.email.why },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-border bg-elevated/60 p-3 text-sm">
      <p className="font-semibold">Как поняли ТЗ</p>
      {plan.summary ? <p className="ds-caption">{plan.summary}</p> : null}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.title} className={r.on ? "" : "opacity-50"}>
            <b>{r.title}</b>
            {r.on ? (r.what ? <> — {r.what}</> : null) : " — не делаем"}
            {r.why ? <span className="block ds-caption">{r.why}</span> : null}
          </li>
        ))}
      </ul>
      {plan.notes.length ? (
        <div className="ds-caption">
          <p className="font-medium text-foreground/80">Из ТЗ не сделаем как написано:</p>
          <ul className="list-disc pl-4">
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
