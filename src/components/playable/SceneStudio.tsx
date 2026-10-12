"use client";

// Редактор сценарных плейблов («Сейф», «Колесо», «Скретч-карта»). Сцена —
// готовая хореография из public/playable; здесь задаются тексты, сумма,
// бренд, ссылка и сеть, а ИИ по желанию рисует фон и награду для попапа.
// Превью — тот же файл, что уйдёт в сеть, только без сетевых скриптов.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
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
import { PLAYABLE_ASSET_PRICE_CREDITS } from "@/lib/credit-estimate";
import { prepareBackground, prepareSprite, prepareWheelFrame, type FrameArt } from "@/lib/scenes/art";
import { PLAYABLE_NETWORKS, type PlayableNetwork } from "@/lib/playableGen";
import { browserLoader, buildScenePlayable, type SceneConfig, type SceneId, type SceneLoader } from "@/lib/scenes/build";
import {
  DEFAULT_WIN_INDEX,
  SCENE_LANGS,
  WHEEL_STYLES,
  sceneMeta,
  scenePreset,
  wheelStyle,
  type SceneLang,
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
  network: PlayableNetwork;
  /** Стиль колеса: промпт для ИИ-деталей и палитра диска. */
  wheelStyle: string;
  /** Тема оформления — общая для всех деталей. */
  theme: string;
  /** Какие детали генерировать. */
  parts: Record<string, boolean>;
  bgImage: string;
  reward: string;
  art: { frame?: FrameArt; pointer?: string; hub?: string };
};

