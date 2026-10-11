"use client";

// Playable-ads generator — same shell as the Banner/Landing generators (3 columns
// on desktop, a step wizard on mobile) adapted to the interactive game format:
// the left column picks a game mechanic (with looped animated previews), the
// centre has mechanic-specific settings, and the result is a REAL interactive
// preview (a sandboxed iframe running the generated mini-game). Generation is
// client-side today (see src/lib/playableGen.ts); the shape matches the other
// generators so a real API can be slotted in later.
import { useEffect, useMemo, useRef, useState } from "react";

import { BriefUploader } from "@/components/BriefUploader";
import {
  ArrowUpRight,
  Check,
  ArrowLeft,
  Code2,
  Download,
  Gamepad2,
  Maximize2,
  Minimize2,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  Ticket,
  Upload,
  Vault,
  X,
  FerrisWheel,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBrandSettings } from "@/components/SettingsDrawer";
import { GenerationErrorCard } from "@/components/GenerationErrorCard";
import { GenerationProgress } from "@/components/GenerationProgress";
import { EmptyResult } from "@/components/EmptyResult";
import { SettingsSection, SectionDots } from "@/components/SettingsSection";
import { setUnsavedWork } from "@/lib/unsaved-work";
import { useConfirm } from "@/components/ui/confirm";
import { ToolCoachmark } from "@/components/ToolCoachmark";
import { CREATIVE_LANGUAGES } from "@/lib/creative-language";
import { useAuthGate } from "@/components/AuthGate";
import {
  PLAYABLE_MECHANICS,
  PLAYABLE_NETWORKS,
  PLAYABLE_RATIOS,
  PLAYABLE_DURATIONS,
  buildPlayableHtml,
  generatePlayable,
  type PlayableInput,
  type PlayableMechanic,
  type PlayableNetwork,
  type PlayableResult,
} from "@/lib/playableGen";
import { type PlayableTemplate } from "@/lib/playableTemplates";
import { PlayableTemplatePicker } from "@/components/playable/PlayableTemplatePicker";
import { SceneStudio } from "@/components/playable/SceneStudio";
import { SCENES } from "@/lib/scenes/presets";
import type { SceneId } from "@/lib/scenes/build";
import { AssetRunPanel } from "@/components/landing/AssetRunPanel";
import { BuildingOverlay } from "@/components/landing/BuildingOverlay";
import { useAssetRun, type AssetStep } from "@/lib/useAssetRun";
import { apiFetch } from "@/lib/api-client";
import { bgPreset } from "@/lib/landingCreative";
import { compressImage, shrinkPng } from "@/lib/imageCompress";
import { sliceIconGrid } from "@/lib/spriteSlice";
import { EMAIL_HERO_PRICE_CREDITS, SLOT_SYMBOLS_PRICE_CREDITS } from "@/lib/credit-estimate";

type MobileTab = "templates" | "settings" | "result";
type Status = "idle" | "loading" | "done" | "error";

const ACCENT = "#d4ff3d";
/** Черновик формы плейбла в localStorage. */
const DRAFT_KEY = "dw_playable_draft";

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

