"use client";

// Редактор сценарных плейблов («Сейф», «Колесо», «Скретч-карта»). Сцена —
// готовая хореография из public/playable; здесь задаются тексты, сумма,
// бренд, ссылка и сеть, а ИИ по желанию рисует фон и награду для попапа.
// Превью — тот же файл, что уйдёт в сеть, только без сетевых скриптов.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  ImageIcon,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/SettingsSection";
import { AssetRunPanel } from "@/components/landing/AssetRunPanel";
import { BuildingOverlay } from "@/components/landing/BuildingOverlay";
import { useConfirm } from "@/components/ui/confirm";
import { useAuthGate } from "@/components/AuthGate";
import { useAssetRun, type AssetStep } from "@/lib/useAssetRun";
import { apiFetch } from "@/lib/api-client";
import { shrinkPng } from "@/lib/imageCompress";
import { sliceIconGrid } from "@/lib/spriteSlice";
import { PLAYABLE_ASSET_PRICE_CREDITS, SLOT_SYMBOLS_PRICE_CREDITS } from "@/lib/credit-estimate";
import { prepareBackground, prepareSprite, prepareWheelFrame, type FrameArt } from "@/lib/scenes/art";
import { NETWORK_BY_ID, PLAYABLE_NETWORKS, type PlayableNetwork } from "@/lib/scenes/networks";
import { packageFor } from "@/lib/scenes/export";
import { browserLoader, buildScenePlayable, type SceneConfig, type SceneId, type SceneLoader } from "@/lib/scenes/build";
import {
  DEFAULT_WIN_INDEX,
  SCENE_LANGS,
  SCENE_STYLES,
  sceneMeta,
  scenePartsFor,
  scenePreset,
  sceneStyle,
  type SceneLang,
  type ScenePart,
} from "@/lib/scenes/presets";

const INPUT = "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
const AREA = "w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green";
const CHIP_ON = "border-accent-green bg-accent-green/10 text-accent-green";
const CHIP_OFF = "border-border text-foreground/70 hover:bg-white/5";

const draftKey = (scene: SceneId) => `dw_scene_draft_${scene}`;

/** Файлы сцены одинаковы для всех сборок — грузим один раз за сессию. */
const cache = new Map<string, Promise<string>>();
const cachedLoader: SceneLoader = {
  text: (p) => {
    const key = `t:${p}`;
    if (!cache.has(key)) cache.set(key, browserLoader.text(p).catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key)!;
  },
  base64: (p) => {
    const key = `b:${p}`;
    if (!cache.has(key)) cache.set(key, browserLoader.base64(p).catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key)!;
  },
};

type Draft = {
  lang: SceneLang;
  text: Record<string, string>;
  amount: number;
  unit: string;
  legal: string;
  prizes: string[];
  winIndex: number;
  brandName: string;
  logo: string;
  clickUrl: string;
  /** Куда размещаем: по файлу на каждую площадку. */
  targets: PlayableNetwork[];
  /** Стиль сцены: промпт для всей ИИ-графики и палитра интерфейса. */
  style: string;
  /** Тема оформления — общая для всех деталей. */
  theme: string;
  /** Какие детали генерировать. */
  parts: Record<string, boolean>;
  bgImage: string;
  reward: string;
  /** Спрайты деталей по ключам из SCENE_PARTS; рама колеса — с радиусом. */
  art: Record<string, string | FrameArt>;
  /** Набор символов (6): [0] — выигрышный. */
  symbols: string[];
};

function freshDraft(scene: SceneId, lang: SceneLang, brandName: string, logo: string): Draft {
  const p = scenePreset(scene, lang);
  const meta = sceneMeta(scene);
  return {
    lang,
    text: p.text,
    amount: 500,
    unit: p.unit,
    legal: p.legal,
    prizes: p.prizes ?? [],
    winIndex: DEFAULT_WIN_INDEX,
    brandName,
    logo,
    clickUrl: "",
    targets: ["mraid"],
    style: "ruby",
    theme: meta.bgTheme,
    parts: {},
    bgImage: "",
    reward: "",
    art: {},
    symbols: [],
  };
}