type PartId = "frame" | "pointer" | "hub" | "bg" | "reward";
const PARTS: { id: PartId; kind: string; label: string; hint: string; wheelOnly?: boolean }[] = [
  { id: "frame", kind: "wheel-frame", label: "Рама колеса", hint: "Обод с лампочками — главный объект", wheelOnly: true },
  { id: "pointer", kind: "wheel-pointer", label: "Указатель", hint: "Щёлкает на каждом секторе", wheelOnly: true },
  { id: "hub", kind: "wheel-hub", label: "Центр колеса", hint: "Медальон в середине", wheelOnly: true },
  { id: "bg", kind: "scene-bg", label: "Фон", hint: "Вертикальный, 9:16" },
  { id: "reward", kind: "reward", label: "Награда в попапе", hint: "Предмет на прозрачном фоне" },
];
/** Стиль для сцен без выбора стиля. */
const DEFAULT_STYLE = "polished yellow gold with warm glowing lights, luxury casino";

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
    network: "mraid",
    wheelStyle: "ruby",
    theme: meta.bgTheme,
    parts: { frame: true, pointer: true, hub: true, bg: true, reward: true },
    bgImage: "",
    reward: "",
    art: {},
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
      network: d.network === "google" ? "google" : "mraid",
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
  const [open, setOpen] = useState({ text: true, prize: true, brand: false, net: true, art: false });
  const [html, setHtml] = useState("");
  const [exportBytes, setExportBytes] = useState(0);
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
          localStorage.setItem(draftKey(scene), JSON.stringify({ ...d, bgImage: "", reward: "", logo: "", art: {} }));
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
      ...(scene === "wheel" ? { art: d.art, palette: wheelStyle(d.wheelStyle).palette } : {}),
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
        const [preview, real] = await Promise.all([
          buildScenePlayable(cfg, { network: d.network, preview: true, load: cachedLoader }),
          buildScenePlayable(cfg, { network: d.network, preview: false, load: cachedLoader }),
        ]);
        if (!alive) return;
        setHtml(preview);
        setExportBytes(new Blob([real]).size);
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
    setD((p) => ({ ...freshDraft(scene, p.lang, p.brandName, p.logo), clickUrl: p.clickUrl, network: p.network }));
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

  // ---- ИИ-оформление через серверную очередь
  const applyAsset = async (key: string, dataUrl: string) => {
    // Каждая деталь ужимается и подгоняется под сцену до встраивания в файл.
    if (key === "bg") {
      const out = await prepareBackground(dataUrl);
      setD((p) => ({ ...p, bgImage: out }));
    } else if (key === "reward") {
      const out = await prepareSprite(dataUrl, 600);
      setD((p) => ({ ...p, reward: out }));
    } else if (key === "frame") {
      const frame = await prepareWheelFrame(dataUrl);
      setD((p) => ({ ...p, art: { ...p.art, frame } }));
    } else if (key === "pointer") {
      const pointer = await prepareSprite(dataUrl, 300);
      setD((p) => ({ ...p, art: { ...p.art, pointer } }));
    } else if (key === "hub") {
      const hub = await prepareSprite(dataUrl, 320, true);
      setD((p) => ({ ...p, art: { ...p.art, hub } }));
    }
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

  const parts = PARTS.filter((p) => scene === "wheel" || !p.wheelOnly);
  const style = scene === "wheel" ? wheelStyle(d.wheelStyle).prompt : DEFAULT_STYLE;
  const partImage = (id: PartId): string =>
    id === "bg" ? d.bgImage : id === "reward" ? d.reward : id === "frame" ? (d.art.frame?.src ?? "") : (d.art[id] ?? "");
  const clearPart = (id: PartId) =>
    setD((p) => {
      if (id === "bg") return { ...p, bgImage: "" };
      if (id === "reward") return { ...p, reward: "" };
      const art = { ...p.art };
      delete art[id];
      return { ...p, art };
    });

  const assetSteps = (): AssetStep[] =>
    parts
      .filter((p) => d.parts[p.id])
      .map((p) => {
        const body = { kind: p.kind, style, theme: d.theme.trim() };
        return {
          id: p.id,
          label: p.label,
          credits: PLAYABLE_ASSET_PRICE_CREDITS,
          run: runInTab("/api/generate-playable-asset", body, p.id),
          server: { route: "/api/generate-playable-asset", body },
        };
      });
  const assetCredits = assetSteps().reduce((s, st) => s + st.credits, 0);
  const startAssets = () => {
    if (isGuest) return openGate();
    const steps = assetSteps();
    if (!steps.length) return toast.error("Отметьте хотя бы одну деталь");
    void assetRun.start(steps);
  };

  // ---- выгрузка
  const net = PLAYABLE_NETWORKS.find((n) => n.id === d.network) ?? PLAYABLE_NETWORKS[0];
  const download = async () => {
    if (d.network === "mraid" && !d.clickUrl.trim()) {
      setOpen((p) => ({ ...p, net: true }));
      return toast.error("Укажите ссылку по кнопке — без неё MRAID-сеть не примет плейбл");
    }
    let file: string;
    try {
      file = await buildScenePlayable(config(), { network: d.network, preview: false, load: cachedLoader });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Не удалось собрать плейбл");
    }
    let blob: Blob;
    let name: string;
    if (d.network === "google") {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("index.html", file);
      blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      name = `playable-${scene}-google.zip`;
    } else {
      blob = new Blob([file], { type: "text/html;charset=utf-8" });
      name = `playable-${scene}-mraid.html`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (blob.size > net.limit) toast.warning(`Файл ${mb(blob.size)} — больше лимита сети (${mb(net.limit)}). Уберите фон или награду.`);
    else toast.success(`Плейбл скачан для «${net.label}» · ${mb(blob.size)}`);
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
              title="Сеть и ссылка"
              required
              done={d.network === "google" || !!d.clickUrl.trim()}
              open={open.net}
              onToggle={() => toggle("net")}
            >
              <div className="flex gap-2">
                {PLAYABLE_NETWORKS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => set("network", n.id)}
                    aria-pressed={d.network === n.id}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-left text-sm transition ${d.network === n.id ? CHIP_ON : CHIP_OFF}`}
                  >
                    <span className="block font-medium">{n.label}</span>
                    <span className="mt-0.5 block ds-caption">{n.hint}</span>
                  </button>
                ))}
              </div>
              <label className="mb-1.5 mt-3 block ds-caption">Ссылка по кнопке{d.network === "mraid" ? " *" : ""}</label>
              <input
                type="url"
                value={d.clickUrl}
                onChange={(e) => set("clickUrl", e.target.value)}
                className={INPUT}
                placeholder="https://… — стор, лендинг или трекинговая ссылка"
              />
              <p className="mt-1.5 ds-caption">
                {d.network === "google"
                  ? "Для Google ссылка берётся из настроек объявления; здесь — только для проверки в превью."
                  : "По ней MRAID-контейнер откроет стор или лендинг."}
              </p>
            </SettingsSection>

            <SettingsSection
              title="Оформление от ИИ"
              done={parts.some((p) => !!partImage(p.id))}
              open={open.art}
              onToggle={() => toggle("art")}
            >
              <p className="mb-3 ds-caption">
                Детали рисует OpenAI в одном стиле и встраивает в файл сжатыми. Чего нет — остаётся вектор, плейбл работает
                и без картинок.
              </p>
              {scene === "wheel" ? (
                <div className="mb-3">
                  <label className="mb-1.5 block ds-caption">Стиль колеса</label>
                  <div className="grid grid-cols-2 gap-2">
                    {WHEEL_STYLES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => set("wheelStyle", st.id)}
                        aria-pressed={d.wheelStyle === st.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${d.wheelStyle === st.id ? CHIP_ON : CHIP_OFF}`}
                      >
                        <span className="flex shrink-0 -space-x-1">
                          {st.swatch.map((c) => (
                            <span key={c} className="h-4 w-4 rounded-full ring-2 ring-[var(--bg-panel,#111)]" style={{ background: c }} />
                          ))}
                        </span>
                        {st.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 ds-caption">Сектора перекрашиваются сразу; рама и детали — после генерации.</p>
                </div>
              ) : null}
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
                    image={partImage(p.id)}
                    checked={!!d.parts[p.id]}
                    onCheck={(v) => set("parts", { ...d.parts, [p.id]: v })}
                    onClear={() => clearPart(p.id)}
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            <Download className="h-4 w-4" />
            {d.network === "google" ? "Скачать ZIP для Google" : "Скачать для MRAID"}
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
        <p className={`text-center ds-caption ${exportBytes > net.limit ? "text-amber-400" : ""}`}>
          Файл для «{net.label}»: {mb(exportBytes)} из {mb(net.limit)}
          {exportBytes > net.limit ? " — больше лимита, сеть его не примет" : ""}
        </p>
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
  image,
  checked,
  onCheck,
  onClear,
}: {
  label: string;
  hint: string;
  image: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label={`Генерировать: ${label}`}
        className="h-4 w-4 shrink-0 accent-[var(--accent-green)]"
      />
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:12px_12px]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block ds-caption">{image ? "Готово — уже в превью" : hint}</span>
      </span>
      {image ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Убрать: ${label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
