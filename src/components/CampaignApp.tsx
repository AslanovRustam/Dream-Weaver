"use client";

// Кампания: один бриф — лендинг, плейбл, письмо и баннер в одном стиле.
// Слева бриф, справа превью каждой части (собираются в браузере, без ИИ),
// «Скачать всё» — ZIP с готовыми файлами, «Открыть в редакторе» — черновик
// нужного редактора с брифом внутри, чтобы довести руками и ИИ-графикой.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, ImageIcon, Mail, Megaphone, MonitorSmartphone, Gamepad2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAuthGate } from "@/components/AuthGate";
import { browserLoader } from "@/lib/scenes/build";
import { SCENES } from "@/lib/scenes/presets";
import { buildEmailHtml } from "@/lib/emailExport";
import { persistDraft } from "@/lib/emailDraftsStore";
import { shrinkPng } from "@/lib/imageCompress";
import { LANDING_LANGS, type LandingKind, type LandingLang } from "@/lib/landingKit";
import { landingThemesFor, themeBackground } from "@/lib/landingThemes";
import { isSectionEnabled } from "@/lib/mvp";
import { forgetProject } from "@/lib/projects";
import {
  briefBanner,
  briefEditorDraft,
  briefEmail,
  briefHeadline,
  briefLandingHtml,
  briefPlayableHtml,
  briefTheme,
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

function loadBrief(): CampaignBrief {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...defaultBrief(), ...(JSON.parse(raw) as Partial<CampaignBrief>) };
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
  const logoInput = useRef<HTMLInputElement>(null);

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
        window.localStorage.setItem(KEY, JSON.stringify({ ...b, logo: "" }));
      } catch {
        /* без сохранения */
      }
    }
  }, [b, ready]);

  // Превью — после паузы в наборе.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const id = window.setTimeout(async () => {
      try {
        const [l, p] = await Promise.all([briefLandingHtml(b, browserLoader), showPlayable ? briefPlayableHtml(b, browserLoader) : Promise.resolve("")]);
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
  }, [b, ready, showPlayable]);

  const emailHtml = useMemo(() => (showEmail ? buildEmailHtml(briefEmail(b)) : ""), [b, showEmail]);
  const themes = useMemo(() => landingThemesFor(b.kind).map((t) => ({ t, bg: themeBackground(t.id) })), [b.kind]);

  const switchKind = (kind: LandingKind) => {
    if (kind === b.kind) return;
    const d = defaultBrief(kind, b.lang);
    setB((p) => ({ ...d, brand: p.brand, logo: p.logo, link: p.link, cta: p.cta }));
  };
  const switchLang = (lang: LandingLang) => {
    if (lang === b.lang) return;
    const was = defaultBrief(b.kind, b.lang);
    const now = defaultBrief(b.kind, lang);
    // Свои тексты не трогаем; заменяем только то, что ещё из пресета.
    setB((p) => ({ ...p, lang, offer: p.offer === was.offer ? now.offer : p.offer, cta: p.cta === was.cta ? now.cta : p.cta }));
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
        const d = briefEmail(b);
        await persistDraft(d, !isGuest);
        router.push(`/email?draft=${encodeURIComponent(d.id)}`);
        return;
      }
      if (part === "banner") {
        const s = briefBanner(b);
        window.localStorage.setItem("dw_hub_prompt", s.prompt);
        if (b.brand.trim()) window.localStorage.setItem("brand_name", b.brand.trim());
        if (b.logo) window.localStorage.setItem("brand_logo", b.logo);
        router.push(`/banner?preset=${s.preset}`);
        return;
      }
      const { writes, route } = briefEditorDraft(b, part);
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
      zip.file("landing/index.html", await briefLandingHtml(b, browserLoader));
      if (showPlayable) {
        zip.file("playable/web.html", await briefPlayableHtml(b, browserLoader, "web"));
        zip.file("playable/mraid.html", await briefPlayableHtml(b, browserLoader, "mraid"));
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
  const theme = briefTheme(b);
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
            <label className="mb-1.5 block ds-caption">Бренд</label>
            <input value={b.brand} maxLength={40} onChange={(e) => set("brand", e.target.value)} className={INPUT} placeholder="Название бренда" />
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
          <label className="mb-1.5 block ds-caption">Язык</label>
          <div className="grid grid-cols-2 gap-2">
            {LANDING_LANGS.map((l) => (
              <button key={l.id} type="button" onClick={() => switchLang(l.id)} aria-pressed={b.lang === l.id} className={`rounded-lg border px-2 py-2 text-sm transition ${b.lang === l.id ? CHIP_ON : CHIP_OFF}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Тема — цвет, фон и объекты везде</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {themes.map(({ t, bg }) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setB((p) => ({ ...p, themeId: t.id, headline: "" }))}
                aria-pressed={b.themeId === t.id}
                className={`relative flex h-16 w-24 shrink-0 items-end overflow-hidden rounded-lg border p-1 ${b.themeId === t.id ? "border-accent-green" : "border-border"}`}
                style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }}
              >
                <span className="truncate rounded bg-black/55 px-1 text-[11px] font-semibold text-white">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block ds-caption">Заголовок</label>
          <input value={b.headline} maxLength={60} onChange={(e) => set("headline", e.target.value)} className={INPUT} placeholder={theme.headline[b.lang]} />
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
        <p className="-mt-2 ds-caption">Без ИИ: фон — рисованный фон темы. ИИ-графику добавите в редакторе каждой части.</p>
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
            ? `Заголовок: «${briefHeadline(b)}». Лендинг играется прямо в превью и прокручивается до блоков.`
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