function loadDraft(scene: SceneId, brandName: string, logo: string): Draft {
  const base = freshDraft(scene, "ru", brandName, logo);
  try {
    const raw = localStorage.getItem(draftKey(scene));
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      ...base,
      ...d,
      text: { ...base.text, ...(d.text ?? {}) },
      parts: { ...base.parts, ...(d.parts ?? {}) },
      art: d.art ?? {},
      symbols: d.symbols ?? [],
      // Черновики до общего стиля хранили его как wheelStyle.
      style: d.style ?? (d as { wheelStyle?: string }).wheelStyle ?? base.style,
      // Черновики до мультивыбора хранили одну сеть в network.
      targets: (Array.isArray(d.targets) ? d.targets : [(d as { network?: PlayableNetwork }).network ?? "mraid"]).filter((t) =>
        NETWORK_BY_ID.has(t),
      ),
    };
  } catch {
    return base;
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("read")));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} МБ`;

export function SceneStudio({
  scene,
  brandName,
  brandLogo,
  hiddenOnMobile,
  onBack,
}: {
  scene: SceneId;
  /** Бренд из основного генератора — стартовое значение для нового черновика. */
  brandName: string;
  brandLogo: string;
  hiddenOnMobile: boolean;
  onBack: () => void;
}) {
  const meta = sceneMeta(scene);
  const confirm = useConfirm();
  const { isGuest, openGate } = useAuthGate();

  const [d, setD] = useState<Draft>(() => freshDraft(scene, "ru", brandName, brandLogo));
  const [restored, setRestored] = useState(false);
  const [open, setOpen] = useState({ art: true, text: false, prize: false, brand: false, net: true });
  const [html, setHtml] = useState("");
  /** Вес HTML под каждую выбранную площадку. */
  const [sizes, setSizes] = useState<Partial<Record<PlayableNetwork, number>>>({});
  const [buildErr, setBuildErr] = useState("");
  const [replay, setReplay] = useState(0);
  /** Как смотреть превью: телефон (9:16) или десктоп (16:9, сцена по центру на размытом фоне). */
  const [view, setView] = useState<"mobile" | "desktop">("mobile");
  const [fullscreen, setFullscreen] = useState(false);
  const fsRef = useRef<HTMLDivElement>(null);

  // На весь экран: нативный fullscreen, если браузер даст, иначе — оверлей на
  // всё окно. Esc и выход из нативного режима закрывают оба.
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
  const logoInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setText = (k: string, v: string) => setD((p) => ({ ...p, text: { ...p.text, [k]: v } }));
  const toggle = (k: keyof typeof open) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  // Черновик — свой у каждой сцены.
  useEffect(() => {
    setD(loadDraft(scene, brandName, brandLogo));
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey(scene), JSON.stringify(d));
      } catch {
        // Квота: картинки — самое тяжёлое, без них черновик всё равно полезен.
        try {
          localStorage.setItem(draftKey(scene), JSON.stringify({ ...d, bgImage: "", reward: "", logo: "", art: {}, symbols: [] }));
        } catch {
          /* хранилище недоступно — работаем без черновика */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [d, restored, scene]);

  const config = (): SceneConfig => {
    const loc = SCENE_LANGS.find((l) => l.id === d.lang) ?? SCENE_LANGS[0];
    const prizes = d.prizes.map((p) => p.trim()).filter(Boolean);
    return {
      scene,
      text: d.text,
      amount: Number(d.amount) || 0,
      unit: d.unit,
      locale: loc.locale,
      clickUrl: d.clickUrl.trim(),
      legal: d.legal,
      brandName: d.brandName.trim(),
      logo: d.logo,
      bgImage: d.bgImage || undefined,
      reward: d.reward || undefined,
      art: d.art,
      symbols: d.symbols,
      palette: sceneStyle(d.style).palette,
      ui: sceneStyle(d.style).ui,
      prizes,
      winIndex: Math.min(d.winIndex, Math.max(0, prizes.length - 1)),
      lang: d.lang,
    };
  };

  // Превью и вес выгрузки пересобираются после паузы в наборе.
  useEffect(() => {
    if (!restored) return;
    let alive = true;
    const id = window.setTimeout(async () => {
      try {
        const cfg = config();
        const preview = await buildScenePlayable(cfg, { network: "web", preview: true, load: cachedLoader });
        const real = await Promise.all(
          d.targets.map(async (t) => [t, new Blob([await buildScenePlayable(cfg, { network: t, preview: false, load: cachedLoader })]).size] as const),
        );
        if (!alive) return;
        setHtml(preview);
        setSizes(Object.fromEntries(real));
        setBuildErr("");
      } catch (e) {
        if (alive) setBuildErr(e instanceof Error ? e.message : "Не удалось собрать сцену");
      }
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, restored, scene]);

  const changeLang = async (lang: SceneLang) => {
    if (lang === d.lang) return;
    const p = scenePreset(scene, d.lang);
    const edited =
      Object.keys(p.text).some((k) => (d.text[k] ?? "") !== p.text[k]) ||
      d.unit !== p.unit ||
      d.legal !== p.legal ||
      (scene === "wheel" && d.prizes.join("|") !== (p.prizes ?? []).join("|"));
    if (edited) {
      const ok = await confirm({
        title: "Сменить язык?",
        body: "Тексты, единица суммы, юр. текст и сектора колеса заменятся переводом. Ваши правки в них пропадут.",
        confirmLabel: "Сменить",
      });
      if (!ok) return;
    }
    const n = scenePreset(scene, lang);
    setD((prev) => ({ ...prev, lang, text: n.text, unit: n.unit, legal: n.legal, prizes: n.prizes ?? prev.prizes }));
  };

  const resetScene = async () => {
    const ok = await confirm({
      title: `Сбросить «${meta.label}»?`,
      body: "Тексты, сумма и картинки вернутся к исходным. Бренд, ссылка и сеть останутся.",
      confirmLabel: "Сбросить",
      destructive: true,
    });
    if (!ok) return;
    setD((p) => ({ ...freshDraft(scene, p.lang, p.brandName, p.logo), clickUrl: p.clickUrl, targets: p.targets }));
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Нужна картинка — PNG, JPG или SVG");
    if (file.size > 8 * 1024 * 1024) return toast.error("Файл больше 8 МБ");
    try {
      set("logo", await shrinkPng(await readFile(file), 560));
    } catch {
      toast.error("Не удалось прочитать картинку");
    }
  };

  // ---- ИИ-графика: генерация через серверную очередь или своя картинка
  const parts = scenePartsFor(scene);
  const partById = (id: string) => parts.find((p) => p.id === id);

  /** Довести картинку детали до сцены: обрезка, ужатие, у рамы — радиус. */
  const applyPart = async (part: ScenePart, dataUrl: string) => {
    switch (part.kind) {
      case "scene-bg": {
        const out = await prepareBackground(dataUrl);
        return setD((p) => ({ ...p, bgImage: out }));
      }
      case "reward": {
        const out = await prepareSprite(dataUrl, 600);
        return setD((p) => ({ ...p, reward: out }));
      }
      case "wheel-frame": {
        const frame = await prepareWheelFrame(dataUrl);
        return setD((p) => ({ ...p, art: { ...p.art, frame } }));
      }
      case "symbols": {
        // Сетка 3×2 одним вызовом → шесть иконок.
        const tiles = await sliceIconGrid(dataUrl, 3, 2);
        const symbols = await Promise.all(tiles.map((t) => prepareSprite(t, 256, true)));
        return setD((p) => ({ ...p, symbols }));
      }
      default: {
        const size = part.size ?? (part.kind === "wheel-pointer" ? 300 : part.kind === "wheel-hub" ? 320 : 420);
        const out = await prepareSprite(dataUrl, size, part.kind === "wheel-hub");
        return setD((p) => ({ ...p, art: { ...p.art, [part.id]: out } }));
      }
    }
  };
  const applyAsset = async (key: string, dataUrl: string) => {
    const part = partById(key);
    if (part) await applyPart(part, dataUrl);
  };
  const assetRun = useAssetRun({ resumeKey: "dw_jobs_scene", apply: applyAsset });

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

  const style = sceneStyle(d.style).prompt;
  const partImages = (part: ScenePart): string[] => {
    if (part.kind === "symbols") return d.symbols;
    if (part.id === "bg") return d.bgImage ? [d.bgImage] : [];
    if (part.id === "reward") return d.reward ? [d.reward] : [];
    const v = d.art[part.id];
    const src = typeof v === "string" ? v : v?.src;
    return src ? [src] : [];
  };
  const clearPart = (part: ScenePart) =>
    setD((p) => {
      if (part.kind === "symbols") return { ...p, symbols: [] };
      if (part.id === "bg") return { ...p, bgImage: "" };
      if (part.id === "reward") return { ...p, reward: "" };
      const art = { ...p.art };
      delete art[part.id];
      return { ...p, art };
    });

  /** Шаг генерации детали: символы — одной сеткой, остальное — своим роутом. */
  const stepFor = (part: ScenePart): AssetStep => {
    const theme = d.theme.trim();
    if (part.kind === "symbols") {
      const body = {
        prompt: [part.subject, `STYLE (shared by the whole game): ${style}.`, theme ? `THEME: ${theme}.` : ""].filter(Boolean).join(" "),
        count: 6,
      };
      return {
        id: part.id,
        label: part.label,
        credits: SLOT_SYMBOLS_PRICE_CREDITS,
        run: runInTab("/api/generate-slot-symbols", body, part.id),
        server: { route: "/api/generate-slot-symbols", body },
      };
    }
    const body = { kind: part.kind, style, theme, ...(part.subject ? { subject: part.subject } : {}) };
    return {
      id: part.id,
      label: part.label,
      credits: PLAYABLE_ASSET_PRICE_CREDITS,
      run: runInTab("/api/generate-playable-asset", body, part.id),
      server: { route: "/api/generate-playable-asset", body },
    };
  };
  const included = (part: ScenePart) => d.parts[part.id] !== false;
  const assetSteps = (): AssetStep[] => parts.filter(included).map(stepFor);
  const assetCredits = assetSteps().reduce((sum, st) => sum + st.credits, 0);
  const startAssets = () => {
    if (isGuest) return openGate();
    const steps = assetSteps();
    if (!steps.length) return toast.error("Отметьте хотя бы одну деталь");
    void assetRun.start(steps);
  };
  const generateOne = (part: ScenePart) => {
    if (isGuest) return openGate();
    if (assetRun.running) return toast("Дождитесь текущей генерации");
    void assetRun.start([stepFor(part)]);
  };
  /** Своя картинка вместо ИИ: для символов — до шести файлов. */
  const uploadPart = async (part: ScenePart, files: FileList | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024);
    if (!list.length) return toast.error("Нужна картинка до 8 МБ");
    try {
      if (part.kind === "symbols") {
        const symbols = await Promise.all(list.slice(0, 6).map(async (file) => prepareSprite(await readFile(file), 256, true)));
        setD((p) => ({ ...p, symbols }));
      } else {
        await applyPart(part, await readFile(list[0]));
      }
    } catch {
      toast.error("Не удалось прочитать картинку");
    }
  };

  // ---- выгрузка: по файлу на каждую выбранную площадку
  const needsUrl = d.targets.some((t) => NETWORK_BY_ID.get(t)?.needsUrl);
  const toggleTarget = (t: PlayableNetwork) =>
    setD((p) => ({
      ...p,
      // Порядок — как в списке площадок, чтобы файлы скачивались предсказуемо.
      targets: p.targets.includes(t)
        ? p.targets.filter((x) => x !== t)
        : PLAYABLE_NETWORKS.map((n) => n.id).filter((id) => id === t || p.targets.includes(id)),
    }));
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!d.targets.length) {
      setOpen((p) => ({ ...p, net: true }));
      return toast.error("Выберите, куда размещаем");
    }
    if (needsUrl && !d.clickUrl.trim()) {
      setOpen((p) => ({ ...p, net: true }));
      const names = d.targets.filter((t) => NETWORK_BY_ID.get(t)?.needsUrl).map((t) => NETWORK_BY_ID.get(t)!.label);
      return toast.error(`Укажите ссылку по кнопке — она нужна для: ${names.join(", ")}`);
    }
    setDownloading(true);
    try {
      const cfg = config();
      const base = `playable-${scene}`;
      const files = [];
      for (const t of d.targets) {
        const file = await buildScenePlayable(cfg, { network: t, preview: false, load: cachedLoader });
        files.push(await packageFor(t, file, base, meta.label));
      }
      // Браузер может один раз спросить разрешение на несколько загрузок — поэтому с паузой.
      for (const p of files) {
        const url = URL.createObjectURL(p.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = p.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        await new Promise((r) => setTimeout(r, 350));
      }
      const over = files.filter((p) => p.bytes > p.limit || /не примет|требует/.test(p.note ?? ""));
      over.forEach((p) => toast.warning(`${NETWORK_BY_ID.get(p.network)!.label}: ${mb(p.bytes)} — ${p.note ?? `больше лимита ${mb(p.limit)}`}. Уберите фон или награду.`));
      files.filter((p) => p.note && !over.includes(p)).forEach((p) => toast(`${NETWORK_BY_ID.get(p.network)!.label}: ${p.note}`));
      toast.success(files.length === 1 ? `Скачан файл для «${NETWORK_BY_ID.get(files[0].network)!.label}»` : `Скачано файлов: ${files.length} — по одному на площадку`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось собрать плейбл");
    } finally {
      setDownloading(false);
    }
  };

  const prizesOk = scene !== "wheel" || d.prizes.filter((p) => p.trim()).length >= 4;
  const textDone = useMemo(() => meta.fields.every((f) => (d.text[f.key] ?? "").trim()), [meta, d.text]);

  return (
    <div className={`flex min-w-0 flex-col gap-4 max-lg:p-0 lg:contents ${hiddenOnMobile ? "max-lg:hidden" : ""}`}>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel lg:h-full lg:flex-[4] lg:rounded-2xl lg:border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm text-muted-foreground transition hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="ds-h4">
              {meta.label} <span className="ml-1 rounded-full bg-accent-green/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-accent-green">Премиум</span>
            </h2>
            <p className="ds-caption">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={() => void resetScene()}
            title="Сбросить к исходным"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <SettingsSection
              title="Графика от ИИ"
              icon={<Sparkles className="h-4 w-4 text-accent-green" />}
              done={parts.some((p) => partImages(p).length > 0)}
              open={open.art}
              onToggle={() => toggle("art")}
            >
              <p className="mb-3 ds-caption">
                OpenAI рисует всё, что видно в игре, в одном стиле. Каждую деталь можно сгенерировать отдельно или заменить своей
                картинкой; чего нет — остаётся вектор.
              </p>
              <label className="mb-1.5 block ds-caption">Стиль — палитра сцены и материалы для ИИ</label>
              <div className="grid grid-cols-2 gap-2">
                {SCENE_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => set("style", st.id)}
                    aria-pressed={d.style === st.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${d.style === st.id ? CHIP_ON : CHIP_OFF}`}
                  >
                    <span className="flex shrink-0 -space-x-1">
                      {st.swatch.map((c) => (
                        <span key={c} className="h-4 w-4 rounded-full ring-2 ring-[var(--bg-panel,#111)]" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="truncate">{st.label}</span>
                  </button>
                ))}
              </div>
              <p className="mb-3 mt-1.5 ds-caption">Цвета заголовков и плашек меняются сразу; картинки — после генерации.</p>
              <label className="mb-1.5 block ds-caption">Тема — необязательно</label>
              <textarea
                rows={2}
                value={d.theme}
                maxLength={300}
                onChange={(e) => set("theme", e.target.value)}
                className={AREA}
                placeholder="Например: Древний Египет, Хэллоуин, ночной Лас-Вегас"
              />
              <div className="mt-3 flex flex-col gap-2">
                {parts.map((p) => (
                  <PartRow
                    key={p.id}
                    label={p.label}
                    hint={p.hint}
                    images={partImages(p)}
                    multiple={p.kind === "symbols"}
                    checked={included(p)}
                    busy={assetRun.running}
                    onCheck={(v) => set("parts", { ...d.parts, [p.id]: v })}
                    onGenerate={() => generateOne(p)}
                    onUpload={(files) => void uploadPart(p, files)}
                    onClear={() => clearPart(p)}
                  />
                ))}
              </div>
              <div className="mt-3">
                <AssetRunPanel
                  steps={assetRun.steps}
                  running={assetRun.running}
                  notEnough={assetRun.notEnough}
                  credits={assetCredits}
                  onStart={startAssets}
                  onCancel={assetRun.cancel}
                />
              </div>
            </SettingsSection>

            <div>
              <label className="mb-2 block ds-label">Язык</label>
              <div className="grid grid-cols-2 gap-2">
                {SCENE_LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => void changeLang(l.id)}
                    aria-pressed={d.lang === l.id}
                    className={`rounded-lg border px-2 py-2 text-sm transition ${d.lang === l.id ? CHIP_ON : CHIP_OFF}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <SettingsSection title="Тексты" done={textDone} open={open.text} onToggle={() => toggle("text")}>
              <div className="flex flex-col gap-3">
                {meta.fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1.5 block ds-caption">{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        rows={2}
                        value={d.text[f.key] ?? ""}
                        maxLength={80}
                        onChange={(e) => setText(f.key, e.target.value)}
                        className={AREA}
                      />
                    ) : (
                      <input
                        value={d.text[f.key] ?? ""}
                        maxLength={48}
                        onChange={(e) => setText(f.key, e.target.value)}
                        className={INPUT}
                      />
                    )}
                  </div>
                ))}
                <p className="ds-caption">Длинный текст сам уменьшится, чтобы влезть в экран.</p>
              </div>
            </SettingsSection>

            <SettingsSection
              title={scene === "wheel" ? "Выигрыш и сектора" : "Выигрыш"}
              done={d.amount > 0 && prizesOk}
              open={open.prize}
              onToggle={() => toggle("prize")}
            >
              <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                <div>
                  <label className="mb-1.5 block ds-caption">Сумма</label>
                  <input
                    type="number"
                    min={0}
                    value={d.amount}
                    onChange={(e) => set("amount", Math.max(0, Number(e.target.value) || 0))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block ds-caption">Единица</label>
                  <input value={d.unit} maxLength={24} onChange={(e) => set("unit", e.target.value)} className={INPUT} />
                </div>
              </div>
              <p className="mt-1.5 ds-caption">В попапе сумма считается от нуля до этой цифры.</p>

              {scene === "wheel" ? (
                <div className="mt-4">
                  <label className="mb-1.5 block ds-caption">Сектора — отметьте, где колесо остановится</label>
                  <div className="flex flex-col gap-1.5">
                    {d.prizes.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="winIndex"
                          checked={d.winIndex === i}
                          onChange={() => set("winIndex", i)}
                          aria-label={`Выигрышный сектор ${i + 1}`}
                          className="h-4 w-4 accent-[var(--accent-green)]"
                        />
                        <input
                          value={p}
                          maxLength={12}
                          onChange={(e) => set("prizes", d.prizes.map((x, j) => (j === i ? e.target.value : x)))}
                          className={`${INPUT} h-10`}
                        />
                        <button
                          type="button"
                          disabled={d.prizes.length <= 4}
                          onClick={() => {
                            const next = d.prizes.filter((_, j) => j !== i);
                            setD((prev) => ({
                              ...prev,
                              prizes: next,
                              winIndex: prev.winIndex === i ? 0 : prev.winIndex > i ? prev.winIndex - 1 : prev.winIndex,
                            }));
                          }}
                          aria-label="Убрать сектор"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {d.prizes.length < 12 ? (
                    <button
                      type="button"
                      onClick={() => set("prizes", [...d.prizes, ""])}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-accent-green transition hover:bg-white/5"
                    >
                      <Plus className="h-4 w-4" /> Сектор
                    </button>
                  ) : null}
                  <p className="mt-1 ds-caption">От 4 до 12 секторов. Первое вращение остановится в шаге от выигрышного.</p>
                </div>
              ) : null}
            </SettingsSection>

            <SettingsSection title="Бренд" done={!!(d.logo || d.brandName.trim())} open={open.brand} onToggle={() => toggle("brand")}>
              <label className="mb-1.5 block ds-caption">Название — показывается, если нет лого</label>
              <input value={d.brandName} maxLength={32} onChange={(e) => set("brandName", e.target.value)} className={INPUT} />
              <div className="mt-3 flex items-center gap-3">
                {d.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.logo} alt="" className="h-12 max-w-[160px] rounded-md bg-black/40 object-contain p-1" />
                ) : null}
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-white/5"
                >
                  <Upload className="h-4 w-4" /> {d.logo ? "Заменить лого" : "Загрузить лого"}
                </button>
                {d.logo ? (
                  <button
                    type="button"
                    onClick={() => set("logo", "")}
                    aria-label="Убрать лого"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void pickLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <label className="mb-1.5 mt-4 block ds-caption">Юридический текст внизу экрана</label>
              <textarea rows={2} value={d.legal} maxLength={240} onChange={(e) => set("legal", e.target.value)} className={AREA} />
            </SettingsSection>

            <SettingsSection
              title="Куда размещаем"
              required
              done={d.targets.length > 0 && (!needsUrl || !!d.clickUrl.trim())}
              open={open.net}
              onToggle={() => toggle("net")}
            >
              <p className="mb-2 ds-caption">Можно выбрать несколько — скачаете по файлу на каждую площадку, под её требования.</p>
              <div className="grid grid-cols-2 gap-2">
                {PLAYABLE_NETWORKS.map((n) => {
                  const on = d.targets.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleTarget(n.id)}
                      aria-pressed={on}
                      className={`relative rounded-lg border px-3 py-2.5 text-left text-sm transition ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-accent-green bg-accent-green text-on-accent" : "border-border"}`}>
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {n.label}
                      </span>
                      <span className="mt-0.5 block ds-caption">{n.hint}</span>
                    </button>
                  );
                })}
              </div>
              {d.targets.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {d.targets.map((t) => (
                    <li key={t} className="ds-caption">
                      <span className="font-medium text-foreground/80">{NETWORK_BY_ID.get(t)!.label}:</span> {NETWORK_BY_ID.get(t)!.rules}
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="mb-1.5 mt-3 block ds-caption">Ссылка по кнопке{needsUrl ? " *" : ""}</label>
              <input
                type="url"
                value={d.clickUrl}
                onChange={(e) => set("clickUrl", e.target.value)}
                className={INPUT}
                placeholder="https://… — стор, лендинг или трекинговая ссылка"
              />
              <p className="mt-1.5 ds-caption">
                {needsUrl
                  ? "По ней MRAID-сети и сайт откроют стор или лендинг. Google и Meta берут ссылку из кабинета."
                  : "Google и Meta берут ссылку из кабинета; здесь — только для проверки в превью."}
              </p>
            </SettingsSection>

          </div>
        </div>
      </section>

      <div className="flex min-w-0 flex-1 flex-col gap-4 max-lg:order-first max-lg:p-4 lg:h-full lg:flex-[4] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <ViewToggle view={view} onChange={setView} />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            disabled={!html}
            title="Открыть плейбл на весь экран"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-40 max-sm:h-11 max-sm:w-11 max-sm:px-0"
          >
            <Maximize2 className="h-4 w-4" />
            <span className="max-sm:hidden">На весь экран</span>
          </button>
        </div>

        <div className="relative flex justify-center overflow-hidden rounded-2xl border border-border bg-card p-3">
          {assetRun.running ? <BuildingOverlay steps={assetRun.steps} /> : null}
          <div
            className="overflow-hidden rounded-2xl border-[6px] border-[#1c2417] bg-black shadow-xl transition-[width]"
            style={{ width: view === "mobile" ? 300 : 640, maxWidth: "100%" }}
          >
            {html ? (
              <iframe
                key={`${scene}-${replay}-${html.length}`}
                srcDoc={html}
                title={`Плейбл «${meta.label}»`}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="block w-full bg-black"
                style={{ aspectRatio: view === "mobile" ? "9 / 16" : "16 / 9", border: 0 }}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-black text-sm text-white/50"
                style={{ aspectRatio: view === "mobile" ? "9 / 16" : "16 / 9" }}
              >
                {buildErr || "Собираем сцену…"}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {downloading
              ? "Собираем…"
              : d.targets.length === 1
                ? `Скачать для «${NETWORK_BY_ID.get(d.targets[0])!.label}»`
                : `Скачать файлы (${d.targets.length})`}
          </button>
          <button
            type="button"
            onClick={() => setReplay((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm transition hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" /> Сыграть заново
          </button>
        </div>
        {buildErr ? <p className="text-center ds-caption text-[color:var(--status-error)]">{buildErr}</p> : null}
        <div className="flex flex-col items-center gap-0.5">
          {d.targets.map((t) => {
            const n = NETWORK_BY_ID.get(t)!;
            const b = sizes[t] ?? 0;
            const over = b > n.limit;
            return (
              <p key={t} className={`text-center ds-caption ${over && t !== "meta" ? "text-amber-400" : ""}`}>
                {n.label}: {mb(b)}
                {Number.isFinite(n.limit) ? ` из ${mb(n.limit)}` : ""}
                {over ? (t === "meta" ? " — будет ZIP: картинки отдельными файлами" : " — больше лимита, площадка не примет") : ""}
              </p>
            );
          })}
        </div>
        <p className="text-center ds-caption">Превью играется: нажимайте прямо в нём. Шрифт и картинки уже внутри файла.</p>
      </div>

      {fullscreen && html ? (
        <div
          ref={fsRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Плейбл «${meta.label}» на весь экран`}
          className="fixed inset-0 z-[90] flex flex-col bg-[var(--bg-void)]"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-sm font-medium text-white/80">Плейбл · {meta.label}</span>
            <div className="flex items-center gap-2">
              <ViewToggle view={view} onChange={setView} />
              <button
                type="button"
                onClick={() => setReplay((n) => n + 1)}
                title="Сыграть заново"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
              >
                <Minimize2 className="h-4 w-4" />
                <span className="max-sm:hidden">Свернуть</span>
                <span className="ml-1 hidden text-xs text-white/60 sm:inline">Esc</span>
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
            {/* Сцена сама вписывается в любой размер — iframe просто занимает место:
                телефон — столбиком 9:16 во всю высоту, десктоп — всё окно. */}
            <iframe
              key={`fs-${scene}-${replay}-${html.length}`}
              srcDoc={html}
              title={`Плейбл «${meta.label}» на весь экран`}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              className="block rounded-2xl bg-black shadow-2xl ring-1 ring-white/10"
              style={
                view === "mobile"
                  ? { height: "100%", aspectRatio: "9 / 16", maxWidth: "100%", border: 0 }
                  : { width: "100%", height: "100%", border: 0 }
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: "mobile" | "desktop"; onChange: (v: "mobile" | "desktop") => void }) {
  const btn = (id: "mobile" | "desktop", label: string, Icon: typeof Monitor) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      aria-pressed={view === id}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
        view === id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
      {btn("mobile", "Мобайл", Smartphone)}
      {btn("desktop", "Десктоп", Monitor)}
    </div>
  );
}

function PartRow({
  label,
  hint,
  images,
  multiple,
  checked,
  busy,
  onCheck,
  onGenerate,
  onUpload,
  onClear,
}: {
  label: string;
  hint: string;
  images: string[];
  /** Набор (символы): превью всех, загрузка — до шести файлов. */
  multiple?: boolean;
  checked: boolean;
  busy: boolean;
  onCheck: (v: boolean) => void;
  onGenerate: () => void;
  onUpload: (files: FileList | null) => void;
  onClear: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const ICON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-40";
  const has = images.length > 0;
  return (
    <div className="rounded-xl border border-border p-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`Генерировать: ${label}`}
          title="Генерировать в общей сборке"
          className="h-4 w-4 shrink-0 accent-[var(--accent-green)]"
        />
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:12px_12px]">
          {has ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[0]} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block ds-caption">{has ? (multiple ? `Готово: ${images.length} шт. — уже в превью` : "Готово — уже в превью") : hint}</span>
        </span>
        <button type="button" onClick={onGenerate} disabled={busy} title="Сгенерировать только эту деталь" aria-label={`Сгенерировать: ${label}`} className={ICON}>
          <Sparkles className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => file.current?.click()} title={multiple ? "Загрузить свои (до 6)" : "Загрузить свою"} aria-label={`Загрузить: ${label}`} className={ICON}>
          <Upload className="h-4 w-4" />
        </button>
        {has ? (
          <button type="button" onClick={onClear} aria-label={`Убрать: ${label}`} title="Убрать — вернётся вектор" className={ICON}>
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {multiple && images.length > 1 ? (
        <div className="mt-2 grid grid-cols-6 gap-1.5 pl-6">
          {images.map((src, i) => (
            <span key={i} className="relative aspect-square overflow-hidden rounded-md bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:10px_10px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-contain" />
              {i === 0 ? <span className="absolute left-0.5 top-0.5 rounded bg-accent-green px-1 text-[9px] font-bold text-on-accent">WIN</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
