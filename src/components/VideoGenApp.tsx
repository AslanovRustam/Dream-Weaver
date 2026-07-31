"use client";

// Video-constructor — same shell as the Banner/Landing/Playable generators
// (3 columns on desktop, a step wizard on mobile) adapted to the video format:
// the left column picks a scene type (with looped animated previews), the centre
// is an accordion of settings (script → avatar → voice → scene → music → lang),
// and the result is a simulated video player with a staged generation progress
// bar. Generation is a client-side mock today (see src/lib/videoGen.ts); the
// shape matches the other generators so a real video API can be slotted in later.
import { useEffect, useRef, useState } from "react";
import {
  Captions,
  Check,
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Globe,
  Link2,
  Loader2,
  Mic,
  Monitor,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBrandSettings } from "@/components/SettingsDrawer";
import { GenerationErrorCard } from "@/components/GenerationErrorCard";
import { GenerationProgress } from "@/components/GenerationProgress";
import { EmptyResult } from "@/components/EmptyResult";
import { SettingsSection, SectionDots } from "@/components/SettingsSection";
import { setUnsavedWork } from "@/lib/unsaved-work";
import { useAuthGate } from "@/components/AuthGate";
import { ToolCoachmark } from "@/components/ToolCoachmark";
import {
  CREATIVE_LANGUAGES,
  creativeLangShort,
} from "@/lib/creative-language";
import {
  VIDEO_SCENE_TYPES,
  VIDEO_SCENE_BY_ID,
  VIDEO_AVATARS,
  VIDEO_AVATAR_STYLES,
  VIDEO_VOICES,
  VIDEO_MUSIC,
  VIDEO_MOODS,
  VIDEO_BACKGROUNDS,
  VIDEO_RATIOS,
  VIDEO_STAGES,
  VIDEO_TOTAL_MS,
  stageIndexForProgress,
  generateVideoScript,
  estimateDurationSec,
  type VideoSceneType,
  type VideoResult,
  type AvatarStyle,
  type MusicMood,
} from "@/lib/videoGen";

type MobileTab = "templates" | "settings" | "result";
type Status = "idle" | "loading" | "done" | "error";
type SectionId = "script" | "avatar" | "voice" | "scene" | "music" | "lang" | "brand";

// Shrinks an uploaded image to a data URL (mirrors the other generators).
function compressImageFile(file: File | null, setter: (v: string) => void, maxPx = 512) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Нужен файл изображения — PNG или JPG.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("Файл слишком большой (макс 8 МБ).");
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert("Не удалось прочитать файл. Попробуйте другой.");
  reader.onload = () => {
    const src = reader.result;
    if (typeof src !== "string") return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setter(src);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      setter(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => alert("Не удалось обработать изображение. Попробуйте другой файл.");
    img.src = src;
  };
  reader.readAsDataURL(file);
}

