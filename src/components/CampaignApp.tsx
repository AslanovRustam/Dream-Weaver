"use client";

// Кампания: один бриф — лендинг, плейбл, письмо и баннер в одном стиле.
// Слева бриф: референс (с него цвета, фон и тексты), язык, оффер, механики;
// справа превью каждой части (собираются в браузере). «Скачать всё» — ZIP
// с готовыми файлами, «Открыть в редакторе» — черновик нужного редактора
// с брифом внутри, чтобы довести руками и ИИ-графикой в стиле рефа.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, ImageIcon, Loader2, Mail, Megaphone, MonitorSmartphone, Gamepad2, Pipette, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAuthGate } from "@/components/AuthGate";
import { browserLoader } from "@/lib/scenes/build";
import { SCENES } from "@/lib/scenes/presets";
import { buildEmailHtml } from "@/lib/emailExport";
import { persistDraft } from "@/lib/emailDraftsStore";
import { shrinkPng } from "@/lib/imageCompress";
import { apiFetch } from "@/lib/api-client";
import { sourceHash, type CampaignI18n } from "@/lib/campaignI18n";
import { EU_LANGS, isBuiltInLang } from "@/lib/euLangs";
import { paletteFromImage } from "@/lib/imagePalette";
import type { LandingKind } from "@/lib/landingKit";
import { isSectionEnabled } from "@/lib/mvp";
import { forgetProject } from "@/lib/projects";
import {
  briefAccent,
  briefBanner,
  briefDefaults,
  briefEditorDraft,
  briefEmail,
  briefHeadline,
  briefLandingHtml,
  briefPlayableHtml,
  briefSource,
  defaultBrief,
  type CampaignBrief,
  type CampaignLanding,
} from "@/lib/campaign";

const KEY = "dw_campaign_brief";
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
  const { isGuest } = useAuthGate();
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
  const full = useMemo(() => ({ ...b, i18n }), [b, i18n]);
  const logoInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  useEffect(() => setHasEyeDropper(typeof window !== "undefined" && "EyeDropper" in window), []);

  const showPlayable = isSectionEnabled("playable");
  const showEmail = isSectionEnabled("email");
  const set = <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => setB((p) => ({ ...p, [k]: v }));

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
        const [l, p] = await Promise.all([briefLandingHtml(full, browserLoader), showPlayable ? briefPlayableHtml(full, browserLoader) : Promise.resolve("")]);
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
  }, [full, ready, showPlayable]);

  const emailHtml = useMemo(() => (showEmail ? buildEmailHtml(briefEmail(full)) : ""), [full, showEmail]);
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
      zip.file("landing/index.html", await briefLandingHtml(full, browserLoader));
      if (showPlayable) {
        zip.file("playable/web.html", await briefPlayableHtml(full, browserLoader, "web"));
        zip.file("playable/mraid.html", await briefPlayableHtml(full, browserLoader, "mraid"));
      }
      if (showEmail) zip.file("email/email.html", emailHtml);
      zip.file(
        "README.txt",
        [
          `Кампания ${b.brand || ""}`.trim(),
          "",
          "landing/index.html — лендинг, один файл: загрузите на хостинг или в трекер.",
          showPlayable ? "playable/mraid.html — плейбл для MRAID-сетей (AppLovin, Unity, Liftoff); web.html — для сайта." : "",
          showEmail ? "email/email.html — письмо; картинки сторов перед рассылкой залейте через генератор писем." : "",
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
    { id: "landing", label: "Лендинг", icon: MonitorSmartphone, on: true },
    { id: "playable", label: "Плейбл", icon: Gamepad2, on: showPlayable },
    { id: "email", label: "Письмо", icon: Mail, on: showEmail },
    { id: "banner", label: "Баннер", icon: Megaphone, on: true },
  ];
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

        <div className="grid grid-cols-2 gap-2">
          {(["casino", "sport"] as LandingKind[]).map((k) => (
            <button key={k} type="button" onClick={() => switchKind(k)} aria-pressed={b.kind === k} className={`rounded-lg border px-3 py-2 text-sm transition ${b.kind === k ? CHIP_ON : CHIP_OFF}`}>
              {k === "casino" ? "Казино" : "Ставки на спорт"}
            </button>
          ))}
        </div>

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
            <div className="w-full overflow-x-auto">
              <iframe title="Письмо кампании" srcDoc={emailHtml} sandbox="" className="mx-auto block h-[720px] w-[640px] rounded-xl border border-border bg-white" />
            </div>
          ) : (
            <div className="flex w-full max-w-xl flex-col items-center gap-3 py-10 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="ds-h4">Баннер рисует ИИ — в генераторе баннеров</p>
              <p className="ds-caption">
                Откроем генератор с вашим брендом, лого и промптом из оффера и темы: «{briefBanner(b).prompt}»
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
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
                ? "Письмо по шаблону под ваш тип трафика — тема, заголовок, кнопка и цвет из брифа."
                : "Генерация баннера тратит кредиты; остальные части кампании — бесплатно."}
        </p>
      </section>
    </div>
  );
}
