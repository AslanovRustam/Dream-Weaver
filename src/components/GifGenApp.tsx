"use client";
// GIF-генератор — отдельный инструмент: готовый баннер (из Истории или свой файл) →
// сеть → размеры → GIF каждого размера, собранные композицией слоёв (фон, персонаж
// отдельно, надписи и кнопка в стиле баннера — src/lib/bannerLayersRun.ts), под
// техтребования выбранной сети (src/lib/gifNetworks.ts). Слои генерируются один раз на
// баннер и сохраняются в карточку Истории; повторная сборка оттуда бесплатна.
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Download,
  FileArchive,
  ImagePlay,
  Loader2,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuthGate } from "@/components/AuthGate";
import { PRESETS } from "@/components/PresetSidebar";
import {
  GIF_WORKING,
  SimpleGifPanel,
  type GifAutoState,
  type GifRun,
  type GifSource,
} from "@/components/gif/SimpleGifPanel";
import { GifDialog } from "@/components/resize/GifDialog";
import { ModeSwitch } from "@/components/simple/ModeSwitch";
import { useToolMode } from "@/components/simple/useToolMode";
import { apiJson } from "@/lib/api-client";
import { gifLayersFor, type LayeredCtx, type SavedLayers } from "@/lib/bannerLayersRun";
import type { LayerSource } from "@/lib/bannerLayers";
import { estimateBannerCredits } from "@/lib/credit-estimate";
import { CREATIVE_LANGUAGES } from "@/lib/creative-language";
import { buildGif, slidesOf, toDataUrl } from "@/lib/gifRender";
import {
  GIF_DEFAULT_SIZES,
  GIF_NETWORKS,
  GIF_NETWORK_BY_ID,
  GIF_SIZE_GROUPS,
  type GifCheck,
  type GifMode,
  type GifNetwork,
  type GifNetworkId,
} from "@/lib/gifNetworks";
import { generateImage, type GeneratePayload } from "@/lib/imageGen";
import {
  checkByTz,
  failedCritical,
  loadAutoSnapshot,
  needsReview,
  REVIEW_CREDITS,
  rememberLastTz,
  saveAutoSnapshot,
  tzImage,
  understandTz,
  withClarifications,
  type TzCheck,
  type TzRequirement,
  type TzRunInput,
  type TzUnderstood,
} from "@/lib/tz/client";
import { takeTzHandoff } from "@/lib/tz/handoff";
import { normalizeGifPlan } from "@/lib/tz/plans/gif";

type Source = GifSource;
type CardItem = {
  id: string;
  name: string;
  master: { image_url: string | null; width: number | null; height: number | null } | null;
};
type Result = {
  status: "queued" | "running" | "done" | "error";
  url?: string;
  bytes?: Uint8Array;
  kb?: number;
  checks?: GifCheck[];
  layers?: LayerSource;
  error?: string;
};