export function VideoGenApp() {
  const { isGuest, openGate } = useAuthGate();
  const [sceneType, setSceneType] = useState<VideoSceneType>("talkinghead");
  const scene = VIDEO_SCENE_BY_ID.get(sceneType)!;

  // Сценарий
  const [script, setScript] = useState("");
  const [topic, setTopic] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);

  // Персонаж
  const [avatarId, setAvatarId] = useState("a1");
  const [avatarFilter, setAvatarFilter] = useState<AvatarStyle | "all">("all");
  const [customAvatar, setCustomAvatar] = useState("");

  // Голос
  const [voiceId, setVoiceId] = useState("v1");
  const [voiceSample, setVoiceSample] = useState("");
  const [customVoice, setCustomVoice] = useState("");

  // Сцена / фон
  const [backgroundId, setBackgroundId] = useState("studio");
  const [customBackground, setCustomBackground] = useState("");
  const [screencast, setScreencast] = useState("");

  // Музыка и доп. элементы
  const [musicId, setMusicId] = useState("m1");
  const [musicMood, setMusicMood] = useState<MusicMood | "all">("all");
  const [musicSample, setMusicSample] = useState("");
  const [subtitles, setSubtitles] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [textOverlay, setTextOverlay] = useState("");

  // Бренд / язык / формат
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [language, setLanguage] = useState("auto");
  const [extraLangs, setExtraLangs] = useState<string[]>([]);
  const [ratio, setRatio] = useState("9:16");

  // Generation
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0); // 0..1
  const [stageIndex, setStageIndex] = useState(0);
  const [etaSec, setEtaSec] = useState(0);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("mobile");
  const [previewLang, setPreviewLang] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("templates");
  const [genId, setGenId] = useState(0);

  // Accordion: which sections are open. Script open by default.
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    script: true,
    avatar: false,
    voice: false,
    scene: false,
    music: false,
    lang: false,
    brand: false,
  });
  const toggle = (id: SectionId) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  const logoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    document.title = "Конструктор видео — Dream Weaver Studio";
    const b = getBrandSettings();
    setBrandName(b.brand_name);
    setBrandLogo(b.brand_logo);
    setLanguage(b.language || "auto");
  }, []);

  // Stop the progress timer on unmount so a background sim never leaks.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Signal unsaved work (a typed topic or a generated result not yet saved) so
  // the header / beforeunload can warn before the user leaves and loses it.
  useEffect(() => {
    const dirty = topic.trim() !== "" || result !== null;
    setUnsavedWork(dirty ? "video" : null);
    return () => setUnsavedWork(null);
  }, [topic, result]);

  const selectScene = (id: VideoSceneType) => {
    setSceneType(id);
    setMobileTab("settings");
    // Auto-open the first relevant section for the chosen scene.
    setOpen((p) => ({ ...p, script: true }));
  };

  // Guests keep the button enabled so pressing it opens the register modal.
  const canGenerate = isGuest || (script.trim().length > 0 && status !== "loading");
  const durationSec = estimateDurationSec(script || " ");

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

  const genScript = () => {
    setScriptBusy(true);
    // Mock latency so the "AI is writing" feedback is visible.
    window.setTimeout(() => {
      setScript(generateVideoScript(topic, brandName, normalize(language)));
      setScriptBusy(false);
      toast.success("Скрипт сгенерирован — отредактируйте при необходимости");
    }, 700);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const onGenerate = () => {
    // Guests may configure freely; generating needs an account.
    if (isGuest) {
      openGate();
      return;
    }
    if (script.trim().length === 0) {
      toast.error("Заполните скрипт для озвучки");
      setOpen((p) => ({ ...p, script: true }));
      return;
    }
    persistBrand();
    stopTimer();
    setStatus("loading");
    setErrorMsg("");
    setProgress(0);
    setStageIndex(0);
    setEtaSec(Math.ceil(VIDEO_TOTAL_MS / 1000));
    // Mobile: jump to the result tab immediately so the staged progress screen
    // (stages / % / ETA / cancel) is visible during the long render — otherwise
    // the user would sit on the settings tab with no feedback.
    setMobileTab("result");
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / VIDEO_TOTAL_MS);
      setProgress(p);
      setStageIndex(stageIndexForProgress(p));
      setEtaSec(Math.max(0, Math.ceil((VIDEO_TOTAL_MS - elapsed) / 1000)));
      if (p >= 1) {
        stopTimer();
        try {
          setResult({ durationSec, createdAt: Date.now() });
          setGenId((n) => n + 1);
          setPreviewLang(normalize(language));
          setStatus("done");
          setMobileTab("result");
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "");
          setStatus("error");
        }
      }
    }, 100);
  };

  const cancelGenerate = () => {
    stopTimer();
    setStatus(result ? "done" : "idle");
    setProgress(0);
    toast("Генерация отменена");
  };

  // Regenerate replaces a finished video — confirm first. First-time generation
  // (no result yet) goes straight through with no prompt.
  const regenerate = () => {
    if (result && !window.confirm("Перегенерировать? Текущее видео будет заменено.")) return;
    onGenerate();
  };

  const removeResult = () => {
    // Confirm before destroying a finished, unsaved video — matches Banner /
    // Landing; Video was deleting on a single click.
    if (result && !window.confirm("Удалить готовое видео? Действие необратимо.")) return;
    setResult(null);
    setStatus("idle");
    setMobileTab("settings");
    toast("Видео удалено");
  };

  const download = () => {
    if (!result) return;
    // MP4 export isn't wired yet — don't claim a file was saved. Honest toast
    // instead of the previous fake "Видео скачано".
    toast("Экспорт MP4 скоро будет доступен", {
      description: "Рендер видео подключается — предпросмотр уже работает.",
    });
  };

  const getLink = async () => {
    // The share artifact lives only in localStorage, so a public link resolves
    // to nothing — don't copy a dead URL and claim success.
    toast("Публичная ссылка скоро", {
      description: "Пока поделиться можно будет экспортом файла.",
    });
  };

  const allLangs = [normalize(language), ...extraLangs];
  const addLang = (v: string) => {
    if (allLangs.includes(v)) return;
    setExtraLangs((p) => [...p, v]);
    toast.success(`Добавлена языковая версия: ${creativeLangShort(v)}`);
  };
  const removeLang = (v: string) => setExtraLangs((p) => p.filter((x) => x !== v));

  const avatar = VIDEO_AVATARS.find((a) => a.id === avatarId) ?? VIDEO_AVATARS[0];
  const bg = VIDEO_BACKGROUNDS.find((b) => b.id === backgroundId) ?? VIDEO_BACKGROUNDS[0];

  // Which accordion sections are visible + a "done" flag (mobile step dots).
  const sectionList: { id: SectionId; title: string; show: boolean; done: boolean }[] = [
    { id: "script", title: "Сценарий", show: true, done: script.trim().length > 0 },
    { id: "avatar", title: "Персонаж / аватар", show: scene.needsAvatar, done: !!avatarId || !!customAvatar },
    { id: "voice", title: "Голос", show: true, done: !!voiceId },
    { id: "scene", title: "Сцена / фон", show: true, done: scene.needsScreencast ? !!screencast : !!backgroundId },
    { id: "music", title: "Музыка и доп. элементы", show: true, done: true },
    { id: "lang", title: "Язык", show: true, done: true },
    { id: "brand", title: "Бренд и формат", show: true, done: true },
  ];
  const visibleSections = sectionList.filter((s) => s.show);

  const frame = () => {
    const [rw, rh] = ratio.split(":").map(Number);
    if (rw === rh) return { w: 340, h: 340 };
    if (rh > rw) {
      const h = previewMode === "mobile" ? 460 : 440;
      return { w: Math.round((h * rw) / rh), h };
    }
    const w = 520;
    return { w, h: Math.round((w * rh) / rw) };
  };
  const fr = frame();

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section="video" />
      {/* Fill exactly the viewport below the sticky 4rem header so the columns
          never push the page into a scroll — the left scene-type column stays
          fixed; only the middle settings + result columns scroll internally. */}
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">Конструктор видео</h1>

        {/* COLUMN 1 — scene type picker */}
        <div className={`lg:contents ${mobileTab !== "templates" ? "max-lg:hidden" : ""}`}>
          <SceneTypeSidebar value={sceneType} onSelect={selectScene} />
        </div>

        {/* COLUMN 2 — settings (accordion) */}
        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none lg:h-full lg:flex-[4] lg:rounded-2xl lg:border ${
            mobileTab !== "settings" ? "max-lg:hidden" : ""
          }`}
        >
          {/* Mobile-only header: back + step dots */}
          <div className="flex items-center gap-3 px-2 pb-2 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("templates")}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <SectionDots sections={visibleSections} />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              {/* ── Сценарий ─────────────────────────────────────────────── */}
              <SettingsSection
                title="Сценарий"
                icon={<Wand2 className="h-4 w-4 text-accent-green" />}
                required
                done={script.trim().length > 0}
                open={open.script}
                onToggle={() => toggle("script")}
              >
                <div className="flex flex-col gap-3">
                  {/* Generate-by-topic subpanel */}
                  <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-2.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-accent-green" />
                      Сгенерировать скрипт по теме
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="О чём видео? Напр.: бонус казино 100%"
                        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                      <button
                        type="button"
                        onClick={genScript}
                        disabled={scriptBusy}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-accent-green/50 bg-accent-green/10 px-3 text-sm font-medium text-accent-green transition hover:bg-accent-green/20 disabled:opacity-50"
                      >
                        {scriptBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {scriptBusy ? "Пишем…" : "Сгенерировать текст"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block ds-label">
                      Скрипт / текст для озвучки{" "}
                      <span className="text-[color:var(--status-error)]">*</span>
                    </label>
                    <textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      rows={5}
                      className="min-h-[120px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                      placeholder="Текст, который персонаж/голос произнесёт и залипсинчит. Напр.: «Устали от обычных бонусов? Знакомьтесь…»"
                    />
                    <p className="mt-1 flex items-center justify-between ds-caption">
                      <span>{script.trim() ? `${script.trim().split(/\s+/).length} слов` : "Обязательное поле"}</span>
                      <span>≈ {durationSec} сек озвучки</span>
                    </p>
                  </div>
                </div>
              </SettingsSection>

              {/* ── Персонаж / аватар ────────────────────────────────────── */}
              {scene.needsAvatar ? (
                <SettingsSection
                  title="Персонаж / аватар"
                  icon={<UserPlus className="h-4 w-4 text-accent-green" />}
                  done={!!avatarId || !!customAvatar}
                  open={open.avatar}
                  onToggle={() => toggle("avatar")}
                >
                  <div className="flex flex-col gap-3">
                    {/* Style filter */}
                    <div className="flex flex-wrap gap-1.5">
                      {VIDEO_AVATAR_STYLES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setAvatarFilter(s.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            avatarFilter === s.id
                              ? "border-accent-green bg-accent-green/10 text-accent-green"
                              : "border-border text-foreground/70 hover:bg-white/5"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {/* Avatar grid */}
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {/* Create-your-own tile */}
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className={`flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-1 text-center ds-micro transition ${
                          customAvatar
                            ? "border-accent-green bg-accent-green/5 text-accent-green"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground/80"
                        }`}
                        title="Создать своего аватара"
                      >
                        {customAvatar ? (
                          <img
                            src={customAvatar}
                            alt="Свой аватар"
                            className="h-full w-full rounded-lg object-cover"
                          />
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4" />
                            Свой
                          </>
                        )}
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          compressImageFile(e.target.files?.[0] ?? null, (v) => {
                            setCustomAvatar(v);
                            setAvatarId("");
                          });
                        }}
                      />
                      {VIDEO_AVATARS.filter(
                        (a) => avatarFilter === "all" || a.style === avatarFilter,
                      ).map((a) => {
                        const active = avatarId === a.id && !customAvatar;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setAvatarId(a.id);
                              setCustomAvatar("");
                            }}
                            className={`group relative aspect-[3/4] overflow-hidden rounded-xl border transition ${
                              active
                                ? "border-accent-green shadow-[0_0_30px_rgba(198,255,61,0.16)]"
                                : "border-border hover:border-foreground/40"
                            }`}
                            title={a.name}
                          >
                            <img src={a.img} alt={a.name} className="h-full w-full object-cover" />
                            {active ? (
                              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-green text-on-accent">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-2 text-[10px] font-medium text-white">
                              {a.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="ds-caption">
                      «Свой» — загрузите фото сотрудника или инфлюенсера для клонирования аватара
                      (мок на этом этапе).
                    </p>

                    {/* Simple appearance presets (stock avatars only) */}
                    {!customAvatar ? (
                      <div>
                        <label className="mb-1.5 block ds-label">Тон / стиль подачи</label>
                        <div className="flex gap-2">
                          {["Casual", "Professional", "Gen Z"].map((t) => (
                            <span
                              key={t}
                              className="flex-1 rounded-lg border border-border bg-background/60 px-2 py-2 text-center text-xs text-foreground/70"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 ds-caption">
                          Упрощённые пресеты внешнего вида — глубокая кастомизация появится позже.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </SettingsSection>
              ) : null}

              {/* ── Голос ────────────────────────────────────────────────── */}
              <SettingsSection
                title="Голос"
                icon={<Mic className="h-4 w-4 text-accent-green" />}
                done={!!voiceId || !!customVoice}
                open={open.voice}
                onToggle={() => toggle("voice")}
              >
                <div className="flex flex-col gap-2">
                  {VIDEO_VOICES.map((v) => {
                    const active = voiceId === v.id;
                    const playing = voiceSample === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center gap-3 rounded-lg border p-2 transition ${
                          active ? "border-accent-green bg-accent-green/5" : "border-border"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setVoiceSample(playing ? "" : v.id)}
                          aria-label={playing ? "Стоп" : "Прослушать"}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-accent-green transition hover:bg-white/5"
                        >
                          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoiceId(v.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {v.name}
                            <span className="ds-micro text-muted-foreground">
                              {v.gender === "male" ? "♂" : "♀"} ·{" "}
                              {v.tone === "casual" ? "casual" : "professional"}
                            </span>
                          </span>
                          {playing ? <Equalizer /> : <span className="block ds-caption">{v.sample}</span>}
                        </button>
                        {active ? <Check className="h-4 w-4 shrink-0 text-accent-green" /> : null}
                      </div>
                    );
                  })}

                  <label className="mt-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm transition hover:border-foreground/40">
                    <span className="flex items-center gap-2 text-foreground/80">
                      <Upload className="h-4 w-4" />
                      {customVoice ? "Аудио-референс загружен" : "Клонировать свой голос"}
                    </span>
                    <span className="ds-caption">{customVoice ? "заменить" : "опционально"}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setCustomVoice(e.target.files?.[0]?.name ?? "")}
                    />
                  </label>
                </div>
              </SettingsSection>

              {/* ── Сцена / фон ──────────────────────────────────────────── */}
              <SettingsSection
                title="Сцена / фон"
                icon={<Clapperboard className="h-4 w-4 text-accent-green" />}
                done={scene.needsScreencast ? !!screencast : !!backgroundId}
                open={open.scene}
                onToggle={() => toggle("scene")}
              >
                {scene.needsScreencast ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/40 px-4 py-6 text-center transition hover:border-foreground/40">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {screencast || "Загрузить запись экрана"}
                      </span>
                      <span className="ds-caption">MP4/MOV · до 500 МБ</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => setScreencast(e.target.files?.[0]?.name ?? "")}
                      />
                    </label>
                    <div className="flex items-start gap-2 rounded-lg border border-[color:var(--status-premium)]/30 bg-[color:var(--status-premium)]/5 p-2.5">
                      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-premium)]" />
                      <p className="ds-caption">
                        Запись экрана прямо в конструкторе — скоро. Пока загрузите готовый файл или
                        оставьте пустым (добавим позже).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-2">
                      {VIDEO_BACKGROUNDS.map((b) => {
                        const active = backgroundId === b.id && !customBackground;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setBackgroundId(b.id);
                              setCustomBackground("");
                            }}
                            className={`relative h-16 overflow-hidden rounded-lg border transition ${
                              active
                                ? "border-accent-green shadow-[0_0_24px_rgba(198,255,61,0.14)]"
                                : "border-border hover:border-foreground/40"
                            }`}
                            style={{ background: b.css }}
                            title={b.label}
                          >
                            <span className="absolute inset-x-0 bottom-0 truncate bg-black/40 px-1 py-0.5 text-[10px] font-medium text-white">
                              {b.label}
                            </span>
                            {active ? (
                              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-green text-on-accent">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition ${
                        customBackground
                          ? "border-accent-green text-accent-green"
                          : "border-border text-foreground/80 hover:border-foreground/40"
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      {customBackground ? "Свой фон загружен — заменить" : "Загрузить фон бренда"}
                    </button>
                    <input
                      ref={bgInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => compressImageFile(e.target.files?.[0] ?? null, setCustomBackground)}
                    />
                  </div>
                )}
              </SettingsSection>

              {/* ── Музыка и доп. элементы ───────────────────────────────── */}
              <SettingsSection
                title="Музыка и доп. элементы"
                icon={<Music className="h-4 w-4 text-accent-green" />}
                done
                open={open.music}
                onToggle={() => toggle("music")}
              >
                <div className="flex flex-col gap-3">
                  {/* Mood filter */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMusicMood("all")}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        musicMood === "all"
                          ? "border-accent-green bg-accent-green/10 text-accent-green"
                          : "border-border text-foreground/70 hover:bg-white/5"
                      }`}
                    >
                      Все
                    </button>
                    {VIDEO_MOODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMusicMood(m.id)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          musicMood === m.id
                            ? "border-accent-green bg-accent-green/10 text-accent-green"
                            : "border-border text-foreground/70 hover:bg-white/5"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {/* Track list */}
                  <div className="flex flex-col gap-1.5">
                    {VIDEO_MUSIC.filter(
                      (t) => t.id === "m0" || musicMood === "all" || t.mood === musicMood,
                    ).map((t) => {
                      const active = musicId === t.id;
                      const playing = musicSample === t.id;
                      const silent = t.id === "m0";
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-3 rounded-lg border p-2 transition ${
                            active ? "border-accent-green bg-accent-green/5" : "border-border"
                          }`}
                        >
                          {silent ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                              <X className="h-4 w-4" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMusicSample(playing ? "" : t.id)}
                              aria-label={playing ? "Стоп" : "Прослушать"}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-accent-green transition hover:bg-white/5"
                            >
                              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setMusicId(t.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-medium">{t.label}</span>
                            {playing ? (
                              <Equalizer />
                            ) : (
                              <span className="block ds-caption">
                                {silent ? "Тишина" : `${VIDEO_MOODS.find((m) => m.id === t.mood)?.label} · ${t.durationSec}с`}
                              </span>
                            )}
                          </button>
                          {active ? <Check className="h-4 w-4 shrink-0 text-accent-green" /> : null}
                        </div>
                      );
                    })}
                  </div>

                  {/* Toggles */}
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Captions className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <span className="block text-sm font-medium">Субтитры</span>
                        <span className="block ds-caption">Автоматические, поверх видео</span>
                      </span>
                    </span>
                    <Switch checked={subtitles} onChange={setSubtitles} />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <span className="block text-sm font-medium">Логотип / водяной знак</span>
                        <span className="block ds-caption">Лого бренда в углу видео</span>
                      </span>
                    </span>
                    <Switch checked={watermark} onChange={setWatermark} />
                  </div>
                  <div>
                    <label className="mb-1.5 block ds-label">
                      Текстовый оверлей <span className="text-muted-foreground">(опционально)</span>
                    </label>
                    <input
                      type="text"
                      value={textOverlay}
                      onChange={(e) => setTextOverlay(e.target.value)}
                      maxLength={48}
                      placeholder="Хук в начале ролика — напр.: «Только сегодня»"
                      className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                    />
                  </div>
                </div>
              </SettingsSection>

              {/* ── Язык ─────────────────────────────────────────────────── */}
              <SettingsSection
                title="Язык"
                icon={<Globe className="h-4 w-4 text-accent-green" />}
                done
                open={open.lang}
                onToggle={() => toggle("lang")}
              >
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1.5 block ds-label">Основной язык (из шапки по умолчанию)</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      aria-label="Основной язык видео"
                      className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                    >
                      {CREATIVE_LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block ds-label">Дополнительные языковые версии</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-green/40 bg-accent-green/10 px-2.5 py-1 text-xs font-medium text-accent-green">
                        {creativeLangShort(normalize(language))} · основной
                      </span>
                      {extraLangs.map((l) => (
                        <span
                          key={l}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                        >
                          {creativeLangShort(l)}
                          <button
                            type="button"
                            onClick={() => removeLang(l)}
                            aria-label={`Убрать ${creativeLangShort(l)}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <AddLangMenu current={allLangs} onAdd={addLang} />
                    </div>
                    <p className="mt-1.5 ds-caption">
                      Один скрипт → несколько языков с адаптированным липсинком.
                    </p>
                  </div>
                </div>
              </SettingsSection>

              {/* ── Бренд и формат ───────────────────────────────────────── */}
              <SettingsSection
                title="Бренд и формат"
                icon={<Sparkles className="h-4 w-4 text-accent-green" />}
                done
                open={open.brand}
                onToggle={() => toggle("brand")}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {brandLogo ? (
                      <div className="relative h-16 w-16 shrink-0">
                        <img
                          src={brandLogo}
                          alt="brand logo"
                          className="h-16 w-16 rounded-md border border-border bg-white object-contain p-1"
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
                        className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border ds-micro hover:border-foreground/40 hover:text-foreground/80"
                      >
                        <Upload size={14} />
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
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Название бренда / проекта"
                      className="h-12 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block ds-label">Формат кадра</label>
                    <div className="flex gap-2">
                      {VIDEO_RATIOS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRatio(r.id)}
                          className={`flex-1 rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
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
                </div>
              </SettingsSection>
            </div>
          </div>

          {/* Mobile sticky primary */}
          <div className="shrink-0 border-t border-border bg-panel p-3 lg:hidden">
            <button
              type="button"
              onClick={regenerate}
              disabled={!canGenerate}
              className="min-h-12 w-full rounded-lg bg-accent-green px-8 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Генерация…" : "Сгенерировать"}
            </button>
            {script.trim().length === 0 && status !== "loading" ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Заполните скрипт, чтобы сгенерировать
              </p>
            ) : null}
          </div>
        </section>

        {/* COLUMN 3 — result */}
        <div
          className={`flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none max-lg:p-4 lg:h-full lg:flex-[4] ${
            mobileTab !== "result" ? "max-lg:hidden" : ""
          }`}
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
          {script.trim().length === 0 && status !== "loading" ? (
            <p className="-mt-1 text-center text-xs text-muted-foreground max-lg:hidden">
              Заполните скрипт, чтобы сгенерировать
            </p>
          ) : null}

          {status === "loading" ? (
            <GenerationProgress
              title="Генерируем видео…"
              stages={VIDEO_STAGES}
              stageIndex={stageIndex}
              progress={progress}
              etaSec={etaSec}
              onCancel={cancelGenerate}
              footer="Видео рендерится дольше баннера — можно переключиться на другие задачи, прогресс сохранится."
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
              {/* Device toggle + ⋯ */}
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
                      onClick={removeResult}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Player */}
              <div className="flex justify-center rounded-2xl border border-border bg-card p-3">
                <MockVideoPlayer
                  key={`${genId}-${previewLang}-${ratio}-${previewMode}`}
                  width={fr.w}
                  height={fr.h}
                  durationSec={result.durationSec}
                  sceneType={sceneType}
                  avatarImg={customAvatar || avatar.img}
                  bgCss={customBackground ? undefined : bg.css}
                  bgImg={customBackground || undefined}
                  brandName={brandName}
                  brandLogo={brandLogo}
                  watermark={watermark}
                  subtitles={subtitles}
                  textOverlay={textOverlay}
                  lang={previewLang || normalize(language)}
                  script={
                    (previewLang || normalize(language)) === normalize(language)
                      ? script
                      : topic.trim()
                        ? generateVideoScript(topic, brandName, previewLang)
                        : script
                  }
                />
              </div>

              {/* Language version switcher */}
              {allLangs.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ds-caption mr-1">Версия:</span>
                  {allLangs.map((l) => {
                    const active = (previewLang || normalize(language)) === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setPreviewLang(l)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? "border-accent-green bg-accent-green/10 text-accent-green"
                            : "border-border text-foreground/70 hover:bg-white/5"
                        }`}
                      >
                        {creativeLangShort(l)}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
                >
                  <Download className="h-4 w-4" />
                  Скачать
                </button>
                <button
                  type="button"
                  onClick={getLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm transition hover:bg-white/5"
                >
                  <Link2 className="h-4 w-4" />
                  Получить ссылку
                </button>
              </div>
              <p className="text-center ds-caption">
                Превью — симуляция. «Скачать» отдаёт MP4 для соцсетей и рекламных сетей (мок на этом
                этапе).
              </p>
            </div>
          ) : (
            <EmptyResult
              icon={<Film className="h-6 w-6" />}
              title="Здесь появится ваше видео"
              hint="Выберите тип сцены, заполните скрипт и нажмите «Сгенерировать». Мы соберём озвучку, липсинк и рендер, а превью покажем в плеере."
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Resolve "auto" to a concrete language for mock text / labels. The generation
// language is a local, per-section setting now, so "auto" simply defaults to ru.
function normalize(lang: string): string {
  if (lang && lang !== "auto") return lang;
  return "ru";
}

// ---- shared bits ------------------------------------------------------------

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

// A tiny "playing" indicator used for voice/music sample previews (audio is
// mocked at this stage — this stands in for a real waveform).
function Equalizer() {
  return (
    <span className="mt-1 flex items-end gap-0.5" aria-label="Воспроизведение">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-accent-green"
          style={{ height: 10, animation: `vg-eq 0.9s ${i * 0.12}s ease-in-out infinite` }}
        />
      ))}
    </span>
  );
}

// Accordion section card — the codebase's collapsible idiom (button + chevron).
// Add-language dropdown for the multi-language versions row.
function AddLangMenu({ current, onAdd }: { current: string[]; onAdd: (v: string) => void }) {
  const available = CREATIVE_LANGUAGES.filter((l) => l.value !== "auto" && !current.includes(l.value));
  if (available.length === 0) return null;
  return (
    <DropdownMenu scrimIntensity="light">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-foreground/80 transition hover:border-foreground/40 hover:bg-white/5"
        >
          <Plus className="h-3 w-3" />
          Добавить язык
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="max-h-64 w-52 overflow-y-auto rounded-xl border-border bg-popover p-1.5 text-foreground"
      >
        {available.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => onAdd(l.value)}
            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- mock video player ------------------------------------------------------

function MockVideoPlayer({
  width,
  height,
  durationSec,
  sceneType,
  avatarImg,
  bgCss,
  bgImg,
  brandName,
  brandLogo,
  watermark,
  subtitles,
  textOverlay,
  lang,
  script,
}: {
  width: number;
  height: number;
  durationSec: number;
  sceneType: VideoSceneType;
  avatarImg: string;
  bgCss?: string;
  bgImg?: string;
  brandName: string;
  brandLogo: string;
  watermark: boolean;
  subtitles: boolean;
  textOverlay: string;
  lang: string;
  script: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); // seconds
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (ref.current) clearInterval(ref.current);
  }, []);

  const play = () => {
    if (playing) {
      if (ref.current) clearInterval(ref.current);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const from = t >= durationSec ? 0 : t;
    setT(from);
    const start = Date.now() - from * 1000;
    ref.current = setInterval(() => {
      const cur = (Date.now() - start) / 1000;
      if (cur >= durationSec) {
        if (ref.current) clearInterval(ref.current);
        setT(durationSec);
        setPlaying(false);
      } else {
        setT(cur);
      }
    }, 100);
  };

  const frac = durationSec > 0 ? Math.min(1, t / durationSec) : 0;
  const isScreen = sceneType === "screencast" || sceneType === "overlay";
  const showAvatarBig = sceneType === "talkinghead";
  const showAvatarCorner = sceneType === "overlay";

  // Subtitle = the sentence at the current playback position.
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const subtitle = sentences.length
    ? sentences[Math.min(sentences.length - 1, Math.floor(frac * sentences.length))]
    : "";

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div style={{ width, maxWidth: "100%" }}>
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl"
        style={{ aspectRatio: `${width} / ${height}`, background: isScreen ? "#0b0f17" : bgCss }}
      >
        {/* Custom background image */}
        {bgImg && !isScreen ? (
          <img src={bgImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        {/* Faux screen recording for screencast/overlay */}
        {isScreen ? (
          <div className="absolute inset-0 p-3">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0e1420]">
              <div className="flex items-center gap-1 border-b border-white/10 bg-white/5 px-2 py-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400/70" />
                <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
                <span className="h-2 w-2 rounded-full bg-green-400/70" />
                <span className="ml-2 h-2 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="flex-1 p-3">
                <span className="mb-2 block h-2.5 w-2/3 rounded bg-white/12" />
                <span className="mb-2 block h-2 w-1/2 rounded bg-white/8" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-10 rounded-md bg-white/7" />
                  ))}
                </div>
                <span
                  className="mt-4 block h-6 w-24 rounded-md bg-accent-green/70"
                  style={{ transform: `translateX(${frac * 40}px)`, transition: "transform .1s linear" }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Big talking-head avatar */}
        {showAvatarBig ? (
          <div className="absolute inset-0 flex items-end justify-center">
            <img
              src={avatarImg}
              alt=""
              className="h-[86%] w-auto object-contain drop-shadow-2xl"
              style={{ transform: playing ? "translateY(0)" : "translateY(2px)" }}
            />
          </div>
        ) : null}

        {/* Corner avatar for overlay */}
        {showAvatarCorner ? (
          <div className="absolute bottom-3 right-3 h-20 w-20 overflow-hidden rounded-full border-2 border-accent-green shadow-lg sm:h-24 sm:w-24">
            <img src={avatarImg} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        {/* Voiceover: waveform hint */}
        {sceneType === "voiceover" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-end gap-1">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-white/40"
                  style={{
                    height: 12 + ((i * 37) % 40),
                    animation: playing ? `vg-eq 1s ${(i % 5) * 0.1}s ease-in-out infinite` : "none",
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Language badge */}
        <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur">
          {creativeLangShort(lang)}
        </span>

        {/* Watermark */}
        {watermark ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-1 backdrop-blur">
            {brandLogo ? (
              <img src={brandLogo} alt="" className="h-4 w-4 rounded-sm bg-white object-contain" />
            ) : (
              <Film className="h-3 w-3 text-white" />
            )}
            <span className="max-w-[80px] truncate text-[10px] font-medium text-white">
              {brandName || "Бренд"}
            </span>
          </span>
        ) : null}

        {/* Text overlay hook */}
        {textOverlay.trim() ? (
          <div className="absolute inset-x-0 top-8 flex justify-center px-3">
            <span className="rounded-lg bg-accent-green px-2.5 py-1 text-center text-sm font-extrabold uppercase text-on-accent shadow-lg">
              {textOverlay}
            </span>
          </div>
        ) : null}

        {/* Subtitles */}
        {subtitles && subtitle ? (
          <div className="absolute inset-x-0 bottom-12 flex justify-center px-4">
            <span className="rounded-md bg-black/65 px-2 py-1 text-center text-xs font-medium leading-snug text-white backdrop-blur">
              {subtitle}
            </span>
          </div>
        ) : null}

        {/* Center play button */}
        {!playing ? (
          <button
            type="button"
            onClick={play}
            aria-label="Воспроизвести"
            className="absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/20"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-on-accent shadow-xl">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
          </button>
        ) : null}

        {/* Control bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
          <button
            type="button"
            onClick={play}
            aria-label={playing ? "Пауза" : "Воспроизвести"}
            className="text-white"
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <span className="tabular-nums text-[10px] text-white">{fmt(t)}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-accent-green" style={{ width: `${frac * 100}%` }} />
          </div>
          <span className="tabular-nums text-[10px] text-white">{fmt(durationSec)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- left column: scene-type picker with looped animated previews -----------

const VG_ANIM_CSS = `
@keyframes vg-eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes vg-talk{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}
@keyframes vg-cursor{0%{transform:translate(4px,18px)}50%{transform:translate(26px,8px)}100%{transform:translate(4px,18px)}}
@keyframes vg-scan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
.vg-anim{width:56px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;background:#0f140e;display:flex;align-items:center;justify-content:center;position:relative}
.vg-screen{width:44px;height:32px;border-radius:5px;background:#141b12;border:2px solid #2c3424;position:relative;overflow:hidden}
.vg-screen:after{content:'';position:absolute;top:0;left:0;width:30%;height:100%;background:linear-gradient(90deg,transparent,rgba(198,255,61,.25),transparent);animation:vg-scan 1.8s linear infinite}
.vg-cur{position:absolute;width:6px;height:6px;border-radius:50%;background:var(--accent-green);animation:vg-cursor 2.2s ease-in-out infinite}
.vg-head{width:22px;height:22px;border-radius:50%;background:#2f3a20;position:relative}
.vg-mouth{position:absolute;left:50%;bottom:5px;width:8px;height:4px;border-radius:2px;background:var(--accent-green);transform:translateX(-50%);transform-origin:center;animation:vg-talk .5s ease-in-out infinite}
.vg-bars{display:flex;align-items:flex-end;gap:2px;height:26px}
.vg-bars span{width:3px;border-radius:2px;background:var(--accent-green);transform-origin:bottom}
.vg-bars span:nth-child(1){height:60%;animation:vg-eq .9s 0s infinite}
.vg-bars span:nth-child(2){height:100%;animation:vg-eq .9s .1s infinite}
.vg-bars span:nth-child(3){height:45%;animation:vg-eq .9s .2s infinite}
.vg-bars span:nth-child(4){height:80%;animation:vg-eq .9s .3s infinite}
.vg-bars span:nth-child(5){height:55%;animation:vg-eq .9s .15s infinite}
.vg-corner{position:absolute;right:4px;bottom:4px;width:14px;height:14px;border-radius:50%;background:#2f3a20;border:2px solid var(--accent-green)}
`;

function SceneAnim({ type }: { type: VideoSceneType }) {
  if (type === "screencast") {
    return (
      <div className="vg-anim">
        <div className="vg-screen">
          <span className="vg-cur" />
        </div>
      </div>
    );
  }
  if (type === "talkinghead") {
    return (
      <div className="vg-anim">
        <div className="vg-head">
          <span className="vg-mouth" />
        </div>
      </div>
    );
  }
  if (type === "overlay") {
    return (
      <div className="vg-anim">
        <div className="vg-screen" />
        <span className="vg-corner" />
      </div>
    );
  }
  return (
    <div className="vg-anim">
      <div className="vg-bars">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SceneTypeSidebar({
  value,
  onSelect,
}: {
  value: VideoSceneType;
  onSelect: (id: VideoSceneType) => void;
}) {
  return (
    <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:flex-[2] lg:rounded-2xl lg:border">
      <style>{VG_ANIM_CSS}</style>
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="ds-h4">Тип сцены</h2>
      </div>
      {/* Desktop: fixed (4 types fit, no internal scroll); mobile: full-width
          vertical list that fills the step screen (clearer than a carousel). */}
      <div className="flex-1 overflow-y-auto p-3 lg:overflow-hidden">
        <div className="flex flex-col gap-3">
          {VIDEO_SCENE_TYPES.map((s) => {
            const active = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  active
                    ? "border-accent-green bg-accent-green/5 shadow-[0_0_40px_rgba(198,255,61,0.14)]"
                    : "border-border bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <SceneAnim type={s.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {s.label}
                    {active ? <Check className="h-3.5 w-3.5 text-accent-green" /> : null}
                  </span>
                  <span className="mt-0.5 block ds-caption">{s.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