export function PlayableGenApp() {
  const { isGuest, openGate } = useAuthGate();
  const [mechanic, setMechanic] = useState<PlayableMechanic>("slot");
  /** Выбрана премиум-сцена — вместо конструктора открыт её редактор. */
  const [scene, setScene] = useState<SceneId | null>(null);
  const [offer, setOffer] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [language, setLanguage] = useState("auto");
  const [alwaysWin, setAlwaysWin] = useState(true);
  const [ctaText, setCtaText] = useState("");
  /** Куда ведёт кнопка. Без неё MRAID-сеть плейбл не примет. */
  const [clickUrl, setClickUrl] = useState("");
  const [network, setNetwork] = useState<PlayableNetwork>("mraid");
  const [accent, setAccent] = useState(ACCENT);
  /** Темы для ИИ-оформления: фон и символы слота / Match-3. */
  const [bgTheme, setBgTheme] = useState("");
  const [symbolTheme, setSymbolTheme] = useState("");
  const [bgImage, setBgImage] = useState("");
  const [symbolImages, setSymbolImages] = useState<string[]>([]);
  const applyBrief = (f: Record<string, string>) => {
    if (f.subject) setOffer(f.subject);
    if (f.brand) setBrandName(f.brand);
    if (f.ctaText) setCtaText(f.ctaText);
  };
  const [duration, setDuration] = useState<"short" | "medium">("short");
  const [ratio, setRatio] = useState("9:16");

  const [reels, setReels] = useState(3);
  const [customSymbols, setCustomSymbols] = useState(false);
  const [slotSymbols, setSlotSymbols] = useState<string[]>(["", "", ""]);
  const [wheelPrizes, setWheelPrizes] = useState<string[]>([
    "+50 фриспинов",
    "x2 к депозиту",
    "+100% бонус",
    "🎁 Подарок",
    "+20 фриспинов",
    "Джекпот",
  ]);
  const [scratchPrize, setScratchPrize] = useState("");
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<string[]>(["Да!", "Возможно", "Нет"]);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [match3Moves, setMatch3Moves] = useState(8);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<PlayableResult | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("mobile");
  const [mobileTab, setMobileTab] = useState<MobileTab>("templates");
  const [genId, setGenId] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [vp, setVp] = useState(() =>
    typeof window !== "undefined"
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 1280, h: 800 },
  );

  const [openSec, setOpenSec] = useState({
    offer: true,
    mechanic: false,
    look: false,
    format: false,
    brand: false,
    lang: false,
  });
  const toggleSec = (id: keyof typeof openSec) => setOpenSec((p) => ({ ...p, [id]: !p[id] }));

  const logoInputRef = useRef<HTMLInputElement>(null);
  const initedRef = useRef(false);
  // Пока черновик не прочитан, сохранять нельзя — иначе пустая форма затрёт его.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    document.title = "Плейбл-реклама — GenGO";
    const b = getBrandSettings();
    setBrandName(b.brand_name);
    setBrandLogo(b.brand_logo);
    setLanguage(b.language || "auto");

    // Черновик формы: раньше при перезагрузке терялось всё, кроме бренда.
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      if (d) {
        const str = (k: string, set: (v: string) => void) => {
          if (typeof d[k] === "string") set(d[k] as string);
        };
        const arr = (k: string, set: (v: string[]) => void) => {
          if (Array.isArray(d[k]) && (d[k] as unknown[]).every((x) => typeof x === "string")) set(d[k] as string[]);
        };
        if (PLAYABLE_MECHANICS.some((m) => m.id === d.mechanic)) setMechanic(d.mechanic as PlayableMechanic);
        str("offer", setOffer);
        str("ctaText", setCtaText);
        str("clickUrl", setClickUrl);
        if (d.network === "mraid" || d.network === "google") setNetwork(d.network);
        if (typeof d.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(d.accent)) setAccent(d.accent);
        if (typeof d.alwaysWin === "boolean") setAlwaysWin(d.alwaysWin);
        if (d.duration === "short" || d.duration === "medium") setDuration(d.duration);
        if (PLAYABLE_RATIOS.some((r) => r.id === d.ratio)) setRatio(d.ratio as string);
        if (typeof d.reels === "number" && [3, 4, 5].includes(d.reels)) setReels(d.reels);
        if (typeof d.customSymbols === "boolean") setCustomSymbols(d.customSymbols);
        arr("slotSymbols", setSlotSymbols);
        arr("wheelPrizes", setWheelPrizes);
        str("scratchPrize", setScratchPrize);
        str("quizQuestion", setQuizQuestion);
        arr("quizAnswers", setQuizAnswers);
        if (typeof d.quizCorrect === "number") setQuizCorrect(d.quizCorrect);
        if (typeof d.match3Moves === "number" && [5, 8, 12].includes(d.match3Moves)) setMatch3Moves(d.match3Moves);
        str("bgTheme", setBgTheme);
        str("symbolTheme", setSymbolTheme);
        str("bgImage", setBgImage);
        arr("symbolImages", setSymbolImages);
      }
    } catch {
      /* битый черновик — начинаем с чистой формы */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    const dirty = offer.trim() !== "" || result !== null;
    setUnsavedWork(dirty ? "playable" : null);
    return () => setUnsavedWork(null);
  }, [offer, result]);

  const confirm = useConfirm();

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fullscreen overlay: best-effort real browser fullscreen (gracefully falls
  // back to the viewport-filling in-app overlay when the Fullscreen API is
  // blocked, e.g. inside a sandboxed preview), plus Esc-to-exit and syncing
  // back when the user leaves native fullscreen from the browser chrome.
  const fsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fullscreen) return;
    fsRef.current?.requestFullscreen?.().catch(() => {});
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [fullscreen]);

  const selectMechanic = (id: PlayableMechanic) => {
    setMechanic(id);
    setScene(null);
    setMobileTab("settings");
  };
  const selectScene = (id: SceneId) => {
    setScene(id);
    setMobileTab("settings");
  };

  const wheelCount = wheelPrizes.map((p) => p.trim()).filter(Boolean).length;
  const quizCount = quizAnswers.map((a) => a.trim()).filter(Boolean).length;
  const mechanicValid = mechanic === "wheel" ? wheelCount >= 2 : mechanic === "quiz" ? quizCount >= 2 : true;
  const canGenerate =
    isGuest || (offer.trim().length > 0 && mechanicValid && status !== "loading");

  const sectionList = [
    { id: "offer", title: "Оффер", done: offer.trim().length > 0 },
    { id: "brand", title: "Бренд", done: true },
    { id: "lang", title: "Языки", done: true },
    { id: "mechanic", title: "Механика", done: mechanicValid },
    { id: "look", title: "Оформление", done: true },
    { id: "format", title: "Формат и результат", done: true },
  ];

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

  // generatePlayable is a promise (not a timer we can stop), so cancel is a
  // flag: on cancel we flip it, and the resolved result is discarded. Matches
  // Video's cancel affordance, which Playable was missing.
  const genCancelledRef = useRef(false);

  const cancelGenerate = () => {
    genCancelledRef.current = true;
    setStatus(result ? "done" : "idle");
    toast("Генерация отменена");
  };

  /**
   * Всё, из чего собирается плейбл, одним объектом — и для генерации, и для
   * пересборки после ассетов, и для выгрузки. preview: без подключений сети
   * (mraid.js, ExitApi) — в предпросмотре их нет, а кнопка должна открывать
   * ссылку обычной вкладкой.
   */
  const buildInput = (preview: boolean): PlayableInput => ({
    mechanic,
    offer,
    brandName,
    brandLogo,
    language,
    accent,
    alwaysWin,
    ctaText,
    duration,
    ratio,
    reels,
    // Символы от ИИ важнее ручных: их рисовали под этот оффер.
    slotSymbols: symbolImages.length ? symbolImages : customSymbols ? slotSymbols : [],
    wheelPrizes,
    scratchPrize,
    quizQuestion,
    quizAnswers,
    quizCorrect,
    match3Moves,
    clickUrl,
    network,
    bgImage,
    preview,
  });

  // Ассеты, сеть, ссылка и цвет не требуют «генерации» — готовый плейбл
  // пересобирается сразу, чтобы превью не показывало вчерашнее.
  useEffect(() => {
    if (!result) return;
    setResult({ html: buildPlayableHtml(buildInput(true)) });
    setGenId((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImage, symbolImages, network, clickUrl, accent]);

  // Черновик — с задержкой, чтобы не писать на каждую букву. Не влезли в
  // квоту с картинками — сохраняем без них: форма важнее оформления.
  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      const data = {
        mechanic, offer, ctaText, clickUrl, network, accent, alwaysWin, duration, ratio, reels,
        customSymbols, slotSymbols, wheelPrizes, scratchPrize, quizQuestion, quizAnswers, quizCorrect,
        match3Moves, bgTheme, symbolTheme, bgImage, symbolImages,
      };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch {
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, bgImage: "", symbolImages: [] }));
        } catch {
          /* приватный режим */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [
    restored, mechanic, offer, ctaText, clickUrl, network, accent, alwaysWin, duration, ratio, reels,
    customSymbols, slotSymbols, wheelPrizes, scratchPrize, quizQuestion, quizAnswers, quizCorrect,
    match3Moves, bgTheme, symbolTheme, bgImage, symbolImages,
  ]);

  /**
   * ИИ-оформление. Картинки встраиваются в файл плейбла — сети запрещают
   * внешние запросы, — поэтому сразу ужимаются: фон до 1080 px JPEG, символы
   * до 128 px PNG с прозрачностью.
   */
  const applyAsset = async (key: string, dataUrl: string) => {
    if (key === "bg") {
      const out = await compressImage(dataUrl, { maxWidth: 1080, maxBytes: 250 * 1024, background: "#000000" });
      setBgImage(out.dataUrl);
      return;
    }
    if (key === "symbols") {
      const tiles = await sliceIconGrid(dataUrl, 3, 2);
      setSymbolImages(await Promise.all(tiles.map((t) => shrinkPng(t, 128))));
    }
  };
  const assetRun = useAssetRun({ resumeKey: "dw_jobs_playable", apply: applyAsset });

  /** Сборка во вкладке — если очереди на сервере нет. */
  const runInTab = (route: string, body: Record<string, unknown>, key: string) => async () => {
    try {
      const res = await apiFetch(route, { method: "POST", json: body });
      const data = (await res.json()) as { imageUrl?: string; error?: string; detail?: string };
      if (!res.ok || !data.imageUrl) throw new Error([data.error, data.detail].filter(Boolean).join(" — ") || "Не удалось сгенерировать");
      await applyAsset(key, data.imageUrl);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сгенерировать");
      return false;
    }
  };

  const usesSymbols = mechanic === "slot" || mechanic === "match3";
  const assetSteps = (): AssetStep[] => {
    const theme = (bgTheme || offer).trim();
    const bgBody = { presetTemplate: bgPreset(theme), feature: "playable-bg", aspectRatio: ratio };
    const steps: AssetStep[] = [
      {
        id: "bg",
        label: "Фон плейбла",
        credits: EMAIL_HERO_PRICE_CREDITS,
        blocking: true,
        run: runInTab("/api/generate-email-hero", bgBody, "bg"),
        server: { route: "/api/generate-email-hero", body: bgBody },
      },
    ];
    if (usesSymbols) {
      const symBody = { prompt: (symbolTheme || offer).trim(), count: 6 };
      steps.push({
        id: "symbols",
        label: "Символы (6)",
        credits: SLOT_SYMBOLS_PRICE_CREDITS,
        run: runInTab("/api/generate-slot-symbols", symBody, "symbols"),
        server: { route: "/api/generate-slot-symbols", body: symBody },
      });
    }
    return steps;
  };
  const assetCredits = assetSteps().reduce((sum, st) => sum + st.credits, 0);

  const startAssets = () => {
    if (isGuest) {
      openGate();
      return;
    }
    if (!(bgTheme || offer).trim()) {
      toast.error("Опишите сцену для фона или заполните оффер");
      return;
    }
    void assetRun.start(assetSteps());
  };

  /**
   * Шаблон заменяет механику, оффер, настройки игры, цвет и темы оформления.
   * Бренд, ссылка по кнопке и сеть — данные кампании, их не трогаем.
   */
  const pickTemplate = async (t: PlayableTemplate) => {
    const hasAssets = !!bgImage || symbolImages.length > 0;
    if (offer.trim() || result || hasAssets) {
      const ok = await confirm({
        title: `Применить шаблон «${t.name}»?`,
        body:
          "Механика, оффер, настройки игры и цвет заменятся. Бренд, ссылка по кнопке и сеть останутся." +
          (hasAssets ? " Сгенерированные фон и символы сбросятся — они рисовались под прошлый оффер." : ""),
        confirmLabel: "Применить",
      });
      if (!ok) return;
    }
    setMechanic(t.mechanic);
    setOffer(t.offer);
    setCtaText(t.ctaText);
    setAccent(t.accent);
    setDuration(t.duration);
    setBgTheme(t.bgTheme);
    setSymbolTheme(t.symbolTheme ?? "");
    if (t.reels) setReels(t.reels);
    if (t.wheelPrizes) setWheelPrizes([...t.wheelPrizes]);
    if (t.scratchPrize !== undefined) setScratchPrize(t.scratchPrize);
    if (t.quizQuestion !== undefined) setQuizQuestion(t.quizQuestion);
    if (t.quizAnswers) setQuizAnswers([...t.quizAnswers]);
    if (t.quizCorrect !== undefined) setQuizCorrect(t.quizCorrect);
    if (t.match3Moves) setMatch3Moves(t.match3Moves);
    setCustomSymbols(false);
    setBgImage("");
    setSymbolImages([]);
    setMobileTab("settings");
  };

  const onGenerate = async () => {
    if (isGuest) {
      openGate();
      return;
    }
    if (offer.trim().length === 0) {
      toast.error("Заполните тематику / оффер");
      return;
    }
    if (!mechanicValid) {
      toast.error(mechanic === "wheel" ? "Добавьте минимум 2 сектора" : "Добавьте минимум 2 варианта ответа");
      return;
    }
    persistBrand();
    genCancelledRef.current = false;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await generatePlayable(buildInput(true));
      if (genCancelledRef.current) return;
      setResult(res);
      setGenId((n) => n + 1);
      setStatus("done");
      setMobileTab("result");
    } catch (e) {
      if (genCancelledRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : "");
      setStatus("error");
    }
  };

  const net = PLAYABLE_NETWORKS.find((n) => n.id === network) ?? PLAYABLE_NETWORKS[0];
  // Вес выгрузки считаем от того, что реально уйдёт в сеть, а не от превью.
  const exportBytes = useMemo(
    () => (result ? new Blob([buildPlayableHtml(buildInput(false))]).size : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} МБ`;

  const download = async () => {
    if (!result) return;
    // MRAID-сеть открывает ссылку из файла: без неё кнопка мёртвая, и сеть
    // плейбл отклонит. У Google ссылка живёт в настройках объявления.
    if (network === "mraid" && !clickUrl.trim()) {
      toast.error("Укажите ссылку по кнопке — без неё MRAID-сеть не примет плейбл");
      setOpenSec((p) => ({ ...p, format: true }));
      return;
    }
    const html = buildPlayableHtml(buildInput(false));
    let blob: Blob;
    let name: string;
    if (network === "google") {
      // Google принимает HTML5-объявления только архивом с index.html.
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("index.html", html);
      blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      name = `playable-${mechanic}-google.zip`;
    } else {
      blob = new Blob([html], { type: "text/html;charset=utf-8" });
      name = `playable-${mechanic}-mraid.html`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (blob.size > net.limit) {
      toast.warning(`Файл ${mb(blob.size)} — больше лимита сети (${mb(net.limit)}). Уберите фон или символы.`);
    } else {
      toast.success(`Плейбл скачан для «${net.label}» · ${mb(blob.size)}`);
    }
  };

  const openInNewTab = () => {
    if (!result) return;
    const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const getCode = async () => {
    const f = frame();
    const snippet = `<iframe src="playable.html" width="${f.w}" height="${f.h}" style="border:0" allowfullscreen></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("HTML5-код для вставки скопирован");
    } catch {
      toast("HTML5-код для вставки", { description: snippet });
    }
  };

  const removeResult = async () => {
    if (result && !(await confirm({ title: "Удалить готовый плейбл?", body: "Действие необратимо.", destructive: true, confirmLabel: "Удалить" }))) return;
    setResult(null);
    setStatus("idle");
    setMobileTab("settings");
    toast("Плейбл удалён");
  };

  const regenerate = async () => {
    if (result && !(await confirm({ title: "Перегенерировать?", body: "Текущий плейбл будет заменён.", confirmLabel: "Перегенерировать" }))) return;
    onGenerate();
  };

  function frame() {
    const [rw, rh] = ratio.split(":").map(Number);
    if (rw === rh) {
      const s = previewMode === "mobile" ? 300 : 360;
      return { w: s, h: s };
    }
    if (rh > rw) {
      const h = previewMode === "mobile" ? 520 : 560;
      return { w: Math.round((h * rw) / rh), h };
    }
    const w = previewMode === "mobile" ? 360 : 520;
    return { w, h: Math.round((w * rh) / rw) };
  }
  const f = frame();

  // Fullscreen sizing: the generated game uses fixed-px elements, so simply
  // enlarging the iframe would leave a tiny game in a big void. Instead we
  // render it at its natural phone-ish design size and CSS-scale it up to fill
  // the screen while preserving the chosen aspect ratio.
  function fsFrame() {
    const [rw, rh] = ratio.split(":").map(Number);
    const base = 360;
    let baseW: number;
    let baseH: number;
    if (rw === rh) {
      baseW = base;
      baseH = base;
    } else if (rh > rw) {
      baseW = base;
      baseH = Math.round((base * rh) / rw);
    } else {
      baseH = base;
      baseW = Math.round((base * rw) / rh);
    }
    const availW = Math.max(1, vp.w - 32);
    const availH = Math.max(1, vp.h - 88);
    const scale = Math.min(availW / baseW, availH / baseH);
    return { baseW, baseH, scale };
  }
  const fs = fullscreen ? fsFrame() : null;

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section="playable" />
      {/* Fill exactly the viewport below the sticky 4rem header so the columns
          never push the page into a scroll — the left mechanics column stays
          fixed; only the middle settings + result columns scroll internally. */}
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">Плейбл-реклама</h1>

        <div className={`lg:contents ${mobileTab !== "templates" ? "max-lg:hidden" : ""}`}>
          <MechanicSidebar value={scene ? null : mechanic} onSelect={selectMechanic} scene={scene} onSelectScene={selectScene} />
        </div>

        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none lg:h-full lg:flex-[4] lg:rounded-2xl lg:border ${
            mobileTab !== "settings" ? "max-lg:hidden" : ""
          } ${scene ? "hidden" : ""}`}
        >
          <div className="flex items-center gap-3 px-2 pb-2 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("templates")}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <SectionDots sections={sectionList} />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              <PlayableTemplatePicker onPick={(t) => void pickTemplate(t)} />
              <BriefUploader
                product="playable"
                onApply={applyBrief}
                onGenerate={(r) => {
                  applyBrief(r.fields);
                  if (r.generationPrompt && !r.fields.subject) setOffer(r.generationPrompt);
                }}
              />
              <SettingsSection
                title="Тематика / оффер"
                required
                done={offer.trim().length > 0}
                open={openSec.offer}
                onToggle={() => toggleSec("offer")}
              >
                <textarea
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  rows={2}
                  className="min-h-[80px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                  placeholder="Например: приветственный бонус 100% + 200 фриспинов"
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
                          className="h-20 w-full rounded-md border border-border bg-white object-contain p-1"
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
                        className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border ds-caption hover:border-foreground/40 hover:text-foreground/80"
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
                      onChange={(e) => compressImageFile(e.target.files?.[0] ?? null, setBrandLogo, 256)}
                    />
                  </div>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Название бренда / проекта"
                    className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  />
                </div>
              </SettingsSection>

              <SettingsSection
                title="Языки"
                done
                open={openSec.lang}
                onToggle={() => toggleSec("lang")}
              >
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  aria-label="Язык плейбла"
                  className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                >
                  {CREATIVE_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 ds-caption">
                  Язык текста в самом плейбле — не связан с языком интерфейса.
                </p>
              </SettingsSection>

              <SettingsSection
                title={`Механика · ${PLAYABLE_MECHANICS.find((m) => m.id === mechanic)?.label ?? ""}`}
                done={mechanicValid}
                open={openSec.mechanic}
                onToggle={() => toggleSec("mechanic")}
              >

                {mechanic === "slot" ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1.5 block ds-label">Количество барабанов</label>
                      <div className="flex gap-2">
                        {[3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setReels(n)}
                            className={`h-11 flex-1 rounded-lg border text-sm font-medium transition ${
                              reels === n
                                ? "border-accent-green bg-accent-green/10 text-accent-green"
                                : "border-border text-foreground/70 hover:bg-white/5"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Свои символы</p>
                        <p className="ds-caption">Иначе — дефолтные (🍒 ⭐ 7️⃣)</p>
                      </div>
                      <Switch checked={customSymbols} onChange={setCustomSymbols} />
                    </div>
                    {customSymbols ? (
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((i) => (
                          <IconUpload
                            key={i}
                            value={slotSymbols[i] || ""}
                            onFile={(file) =>
                              compressImageFile(file, (v) =>
                                setSlotSymbols((arr) => arr.map((x, j) => (j === i ? v : x))), 128,
                              )
                            }
                            onClear={() =>
                              setSlotSymbols((arr) => arr.map((x, j) => (j === i ? "" : x)))
                            }
                            label={`Символ ${i + 1}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {mechanic === "wheel" ? (
                  <div className="flex flex-col gap-2">
                    <label className="ds-label">Секторы и призы ({wheelCount})</label>
                    {wheelPrizes.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={p}
                          onChange={(e) =>
                            setWheelPrizes((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                          }
                          placeholder={`Приз ${i + 1}`}
                          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                        />
                        <button
                          type="button"
                          onClick={() => setWheelPrizes((arr) => arr.filter((_, j) => j !== i))}
                          disabled={wheelPrizes.length <= 2}
                          aria-label="Убрать сектор"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWheelPrizes((arr) => [...arr, ""])}
                      disabled={wheelPrizes.length >= 8}
                      className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-white/5 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                      Добавить сектор
                    </button>
                  </div>
                ) : null}

                {mechanic === "scratch" ? (
                  <div>
                    <label className="mb-1.5 block ds-label">Текст приза под слоем</label>
                    <input
                      type="text"
                      value={scratchPrize}
                      onChange={(e) => setScratchPrize(e.target.value)}
                      placeholder="Например: +100 фриспинов!"
                      className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                    />
                    <p className="mt-2 ds-caption">Пусто — покажем текст оффера.</p>
                  </div>
                ) : null}

                {mechanic === "quiz" ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1.5 block ds-label">Вопрос</label>
                      <input
                        type="text"
                        value={quizQuestion}
                        onChange={(e) => setQuizQuestion(e.target.value)}
                        placeholder="Например: Хотите забрать бонус?"
                        className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="ds-label">Варианты ответа ({quizCount})</label>
                      {quizAnswers.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQuizCorrect(i)}
                            aria-label="Правильный ответ"
                            title="Отметить правильным"
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                              quizCorrect === i
                                ? "border-accent-green bg-accent-green text-on-accent"
                                : "border-border text-transparent hover:border-foreground/40"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="text"
                            value={a}
                            onChange={(e) =>
                              setQuizAnswers((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                            }
                            placeholder={`Вариант ${i + 1}`}
                            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setQuizAnswers((arr) => arr.filter((_, j) => j !== i));
                              setQuizCorrect((c) => (c >= i && c > 0 ? c - 1 : c));
                            }}
                            disabled={quizAnswers.length <= 2}
                            aria-label="Убрать вариант"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setQuizAnswers((arr) => [...arr, ""])}
                        disabled={quizAnswers.length >= 5}
                        className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-white/5 disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                        Добавить вариант
                      </button>
                      <p className="ds-caption">Зелёная галочка — правильный ответ (ведёт к офферу).</p>
                    </div>
                  </div>
                ) : null}

                {mechanic === "match3" ? (
                  <div>
                    <label className="mb-1.5 block ds-label">Ходов до результата</label>
                    <div className="flex gap-2">
                      {[5, 8, 12].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMatch3Moves(n)}
                          className={`h-11 flex-1 rounded-lg border text-sm font-medium transition ${
                            match3Moves === n
                              ? "border-accent-green bg-accent-green/10 text-accent-green"
                              : "border-border text-foreground/70 hover:bg-white/5"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </SettingsSection>

              <SettingsSection
                title="Оформление"
                done
                open={openSec.look}
                onToggle={() => toggleSec("look")}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      aria-label="Акцентный цвет плейбла"
                      className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[7px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-[7px] [&::-moz-color-swatch]:border-0"
                    />
                    <span className="ds-caption">Акцент — кнопки, указатель колеса, множитель.</span>
                  </div>

                  <div>
                    <label className="mb-1.5 block ds-label">Сцена для фона</label>
                    <textarea
                      value={bgTheme}
                      onChange={(e) => setBgTheme(e.target.value)}
                      rows={2}
                      className="min-h-[64px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green"
                      placeholder="Пусто — возьмём оффер. Например: вечерний зал казино, золото и неон"
                    />
                  </div>

                  {usesSymbols ? (
                    <div>
                      <label className="mb-1.5 block ds-label">Тема символов</label>
                      <input
                        type="text"
                        value={symbolTheme}
                        onChange={(e) => setSymbolTheme(e.target.value)}
                        className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                        placeholder="Например: драгоценные камни разных цветов"
                      />
                    </div>
                  ) : null}

                  {bgImage || symbolImages.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {bgImage ? (
                        <span className="flex items-center gap-1.5">
                          <img src={bgImage} alt="Фон" className="h-12 w-8 rounded border border-border object-cover" />
                          <button
                            type="button"
                            onClick={() => setBgImage("")}
                            className="text-xs text-muted-foreground transition hover:text-foreground"
                          >
                            Убрать фон
                          </button>
                        </span>
                      ) : null}
                      {symbolImages.length ? (
                        <span className="flex items-center gap-1">
                          {symbolImages.map((src, i) => (
                            <img key={i} src={src} alt="" className="h-7 w-7 rounded bg-white/5 object-contain" />
                          ))}
                          <button
                            type="button"
                            onClick={() => setSymbolImages([])}
                            className="ml-1 text-xs text-muted-foreground transition hover:text-foreground"
                          >
                            Убрать
                          </button>
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <AssetRunPanel
                    steps={assetRun.steps}
                    running={assetRun.running}
                    notEnough={assetRun.notEnough}
                    credits={assetCredits}
                    onStart={startAssets}
                    onCancel={assetRun.cancel}
                  />
                  <p className="ds-caption">
                    Картинки встраиваются в файл плейбла: сети не разрешают внешние запросы. Мы
                    сразу ужимаем их, чтобы файл уложился в лимит.
                  </p>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Формат и результат"
                done
                open={openSec.format}
                onToggle={() => toggleSec("format")}
              >
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Результат всегда выигрышный</p>
                  <p className="mt-0.5 ds-caption">Игрок всегда «выигрывает» — стимулирует переход</p>
                </div>
                <Switch checked={alwaysWin} onChange={setAlwaysWin} />
              </div>

              <div className="mt-4">
                <label className="mb-2 block ds-label">
                  Текст CTA на финальном экране{" "}
                  <span className="text-muted-foreground">(опционально)</span>
                </label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  maxLength={32}
                  className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  placeholder="Забрать бонус · Играть · Установить"
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block ds-label">Куда выгружаем</label>
                <div className="flex gap-2">
                  {PLAYABLE_NETWORKS.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setNetwork(n.id)}
                      aria-pressed={network === n.id}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        network === n.id
                          ? "border-accent-green bg-accent-green/10 text-accent-green"
                          : "border-border text-foreground/70 hover:bg-white/5"
                      }`}
                    >
                      <span className="block font-medium">{n.label}</span>
                      <span className="mt-0.5 block ds-caption">{n.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block ds-label">
                  Ссылка по кнопке{network === "mraid" ? " *" : ""}
                </label>
                <input
                  type="url"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  placeholder="https://… — стор, лендинг или трекинговая ссылка"
                />
                <p className="mt-1.5 ds-caption">
                  {network === "google"
                    ? "Для Google необязательно: ссылку перехода задаёте в настройках объявления, кнопка вызовет её сама. Здесь — только для проверки в превью."
                    : "Обязательно: по ней MRAID-контейнер откроет стор или лендинг. В превью кнопка откроет её в новой вкладке."}
                </p>
              </div>

              <div className="mt-4">
                <label className="mb-2 block ds-label">Длительность взаимодействия</label>
                <div className="flex gap-2">
                  {PLAYABLE_DURATIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDuration(d.id)}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        duration === d.id
                          ? "border-accent-green bg-accent-green/10 text-accent-green"
                          : "border-border text-foreground/70 hover:bg-white/5"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block ds-label">Соотношение сторон</label>
                <div className="flex gap-2">
                  {PLAYABLE_RATIOS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRatio(r.id)}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        ratio === r.id
                          ? "border-accent-green bg-accent-green/10 text-accent-green"
                          : "border-border text-foreground/70 hover:bg-white/5"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              </SettingsSection>
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-panel p-3 lg:hidden">
            <button
              type="button"
              onClick={regenerate}
              disabled={!canGenerate}
              className="min-h-12 w-full rounded-lg bg-accent-green px-8 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Генерация…" : result ? "Сгенерировать заново" : "Сгенерировать"}
            </button>
            {offer.trim().length === 0 && status !== "loading" ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Заполните «Тематика / оффер», чтобы сгенерировать
              </p>
            ) : null}
          </div>
        </section>

        <div
          className={`flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none max-lg:p-4 lg:h-full lg:flex-[4] ${
            mobileTab !== "result" ? "max-lg:hidden" : ""
          } ${scene ? "hidden" : ""}`}
        >
          {status !== "loading" ? (
            <button
              type="button"
              onClick={() => setMobileTab("settings")}
              className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
          ) : null}

          <button
            type="button"
            onClick={regenerate}
            disabled={!canGenerate}
            className="w-full rounded-lg bg-accent-green px-8 py-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 max-lg:hidden"
          >
            {status === "loading" ? "Генерация…" : result ? "Сгенерировать заново" : "Сгенерировать"}
          </button>
          {offer.trim().length === 0 && status !== "loading" ? (
            <p className="-mt-1 text-center text-xs text-muted-foreground max-lg:hidden">
              Заполните «Тематика / оффер», чтобы сгенерировать
            </p>
          ) : null}

          {status === "loading" ? (
            <GenerationProgress
              title="Собираем плейбл…"
              subtitle="Настраиваем механику и анимацию"
              onCancel={cancelGenerate}
            />
          ) : status === "error" ? (
            <GenerationErrorCard
              message={errorMsg}
              onRetry={onGenerate}
              onDismiss={() => {
                setStatus("idle");
                setErrorMsg("");
              }}
            />
          ) : result ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("desktop")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                      previewMode === "desktop"
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    Десктоп
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("mobile")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                      previewMode === "mobile"
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                    Мобайл
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFullscreen(true)}
                    aria-label="На весь экран"
                    title="Открыть плейбл на весь экран"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:h-11 max-sm:w-11 max-sm:px-0"
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span className="max-sm:hidden">На весь экран</span>
                  </button>
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ещё"
                      title="Ещё"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:h-11 max-sm:w-11"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-52 rounded-xl border-border bg-popover p-1.5 text-foreground"
                  >
                    <DropdownMenuItem
                      onClick={regenerate}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                    >
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      Перегенерировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={openInNewTab}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                    >
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      Открыть в новой вкладке
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      onClick={removeResult}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="relative flex justify-center overflow-hidden rounded-2xl border border-border bg-card p-3">
                {assetRun.running ? <BuildingOverlay steps={assetRun.steps} /> : null}
                <div
                  className="overflow-hidden rounded-2xl border-[6px] border-[#1c2417] bg-black shadow-xl transition-all"
                  style={{ width: f.w, maxWidth: "100%" }}
                >
                  <iframe
                    key={`${genId}-${previewMode}`}
                    srcDoc={result.html}
                    title="Интерактивный плейбл"
                    // allow-popups — чтобы кнопка в превью открыла ссылку. Без
                    // allow-same-origin песочница по-прежнему не видит нашу вкладку.
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                    className="block w-full bg-black"
                    style={{ height: f.h, border: 0 }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void download()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
                >
                  <Download className="h-4 w-4" />
                  {network === "google" ? "Скачать ZIP для Google" : "Скачать для MRAID"}
                </button>
                <button
                  type="button"
                  onClick={getCode}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm transition hover:bg-white/5"
                >
                  <Code2 className="h-4 w-4" />
                  Получить код
                </button>
              </div>
              <p className={`text-center ds-caption ${exportBytes > net.limit ? "text-amber-400" : ""}`}>
                Файл для «{net.label}»: {mb(exportBytes)} из {mb(net.limit)}
                {exportBytes > net.limit ? " — больше лимита, сеть его не примет" : ""}
              </p>
              <p className="text-center ds-caption">
                Интерактивное превью — можно играть прямо здесь, кнопка откроет ссылку в новой вкладке.
              </p>
            </div>
          ) : (
            <EmptyResult
              icon={<Gamepad2 className="h-6 w-6" />}
              title="Здесь появится ваш плейбл"
              hint="Выберите механику, заполните оффер и нажмите «Сгенерировать». Превью будет интерактивным — прямо в нём можно поиграть."
            />
          )}
        </div>

        {scene ? (
          <SceneStudio
            scene={scene}
            brandName={brandName}
            brandLogo={brandLogo}
            hiddenOnMobile={mobileTab === "templates"}
            onBack={() => setMobileTab("templates")}
          />
        ) : null}
      </div>

      {/* Fullscreen playable overlay — opens the interactive slot / wheel / etc.
          at full size. Best-effort native browser fullscreen; always at least a
          viewport-filling in-app overlay. The game is rendered at its design
          size and CSS-scaled up to fit (fixed-px game elements otherwise stay
          tiny). Esc or «Свернуть» exits. */}
      {fullscreen && result && fs ? (
        <div
          ref={fsRef}
          role="dialog"
          aria-modal="true"
          aria-label="Плейбл на весь экран"
          className="fixed inset-0 z-[90] flex flex-col bg-[var(--bg-void)]"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-sm font-medium text-white/80">
              Плейбл · {PLAYABLE_MECHANICS.find((m) => m.id === mechanic)?.label ?? ""}
            </span>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
            >
              <Minimize2 className="h-4 w-4" />
              Свернуть
              <span className="ml-1 hidden text-xs text-white/60 sm:inline">Esc</span>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
            <div
              className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
              style={{
                width: Math.round(fs.baseW * fs.scale),
                height: Math.round(fs.baseH * fs.scale),
              }}
            >
              <iframe
                key={`fs-${genId}`}
                srcDoc={result.html}
                title="Плейбл на весь экран"
                sandbox="allow-scripts"
                className="block bg-black"
                style={{
                  width: fs.baseW,
                  height: fs.baseH,
                  transform: `scale(${fs.scale})`,
                  transformOrigin: "top left",
                  border: 0,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
        checked ? "bg-accent-green" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${
          checked ? "translate-x-4 bg-[color:var(--text-on-accent)]" : "translate-x-0 bg-white"
        }`}
      />
    </button>
  );
}

function IconUpload({
  value,
  onFile,
  onClear,
  label,
}: {
  value: string;
  onFile: (f: File | null) => void;
  onClear: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt={label}
            className="aspect-square w-full rounded-md border border-border bg-white object-contain p-1"
          />
          <button
            type="button"
            onClick={onClear}
            aria-label="Удалить"
            className="absolute -right-2 -top-2 rounded-full bg-foreground p-1 text-background hover:opacity-80 after:absolute after:-inset-2.5 after:content-['']"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border ds-micro hover:border-foreground/40 hover:text-foreground/80"
        >
          <Upload size={14} />
          {label}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

const ANIM_CSS = `
@keyframes pl-roll{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}
@keyframes pl-spin{to{transform:rotate(360deg)}}
@keyframes pl-shine{0%{transform:translateX(-140%) skewX(-18deg)}100%{transform:translateX(240%) skewX(-18deg)}}
@keyframes pl-q{0%,100%{opacity:.35}35%{opacity:1}}
@keyframes pl-pop{0%,100%{transform:scale(.7);opacity:.45}50%{transform:scale(1);opacity:1}}
.pl-anim{width:56px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;background:#0f140e;display:flex;align-items:center;justify-content:center;position:relative}
.pl-reels{display:flex;gap:2px;height:100%;padding:5px}
.pl-reel{width:14px;overflow:hidden;border-radius:3px;background:#191f13}
.pl-strip{display:flex;flex-direction:column;font-size:11px;line-height:16px;animation:pl-roll 1.1s linear infinite}
.pl-wheel{width:40px;height:40px;border-radius:50%;border:3px solid #2c3424;background:conic-gradient(#2f3a20 0 90deg,#20271a 90deg 180deg,#2f3a20 180deg 270deg,#20271a 270deg 360deg);animation:pl-spin 2.4s linear infinite}
.pl-scratch{width:40px;height:28px;border-radius:6px;background:#2f3a20;position:relative;overflow:hidden;color:var(--accent-green);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}
.pl-scratch:after{content:'';position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:pl-shine 1.6s linear infinite}
.pl-quiz{display:flex;flex-direction:column;gap:3px;width:36px}
.pl-qbar{height:7px;border-radius:3px;background:#2f3a20}
.pl-qbar:nth-child(1){animation:pl-q 1.5s infinite}
.pl-qbar:nth-child(2){animation:pl-q 1.5s .3s infinite}
.pl-qbar:nth-child(3){animation:pl-q 1.5s .6s infinite}
.pl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.pl-dot{width:10px;height:10px;border-radius:3px;background:var(--accent-green)}
.pl-grid span:nth-child(odd){animation:pl-pop 1.4s infinite}
.pl-grid span:nth-child(even){animation:pl-pop 1.4s .5s infinite}
@keyframes pl-fly{0%{transform:translate(-9px,11px) rotate(6deg)}70%{transform:translate(9px,-11px) rotate(10deg)}100%{transform:translate(-9px,11px) rotate(6deg)}}
.pl-crash{font-size:22px;animation:pl-fly 1.3s ease-in-out infinite}
`;

function MechanicAnim({ mechanic }: { mechanic: PlayableMechanic }) {
  if (mechanic === "slot") {
    return (
      <div className="pl-anim">
        <div className="pl-reels">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pl-reel">
              <div className="pl-strip" style={{ animationDelay: `${i * 0.22}s` }}>
                <span>🍒</span>
                <span>⭐</span>
                <span>7️⃣</span>
                <span>🍒</span>
                <span>⭐</span>
                <span>7️⃣</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (mechanic === "wheel") {
    return (
      <div className="pl-anim">
        <div className="pl-wheel" />
      </div>
    );
  }
  if (mechanic === "crash") {
    return (
      <div className="pl-anim">
        <div className="pl-crash">🚀</div>
      </div>
    );
  }
  if (mechanic === "scratch") {
    return (
      <div className="pl-anim">
        <div className="pl-scratch">★</div>
      </div>
    );
  }
  if (mechanic === "quiz") {
    return (
      <div className="pl-anim">
        <div className="pl-quiz">
          <span className="pl-qbar" />
          <span className="pl-qbar" />
          <span className="pl-qbar" />
        </div>
      </div>
    );
  }
  return (
    <div className="pl-anim">
      <div className="pl-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="pl-dot" />
        ))}
      </div>
    </div>
  );
}

const SCENE_ICONS = { safe: Vault, wheel: FerrisWheel, scratch: Ticket } as const;

function MechanicSidebar({
  value,
  onSelect,
  scene,
  onSelectScene,
}: {
  value: PlayableMechanic | null;
  onSelect: (id: PlayableMechanic) => void;
  scene: SceneId | null;
  onSelectScene: (id: SceneId) => void;
}) {
  // Single category for now → show every mechanic at once. The "Все" collapse
  // (below) is kept but disabled; restore it once mechanics are grouped into
  // multiple categories worth collapsing.
  // const [expanded, setExpanded] = useState(false);
  // const shown = expanded ? PLAYABLE_MECHANICS : PLAYABLE_MECHANICS.slice(0, 3);
  const shown = PLAYABLE_MECHANICS;
  return (
    <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:min-w-[220px] lg:flex-[2] lg:rounded-2xl lg:border">
      <style>{ANIM_CSS}</style>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="ds-h4">Игровые механики</h2>
        {/* "Все" hidden until there are multiple mechanic categories to group:
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-full bg-[var(--bg-surface-hover)] px-3 py-1 text-sm font-medium text-accent-green transition hover:bg-white/10"
        >
          {expanded ? "Свернуть" : "Все"}
        </button>
        */}
      </div>
      {/* Desktop: mechanics column stays fixed — no internal scroll (the list
          fits), only the middle settings column scrolls. Mobile: full-screen
          tab, keep scrollable. */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-accent-green">Премиум-сцены</p>
          {SCENES.map((sc) => {
            const active = scene === sc.id;
            const Icon = SCENE_ICONS[sc.id];
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectScene(sc.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  active
                    ? "border-accent-green bg-accent-green/5 shadow-[0_0_40px_rgba(198,255,61,0.14)]"
                    : "border-border bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#5a3410] to-[#1d0f07] text-[#ffcf6a]">
                  <Icon className="h-7 w-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {sc.label}
                    {active ? <Check className="h-3.5 w-3.5 text-accent-green" /> : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block ds-caption">{sc.description}</span>
                </span>
              </button>
            );
          })}
          <p className="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Конструктор</p>
          {shown.map((m) => {
            const active = value === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  active
                    ? "border-accent-green bg-accent-green/5 shadow-[0_0_40px_rgba(198,255,61,0.14)]"
                    : "border-border bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <MechanicAnim mechanic={m.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {m.label}
                    {active ? <Check className="h-3.5 w-3.5 text-accent-green" /> : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block ds-caption">{m.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