const NET_KEY = "gengo.gif.network";
/** Цена первой сборки слоёв на баннер: персонаж + лист надписей (по 23) + фон. */
const FIRST_BUILD_CREDITS = 48;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`;

function savedNetwork(): GifNetworkId {
  try {
    const v = localStorage.getItem(NET_KEY);
    if (v && GIF_NETWORK_BY_ID.has(v as GifNetworkId)) return v as GifNetworkId;
  } catch {
    /* приватный режим */
  }
  return "google";
}

/** Каталог шаблонов для движка ТЗ — как у баннер-генератора (спорт-шаблону нужны составы). */
const TZ_TEMPLATES = PRESETS.filter((p) => p.id !== "preset4").map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
}));
/** Модель мастер-баннера — та же, что по умолчанию в баннер-генераторе (MODEL_IDS.gpt). */
const BANNER_MODEL = "openai/gpt-5.4-image-2";
const GIF_CATALOG = new Set(GIF_SIZE_GROUPS.flatMap((g) => g.sizes));

/** Движение из плана → режим сборки; что сеть или слои не позволяют — по плану сети. */
function modeFor(m: GifMode | undefined, net: GifNetwork, layers?: LayerSource): GifMode | undefined {
  if (!m) return undefined;
  if (m === "flat") return m;
  if (!layers) return undefined;
  // Google: медленнее 5 кадр/с — плавная сцена не пройдёт.
  if (m === "scene" && net.minFrameMs > 0) return undefined;
  if (m === "slides" && slidesOf(layers).length < 2) return undefined;
  return m;
}

/** Свой файл → data URL не больше 1536 px по длинной стороне (модели больше не нужно). */
async function fileToDataUrl(file: Blob): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1536 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GifGenApp() {
  const [cards, setCards] = useState<CardItem[] | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [netId, setNetId] = useState<GifNetworkId>("google");
  useEffect(() => setNetId(savedNetwork()), []);
  const net = GIF_NETWORK_BY_ID.get(netId)!;
  const [sizes, setSizes] = useState<Set<string>>(new Set(GIF_DEFAULT_SIZES));
  // Есть ли у карточки сохранённые слои (тогда сборка бесплатна): null — ещё не знаем.
  const [savedReady, setSavedReady] = useState<boolean | null>(null);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [running, setRunning] = useState(false);
  const [tune, setTune] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Свой файл сразу становится карточкой Истории: слои GIF сохранятся в неё, и повторная
  // сборка будет бесплатной и после перезагрузки. Не сохранилось — работаем с файлом как есть.
  // Возвращает выбранный баннер (простому режиму); не открылась картинка — null.
  async function upload(file: File): Promise<Source | null> {
    setUploading(true);
    try {
      const img = await fileToDataUrl(file);
      let next: Source;
      try {
        const r = await apiJson<{ card_id: string; image_url: string; name: string }>(
          "/api/history/upload-card",
          {
            method: "POST",
            body: JSON.stringify({ image: img.src, name: file.name, width: img.w, height: img.h }),
          },
        );
        setCards((prev) => [
          {
            id: r.card_id,
            name: r.name,
            master: { image_url: r.image_url, width: img.w, height: img.h },
          },
          ...(prev ?? []),
        ]);
        next = { kind: "card", id: r.card_id, name: r.name, image: img.src };
      } catch (e) {
        toast.warning("Не удалось сохранить баннер в Историю — слои будут только до перезагрузки", {
          description: e instanceof Error ? e.message : String(e),
        });
        next = { kind: "upload", name: file.name, image: img.src };
      }
      setSource(next);
      return next;
    } catch {
      toast.error("Не удалось открыть картинку");
      return null;
    } finally {
      setUploading(false);
    }
  }
  // Контекст слоёв на выбранный баннер: подложки, персонаж и надписи кэшируются в нём.
  const ctxRef = useRef<{ key: string; ctx: LayeredCtx } | null>(null);
  const saved = useRef<Promise<SavedLayers | null> | null>(null);

  useEffect(() => {
    apiJson<{ items: CardItem[] }>("/api/history?limit=36")
      .then((r) => setCards(r.items.filter((c) => c.master?.image_url)))
      .catch(() => setCards([]));
  }, []);

  // Выбрали карточку — узнаём, есть ли у неё сохранённые слои.
  useEffect(() => {
    setResults(new Map());
    saved.current = null;
    setSavedReady(null);
    if (source?.kind !== "card") return void setSavedReady(false);
    const p = apiJson<{ layers: SavedLayers | null }>(`/api/history/${source.id}/layers`)
      .then((r) => r.layers)
      .catch(() => null);
    saved.current = p;
    let off = false;
    p.then((l) => !off && setSavedReady(!!(l?.hero && l?.art?.length)));
    return () => {
      off = true;
    };
  }, [source]);

  // GIF освобождаем, только когда их ссылки ушли из результатов (пересборка, смена баннера),
  // и все — при уходе со страницы. Отзывать на каждое обновление нельзя: превью ещё на экране.
  const liveUrls = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set([...results.values()].map((r) => r.url).filter((u): u is string => !!u));
    for (const u of liveUrls.current) if (!now.has(u)) URL.revokeObjectURL(u);
    liveUrls.current = now;
  }, [results]);
  useEffect(() => () => liveUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const pickNet = (id: GifNetworkId) => {
    setNetId(id);
    try {
      localStorage.setItem(NET_KEY, id);
    } catch {
      /* приватный режим */
    }
  };
  const accepts = (k: string) => !net.sizes || net.sizes.includes(k);
  const chosen = useMemo(
    () => GIF_SIZE_GROUPS.flatMap((g) => g.sizes).filter((k) => sizes.has(k) && accepts(k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizes, net],
  );
  const toggle = (k: string) =>
    setSizes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function ctxFor(src: Source): Promise<LayeredCtx> {
    const key = `${src.kind}|${src.kind === "card" ? src.id : src.image.length}`;
    if (ctxRef.current?.key === key) return ctxRef.current.ctx;
    let base = {} as GeneratePayload;
    if (src.kind === "card") {
      const r = await apiJson<{ card: { form_snapshot: Record<string, unknown> } }>(
        `/api/history/${src.id}`,
      ).catch(() => null);
      base = { ...(r?.card.form_snapshot ?? {}), card_id: src.id } as unknown as GeneratePayload;
    }
    const ctx: LayeredCtx = {
      master: await toDataUrl(src.image),
      base,
      plates: new Map(),
      epoch: Date.now(),
      cardId: src.kind === "card" ? src.id : undefined,
      saved: src.kind === "card" && saved.current ? () => saved.current! : undefined,
    };
    ctxRef.current = { key, ctx };
    return ctx;
  }

  const setResult = (k: string, r: Result) => setResults((prev) => new Map(prev).set(k, r));

  /**
   * Сборка GIF выбранного баннера. Без opts — как в продвинутом режиме (выбранные
   * размеры, сценарий по сети). Простой режим передаёт решения движка ТЗ: размеры
   * (могут быть и вне каталога), движение и повторы. flat — без слоёв: блик поверх.
   */
  async function run(opts?: {
    sizes?: string[];
    mode?: GifMode;
    plays?: number;
    /** Перед каждым размером — для живого хода в простом режиме. */
    onSize?: (k: string) => void;
  }): Promise<Map<string, Result>> {
    const list = opts?.sizes ? opts.sizes.filter(accepts) : chosen;
    const out = new Map<string, Result>();
    if (!source || !list.length) return out;
    const put = (k: string, r: Result) => {
      out.set(k, r);
      setResult(k, r);
    };
    const flat = opts?.mode === "flat";
    setRunning(true);
    setResults(new Map(list.map((k) => [k, { status: "queued" } as Result])));
    try {
      const ctx = await ctxFor(source);
      for (const k of list) {
        const [w, h] = k.split("x").map(Number);
        opts?.onSize?.(k);
        put(k, { status: "running" });
        try {
          const layers = flat ? undefined : await gifLayersFor({ w, h }, ctx);
          const g = await buildGif({
            net,
            w,
            h,
            layers,
            src: ctx.master,
            mode: modeFor(opts?.mode, net, layers),
            wantPlays: opts?.plays,
          });
          const url = URL.createObjectURL(new Blob([g.bytes as BlobPart], { type: "image/gif" }));
          put(k, {
            status: "done",
            url,
            bytes: g.bytes,
            kb: g.bytes.length / 1024,
            checks: g.checks,
            layers,
          });
        } catch (e) {
          put(k, { status: "error", error: e instanceof Error ? e.message : String(e) });
        }
        // Кодирование — в основном потоке: даём интерфейсу перерисоваться между размерами.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!flat) setSavedReady(source.kind === "card" ? true : savedReady);
    } catch (e) {
      toast.error("Не удалось собрать GIF", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
    return out;
  }

  // ---- Простой режим: ТЗ → движок ТЗ → план → баннер (из ТЗ или новый) → проверка → GIF ----
  const [toolMode, setToolMode] = useToolMode("gif");
  const simpleMode = toolMode === "simple";
  const { isGuest, openGate } = useAuthGate();
  const [auto, setAuto] = useState<GifAutoState | null>(null);
  const autoRef = useRef<GifAutoState | null>(null);
  const patchAuto = (p: Partial<GifAutoState>) => {
    const next = autoRef.current ? { ...autoRef.current, ...p } : null;
    autoRef.current = next;
    setAuto(next);
  };
  /** Строка живого хода работы. */
  const say = (line: string) =>
    patchAuto({ log: [...(autoRef.current?.log ?? []), line].slice(-30) });
  const fail = (e: unknown, fallback: string) =>
    patchAuto({
      phase: "error",
      failedAt: autoRef.current?.phase === "error" ? autoRef.current.failedAt : autoRef.current?.phase,
      interrupted: false,
      error: e instanceof Error ? e.message : fallback,
    });
  /** Сборка, которую надо запустить, как только баннер и сеть окажутся в состоянии. */
  const [autoGif, setAutoGif] = useState<GifRun | null>(null);
  const autoBusy = !!auto && GIF_WORKING.has(auto.phase);
  const BANNER_CREDITS = estimateBannerCredits();

  /** Картинка из ТЗ (data URL или ссылка) → карточка Истории, как «Загрузить свой баннер». */
  async function adopt(src: string, name: string): Promise<Source> {
    const blob = await (await fetch(await toDataUrl(src))).blob();
    const s = await upload(new File([blob], `${name}.jpg`, { type: blob.type || "image/jpeg" }));
    if (!s) throw new Error("Не удалось открыть баннер");
    return s;
  }

  /** Решения по понятому ТЗ: сеть, размеры, откуда баннер, цена. */
  function decide(u: TzUnderstood, useAttached: boolean, image?: string) {
    const plan = normalizeGifPlan(u.job.plan ?? {});
    const target = GIF_NETWORK_BY_ID.get(plan.network)!;
    const ok = (k: string) => !target.sizes || target.sizes.includes(k);
    let want = plan.sizes.length ? plan.sizes : u.job.sizes.map((s) => `${s.w}x${s.h}`);
    if (!want.length) want = GIF_DEFAULT_SIZES;
    const skipped = want.filter((k) => !ok(k));
    let sizes = want.filter(ok);
    if (!sizes.length) sizes = GIF_DEFAULT_SIZES.filter(ok);
    const attached =
      image || (useAttached && plan.source === "attached" ? tzImage(u, plan.sourceImageId) : "");
    const flat = plan.motion === "flat";
    const cost = (attached ? 0 : BANNER_CREDITS) + (flat ? 0 : FIRST_BUILD_CREDITS);
    const costNote = [
      attached ? "баннер из ТЗ — бесплатно" : `новый баннер ≈ ${BANNER_CREDITS} кр.`,
      flat ? "блик поверх — без слоёв" : `слои GIF ≈ ${FIRST_BUILD_CREDITS} кр.`,
      "сборка GIF — бесплатно",
      attached ? "" : `не пройдёт проверку по ТЗ — ещё одна генерация ≈ ${BANNER_CREDITS} кр.`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      plan,
      sizes,
      skipped,
      from: (attached ? "attached" : "generated") as "attached" | "generated",
      attached: attached || undefined,
      cost,
      costNote,
    };
  }

  /** Требования ТЗ к баннеру (форматы не проверяются по картинке). */
  const bannerReqs = (u: TzUnderstood): TzRequirement[] => {
    const ids = u.job.banners[0]?.requirementIds ?? [];
    return u.job.requirements.filter((r) => r.kind !== "format" && (!ids.length || ids.includes(r.id)));
  };
  const needsFix = (check: TzCheck | null | undefined, reqs: TzRequirement[]) =>
    !!check && (failedCritical(check, reqs).length > 0 || check.faceCovered);
  /** Описание с обязательными исправлениями по итогам проверки. */
  const fixPrompt = (base: string, check: TzCheck, reqs: TzRequirement[]) => {
    const fixes = failedCritical(check, reqs).map((r) => {
      const q = reqs.find((x) => x.id === r.id)!;
      return q.exact ? `Текст «${q.exact}» обязательно на баннере, дословно и без ошибок.` : q.text;
    });
    if (check.faceCovered) fixes.push("Никакой текст, кнопка или плашка не перекрывают лицо персонажа.");
    return `${base}\n\nОБЯЗАТЕЛЬНО ИСПРАВИТЬ: ${fixes.join(" ")}`;
  };

  /** Форма мастер-баннера: шаблон из ТЗ + описание арт-директора (/api/tz/banner-brief). */
  async function planBanner(u: TzUnderstood): Promise<GeneratePayload> {
    const { job } = u;
    const b = job.banners[0];
    if (!b) throw new Error("Движок ТЗ не описал баннер");
    const tpl = PRESETS.find((p) => p.id === b.presetId) ?? PRESETS[0];
    patchAuto({ phase: "planning", templateName: tpl.name });
    say(`Шаблон «${tpl.name}» — пишу описание баннера`);
    const brief = await apiJson<{ prompt: string; bannerText: string; buttonText: string; ideas: string[] }>(
      "/api/tz/banner-brief",
      {
        method: "POST",
        body: JSON.stringify({
          job,
          banner: b,
          template: { name: tpl.name, description: tpl.description, prompt: tpl.template },
        }),
      },
    );
    // Форма баннер-генератора, собранная здесь же (свои поля у слота и события).
    const isSlot = tpl.id === "preset2";
    const eventLike = tpl.id === "preset3" || tpl.id === "preset5";
    const pal = (job.brand.colors.length ? job.brand.colors : job.style.palette).slice(0, 3);
    const roles = ["primary", "secondary", "accent"];
    return {
      preset_id: tpl.id,
      button_text: brief.buttonText,
      banner_text: brief.bannerText,
      prompt: brief.prompt,
      model: BANNER_MODEL,
      aspect_ratio: b.aspect,
      ad_texts_enabled: true,
      person_enabled: !isSlot,
      person_gender: isSlot ? null : "female",
      brand_name: job.brand.name,
      brand_logo: tzImage(u, job.images.find((i) => i.role === "brand")?.id),
      language: CREATIVE_LANGUAGES.some((l) => l.value === job.language) ? job.language : "auto",
      reference_image: tzImage(u, b.mainRefId),
      subheadline_text: eventLike ? b.sub : "",
      banner_text_enabled: !!brief.bannerText,
      button_text_enabled: !!brief.buttonText,
      subheadline_enabled: eventLike && !!b.sub,
      quality: "medium",
      template_options: pal.length
        ? `Brand palette — ${pal.map((hex, i) => `${roles[i]} ${hex}`).join(", ")}. Use exactly these colors as the banner's dominant palette (primary = dominant, secondary = support, accent = highlights/CTA); keep strong contrast and readability.`
        : "",
    };
  }

  /** Одна генерация баннера → карточка Истории. */
  async function genBanner(payload: GeneratePayload): Promise<Source> {
    const g = await generateImage(payload);
    const name = autoRef.current?.u?.job.banners[0]?.name || "Баннер для GIF";
    // Карточка не создалась — сохраняем сами, чтобы слои GIF было куда положить.
    if (!g.card_id) return adopt(g.image, name);
    const next: Source = { kind: "card", id: g.card_id, name, image: g.image };
    setCards((prev) => [
      { id: next.id, name: next.name, master: { image_url: g.image, width: null, height: null } },
      ...(prev ?? []),
    ]);
    return next;
  }

  /**
   * Баннер по форме base (prompt — вариант описания для этой попытки) → проверка по ТЗ →
   * при autoFix одна попытка исправить → не прошло — ждём решения человека, иначе GIF.
   */
  async function bannerRound(base: GeneratePayload, o: { autoFix: boolean; prompt?: string }) {
    const u = autoRef.current!.u!;
    const reqs = bannerReqs(u);
    patchAuto({ phase: "generating", payload: base, reqs, check: null, accepted: false, built: undefined });
    say("Генерирую баннер");
    let src = await genBanner(o.prompt ? { ...base, prompt: o.prompt } : base);
    patchAuto({ phase: "checking", source: src, image: src.image });
    say("Проверяю баннер по требованиям ТЗ");
    let check = await checkByTz(src.image, reqs).catch(() => null);
    patchAuto({ check });
    if (o.autoFix && check && needsFix(check, reqs)) {
      const bad = failedCritical(check, reqs).length + (check.faceCovered ? 1 : 0);
      patchAuto({ phase: "fixing", retried: true });
      say(`Не прошло пунктов: ${bad} — перегенерирую с исправлениями`);
      src = await genBanner({ ...base, prompt: fixPrompt(base.prompt, check, reqs) });
      patchAuto({ phase: "checking", source: src, image: src.image });
      say("Проверяю исправленный баннер");
      check = await checkByTz(src.image, reqs).catch(() => null);
      patchAuto({ check });
    }
    if (needsFix(check, reqs)) {
      patchAuto({ phase: "verdict" });
      return;
    }
    gifStage(src);
  }

  /** Баннер и решения → в состояние инструмента; сборку запустит эффект ниже. */
  function gifStage(src: Source) {
    const a = autoRef.current!;
    const plan = a.plan!;
    const run: GifRun = {
      image: src.image,
      net: plan.network,
      sizes: a.sizes ?? GIF_DEFAULT_SIZES,
      mode: plan.motion === "auto" ? undefined : plan.motion,
      plays: plan.loops,
    };
    patchAuto({ phase: "gif", source: src, image: src.image, run, built: undefined });
    say(`Собираю GIF под «${GIF_NETWORK_BY_ID.get(plan.network)!.label}»`);
    setNetId(plan.network);
    setSizes(new Set(run.sizes.filter((k) => GIF_CATALOG.has(k))));
    setSource(src);
    setAutoGif(run);
  }

  /** Всё после понимания и плана: баннер (из ТЗ или новый) → проверка → GIF. */
  async function execute() {
    const a = autoRef.current!;
    const u = a.u!;
    if (a.attached) {
      patchAuto({ phase: "checking", image: a.attached });
      say("Сохраняю баннер из ТЗ в Историю");
      const src = await adopt(a.attached, u.job.brand.name ? `${u.job.brand.name} — баннер из ТЗ` : "Баннер из ТЗ");
      patchAuto({ source: src, image: src.image });
      say("Проверяю баннер по требованиям ТЗ");
      // Готовый баннер клиента не перерисовываем — только показываем, что не прошло.
      const check = await checkByTz(src.image, u.job.requirements).catch(() => null);
      patchAuto({ check, reqs: u.job.requirements });
      gifStage(src);
      return;
    }
    await bannerRound(await planBanner(u), { autoFix: true });
  }

  async function runAuto(input: TzRunInput, understood?: TzUnderstood, image?: string) {
    if (isGuest) {
      openGate();
      return;
    }
    const init: GifAutoState = { phase: "reading", log: [], input, handoffImage: image };
    autoRef.current = init;
    setAuto(init);
    setAutoGif(null);
    void rememberLastTz(input, "gif", "GIF-генератор").catch(() => undefined);
    try {
      const u = understood ?? (await understandTz(input, "gif", TZ_TEMPLATES, say));
      const d = decide(u, input.options.useAttached !== false, image);
      patchAuto({ u, ...d });
      if (needsReview(u, d.cost)) {
        patchAuto({ phase: "review" });
        return;
      }
      await execute();
    } catch (e) {
      fail(e, "Не удалось выполнить ТЗ");
    }
  }

  /** «Запускаем» в плане: ответы на вопросы → понять ТЗ заново и сразу дальше, без второго плана. */
  async function confirmPlan(clarifications: string) {
    const a = autoRef.current;
    if (!a?.u || !a.input) return;
    try {
      if (clarifications) {
        const input = withClarifications(a.input, clarifications);
        patchAuto({ phase: "reading", input, log: [] });
        const u = await understandTz(input, "gif", TZ_TEMPLATES, say);
        patchAuto({ u, ...decide(u, input.options.useAttached !== false, a.handoffImage) });
      }
      await execute();
    } catch (e) {
      fail(e, "Не удалось выполнить ТЗ");
    }
  }

  /** «Поправить ТЗ»: назад к вводу (текст хранит черновик поля ТЗ). */
  function backToInput() {
    autoRef.current = null;
    setAuto(null);
    setAutoGif(null);
    void saveAutoSnapshot("gif", null).catch(() => undefined);
  }

  /** Повтор после ошибки или перезагрузки — с того места, где остановились, без повторного разбора. */
  async function resume() {
    const a = autoRef.current;
    if (!a) return;
    if (!a.u) {
      if (a.input) void runAuto(a.input, undefined, a.handoffImage);
      return;
    }
    patchAuto({ error: undefined, interrupted: false, log: [] });
    try {
      if (a.source && a.failedAt === "gif") return gifStage(a.source);
      if (a.source && a.from === "generated" && (a.failedAt === "checking" || a.failedAt === "fixing")) {
        // Баннер уже есть — только проверяем заново, не генерируем.
        const reqs = a.reqs ?? bannerReqs(a.u);
        patchAuto({ phase: "checking" });
        say("Проверяю баннер по требованиям ТЗ");
        const check = await checkByTz(a.source.image, reqs).catch(() => null);
        patchAuto({ check, reqs });
        if (needsFix(check, reqs)) patchAuto({ phase: "verdict" });
        else gifStage(a.source);
        return;
      }
      await execute();
    } catch (e) {
      fail(e, "Не удалось продолжить");
    }
  }

  /** «Попробовать ещё» после проверки: ещё одна генерация с исправлениями. */
  async function retryCheck() {
    const a = autoRef.current;
    if (!a?.payload || !a.check || !a.reqs) return;
    try {
      say("Ещё одна попытка с исправлениями");
      await bannerRound(a.payload, { autoFix: false, prompt: fixPrompt(a.payload.prompt, a.check, a.reqs) });
    } catch (e) {
      fail(e, "Не удалось перегенерировать баннер");
    }
  }

  /** «Принять как есть» → собираем GIF из этого баннера. */
  function acceptCheck() {
    const a = autoRef.current;
    if (!a?.source) return;
    patchAuto({ accepted: true });
    gifStage(a.source);
  }

  /**
   * Правка словами. Новый баннер — перегенерируем с правкой, проверяем, собираем GIF.
   * Баннер клиента не трогаем: правка про анимацию, сеть и размеры — понимаем ТЗ с ней заново.
   */
  async function tweak(text: string) {
    const a = autoRef.current;
    if (!a?.u || !a.input || !a.source) return;
    patchAuto({ log: [], retried: false });
    try {
      if (a.from === "generated" && a.payload) {
        say(`Правка: ${text}`);
        const base = {
          ...a.payload,
          prompt: `${a.payload.prompt}\n\nПРАВКА КЛИЕНТА (обязательно учесть): ${text}`,
        };
        await bannerRound(base, { autoFix: false });
        return;
      }
      const input = withClarifications(
        a.input,
        `Правка после результата (готовый баннер не менять — только анимация, сеть, размеры, повторы): ${text}`,
      );
      patchAuto({ phase: "reading", input });
      say(`Правка: ${text}`);
      const u = await understandTz(input, "gif", TZ_TEMPLATES, say);
      const d = decide(u, false);
      patchAuto({ u, plan: d.plan, sizes: d.sizes, skipped: d.skipped });
      gifStage(a.source);
    } catch (e) {
      fail(e, "Не удалось применить правку");
    }
  }

  // Баннер и сеть уже в состоянии (эффект смены баннера отработал) → собираем GIF.
  useEffect(() => {
    if (!autoGif || running || source?.image !== autoGif.image || netId !== autoGif.net) return;
    const go = autoGif;
    setAutoGif(null);
    void run({
      sizes: go.sizes,
      mode: go.mode,
      plays: go.plays,
      onSize: (k) => say(`Собираю GIF ${k.replace("x", "×")}…`),
    }).then((res) => {
      if (!autoRef.current) return;
      const all = [...res.values()];
      const done = all.filter((r) => r.status === "done");
      const built = {
        done: done.length,
        ok: done.filter((r) => r.checks?.every((c) => c.ok)).length,
        failed: all.length - done.length,
      };
      if (!done.length)
        patchAuto({
          phase: "error",
          failedAt: "gif",
          built,
          error: all.find((r) => r.error)?.error || "Не удалось собрать GIF",
        });
      else patchAuto({ phase: "done", built });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGif, source, netId, running]);

  // Снимок автопилота — переживает перезагрузку (GIF-файлы — нет: их пересоберём из слоёв).
  useEffect(() => {
    if (!autoRef.current) return;
    void saveAutoSnapshot("gif", autoRef.current).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto?.phase, auto?.u, auto?.source, auto?.check, auto?.built, auto?.accepted, auto?.run]);

  // При открытии: передача из другого инструмента — сразу автопилот (без повторного разбора,
  // если ТЗ понималось под GIF); иначе — снимок прошлого запуска. Прерванный перезагрузкой
  // показываем ошибкой с «Продолжить с того же места».
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const h = await takeTzHandoff("gif").catch(() => null);
      if (h) {
        setToolMode("simple");
        const img = typeof h.decided?.image === "string" ? h.decided.image : undefined;
        void runAuto(h.input, h.understood.job.product === "gif" ? h.understood : undefined, img);
        return;
      }
      const snap = await loadAutoSnapshot<GifAutoState>("gif").catch(() => null);
      if (!snap || autoRef.current) return;
      const restored: GifAutoState = GIF_WORKING.has(snap.phase)
        ? { ...snap, phase: "error", failedAt: snap.phase, error: "Прервано перезагрузкой", interrupted: true }
        : snap;
      autoRef.current = restored;
      setAuto(restored);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function zipAll() {
    const done = [...results.entries()].filter(([, r]) => r.status === "done" && r.bytes);
    if (!done.length) return;
    const zip = new JSZip();
    const report = [`GIF под «${net.label}» — ${net.rules}`, ""];
    for (const [k, r] of done) {
      zip.file(`banner-${k}.gif`, r.bytes!);
      const ok = r.checks!.every((c) => c.ok);
      report.push(
        `${ok ? "✓" : "✗"} banner-${k}.gif — ${r.checks!.map((c) => (c.ok ? "" : "НЕ: ") + c.label).join("; ")}`,
      );
    }
    zip.file("ТТ.txt", report.join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gif-${netId}-${done.length}sz.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 5000);
    toast.success(`Скачали ZIP · ${done.length} GIF`);
  }

  const doneCount = [...results.values()].filter((r) => r.status === "done").length;
  const price = source?.kind === "card" && savedReady ? 0 : FIRST_BUILD_CREDITS;
  const tuning = tune ? results.get(tune) : undefined;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="ds-h3 flex items-center gap-2">
            <ImagePlay className="h-6 w-6 text-accent-green" /> GIF-генератор
          </h1>
          <p className="ds-caption mt-1 text-muted-foreground">
            Из готового баннера — анимированные GIF под рекламную сеть: фон, персонаж и надписи
            отдельными слоями, движение и вес — под требования сети.
          </p>
        </div>

        <ModeSwitch mode={toolMode} onChange={setToolMode} />

        {simpleMode ? (
          <SimpleGifPanel
            auto={auto}
            busy={autoBusy || running || uploading}
            hasResults={results.size > 0}
            estimate={`Новый баннер ≈ ${BANNER_CREDITS} кр. (если в ТЗ нет готового), слои GIF ≈ ${FIRST_BUILD_CREDITS} кр., сборка GIF — бесплатно. Не пройдёт проверку по ТЗ — одна перегенерация баннера. Дороже ${REVIEW_CREDITS} кр. — сначала покажу план.`}
            retryCost={BANNER_CREDITS}
            tweakCost={
              auto?.from === "generated"
                ? `≈ ${BANNER_CREDITS + (auto.plan?.motion === "flat" ? 0 : FIRST_BUILD_CREDITS)} кр.: новый баннер${auto.plan?.motion === "flat" ? "" : " и его слои"}`
                : "Баннер не трогаю — GIF пересоберу по правке (слои в Истории — бесплатно)"
            }
            onRun={(i) => void runAuto(i)}
            onGate={(c) => void confirmPlan(c)}
            onBackToInput={backToInput}
            onRetry={() => void resume()}
            onRebuild={() => auto?.source && gifStage(auto.source)}
            onAccept={acceptCheck}
            onRetryCheck={() => void retryCheck()}
            onTweak={(t) => void tweak(t)}
          />
        ) : (
        <>
        <section>
          <div className="ds-caption mb-2 text-muted-foreground">1. Баннер</div>
          {source ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{source.name}</div>
                <div className="ds-caption text-muted-foreground">
                  {source.kind === "card"
                    ? savedReady
                      ? "Слои уже в Истории"
                      : savedReady === null
                        ? "Проверяем слои…"
                        : "Слои соберём при первой сборке"
                    : "Свой файл"}
                </div>
              </div>
              <button
                type="button"
                className="ds-btn ds-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setSource(null)}
                disabled={running}
              >
                Сменить
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-white/5"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "Сохраняем в Историю…" : "Загрузить свой баннер"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
              <div className="ds-caption text-muted-foreground">или из Истории:</div>
              {cards === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : cards.length === 0 ? (
                <p className="ds-caption text-muted-foreground">
                  В Истории пока нет баннеров — создайте его в Баннер-генераторе.
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      onClick={() =>
                        setSource({
                          kind: "card",
                          id: c.id,
                          name: c.name,
                          image: c.master!.image_url!,
                        })
                      }
                      className="overflow-hidden rounded-lg border border-border hover:border-accent-green"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.master!.image_url!}
                        alt={c.name}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="ds-caption mb-2 text-muted-foreground">2. Куда пойдёт</div>
          <div className="flex flex-wrap gap-2">
            {GIF_NETWORKS.map((n) => (
              <button
                key={n.id}
                type="button"
                title={n.hint}
                className={chip(netId === n.id)}
                onClick={() => pickNet(n.id)}
                disabled={running}
              >
                {n.label}
              </button>
            ))}
          </div>
          <p className="ds-caption mt-2 text-muted-foreground">
            {net.hint}. {net.rules}
          </p>
        </section>

        <section>
          <div className="ds-caption mb-2 text-muted-foreground">3. Размеры</div>
          {GIF_SIZE_GROUPS.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="ds-caption mb-1 text-muted-foreground/70">{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.sizes.map((k) => {
                  const ok = accepts(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!ok || running}
                      title={ok ? undefined : `${net.label} такой размер не принимает`}
                      onClick={() => toggle(k)}
                      className={`${chip(ok && sizes.has(k))} ${ok ? "" : "cursor-not-allowed line-through opacity-40"} px-2.5 py-1 text-xs`}
                    >
                      {k.replace("x", "×")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <button
          type="button"
          onClick={() => void run()}
          disabled={!source || !chosen.length || running}
          className="ds-btn ds-btn-primary flex items-center justify-center gap-2 px-5 py-3"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlay className="h-4 w-4" />
          )}
          {running ? "Собираем GIF…" : `Собрать ${chosen.length} GIF`}
          {!running && source ? (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">
              {price ? `≈ ${price} кр.` : "бесплатно"}
            </span>
          ) : null}
        </button>
        {source && price ? (
          <p className="ds-caption -mt-3 text-muted-foreground">
            Первая сборка: персонаж и надписи в стиле баннера (по ≈ 23 кр.) и фон. Дальше —
            бесплатно
            {source.kind === "card" ? ": слои сохранятся в карточку Истории." : " до перезагрузки страницы."}
          </p>
        ) : null}
        </>
        )}
      </div>

      <div className="min-w-0">
        {results.size === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-4 text-center text-muted-foreground">
            {/* Простой режим: здесь продолжается тот же поток — баннер, пока GIF собираются. */}
            {simpleMode && auto?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={auto.image} alt="" className="max-h-56 max-w-full rounded-lg object-contain" />
            ) : autoBusy ? (
              <Loader2 className="h-10 w-10 animate-spin text-accent-green" />
            ) : (
              <ImagePlay className="h-14 w-14 opacity-30" />
            )}
            <div className="ds-caption max-w-xs">
              {!simpleMode
                ? "Выберите баннер, сеть и размеры — здесь появятся GIF с проверкой по требованиям сети."
                : auto?.phase === "review"
                  ? "Проверьте план слева и запустите — GIF появятся здесь."
                  : auto?.phase === "verdict"
                    ? "Баннер готов, но не во всём по ТЗ — решите слева: ещё попытка или принять. Потом соберу GIF."
                    : auto?.phase === "done" && auto.source
                      ? "GIF не сохраняются при перезагрузке — соберите их снова кнопкой слева, слои уже в Истории."
                      : autoBusy
                        ? auto?.image
                          ? "Баннер готов — собираю из него GIF, они появятся здесь."
                          : "Готовлю баннер — GIF появятся здесь."
                        : "Опишите задачу или приложите ТЗ — здесь появятся GIF с проверкой по требованиям сети."}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Готово {doneCount} из {results.size} · под «{net.label}»
              </div>
              <button
                type="button"
                onClick={zipAll}
                disabled={!doneCount || running}
                className="ds-btn ds-btn-secondary flex items-center gap-2 px-4 py-2 text-sm"
              >
                <FileArchive className="h-4 w-4" /> Скачать всё ZIP
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...results.entries()].map(([k, r]) => {
                const ok = r.checks?.every((c) => c.ok);
                return (
                  <div
                    key={k}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <b className="font-mono">{k.replace("x", "×")}</b>
                      {r.status === "done" ? (
                        <span
                          className={`flex items-center gap-1 text-xs ${ok ? "text-accent-green" : "text-[color:var(--status-error)]"}`}
                        >
                          {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {r.kb!.toFixed(0)} КБ · {ok ? "подходит" : "не проходит"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-h-28 items-center justify-center rounded-lg bg-black/40 p-2">
                      {r.status === "done" && r.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.url}
                          alt={k}
                          className="h-auto max-h-64 max-w-full object-contain"
                        />
                      ) : r.status === "error" ? (
                        <span className="ds-caption text-[color:var(--status-error)]">
                          {r.error}
                        </span>
                      ) : r.status === "running" ? (
                        <Loader2 className="h-6 w-6 animate-spin text-accent-green" />
                      ) : (
                        <span className="ds-caption text-muted-foreground">в очереди</span>
                      )}
                    </div>
                    {r.status === "done" && r.checks && !ok ? (
                      <ul className="ds-caption text-muted-foreground">
                        {r.checks
                          .filter((c) => !c.ok)
                          .map((c) => (
                            <li key={c.label}>✗ {c.label}</li>
                          ))}
                      </ul>
                    ) : null}
                    {r.status === "done" ? (
                      <div className="flex gap-2">
                        <a
                          href={r.url}
                          download={`banner-${k}-${netId}.gif`}
                          className="ds-btn ds-btn-primary flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-sm"
                        >
                          <Download className="h-4 w-4" /> Скачать
                        </a>
                        {/* Без слоёв (простой режим, «только блик») настраивать нечего. */}
                        {r.layers ? (
                          <button
                            type="button"
                            onClick={() => setTune(k)}
                            className="ds-btn ds-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            title="Сценарий, повторы, эффекты"
                          >
                            <Settings2 className="h-4 w-4" /> Настроить
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {tune && tuning?.layers && source ? (
        <GifDialog
          open
          onOpenChange={(v) => !v && setTune(null)}
          src={ctxRef.current?.ctx.master ?? source.image}
          size={{ w: Number(tune.split("x")[0]), h: Number(tune.split("x")[1]) }}
          layers={tuning.layers}
        />
      ) : null}
    </div>
  );
}
