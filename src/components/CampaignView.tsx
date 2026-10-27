"use client";

// Страница сгенерированной кампании: все материалы в одном месте — лендинг,
// плейбл, баннеры (все задания из ТЗ), письмо и «Как поняли ТЗ»; скачать каждую
// часть или всё архивом; открыть в редакторе. Открывается из «Моих проектов»
// (?id=prj_…) или для текущей кампании из редактора (без id).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Gamepad2, Loader2, Mail, Megaphone, MonitorSmartphone, Pencil } from "lucide-react";
import { toast } from "sonner";

import { useAuthGate } from "@/components/AuthGate";
import { briefEmail, briefHeadline, briefLandingHtml, briefOffer, briefParts, briefPlayableHtml, type CampaignBrief } from "@/lib/campaign";
import { buildCampaignZip, campaignBanners, campaignSlug, loadCampaign, loadCampaignI18n, saveBlob, type LoadedCampaign } from "@/lib/campaignBundle";
import { buildEmailHtml } from "@/lib/emailExport";
import { euLang } from "@/lib/euLangs";
import { isSectionEnabled } from "@/lib/mvp";
import { openProject } from "@/lib/projects";
import { browserLoader } from "@/lib/scenes/build";
import { SCENES } from "@/lib/scenes/presets";

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition hover:bg-white/5 disabled:opacity-50";
const BTN_MAIN = "inline-flex h-10 items-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-50";

export function CampaignView() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { isGuest } = useAuthGate();
  const [data, setData] = useState<LoadedCampaign | null>(null);
  const [error, setError] = useState("");
  const [i18n, setI18n] = useState<CampaignBrief["i18n"]>({});
  const [landing, setLanding] = useState("");
  const [playable, setPlayable] = useState("");
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCampaign(id)
      .then(async (d) => {
        if (!alive) return;
        setData(d);
        const t = await loadCampaignI18n(d.brief, !isGuest).catch(() => ({}));
        if (alive) setI18n(t);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Не удалось открыть кампанию"));
    return () => {
      alive = false;
    };
  }, [id, isGuest]);

  const full = useMemo<CampaignBrief | null>(() => (data ? { ...data.brief, art: data.art, i18n } : null), [data, i18n]);
  const parts = full ? briefParts(full) : null;
  const doPlayable = !!parts?.playable && isSectionEnabled("playable");

  useEffect(() => {
    if (!full) return;
    let alive = true;
    void (async () => {
      const [l, p] = await Promise.all([
        briefParts(full).landing ? briefLandingHtml(full, browserLoader).catch(() => "") : Promise.resolve(""),
        doPlayable ? briefPlayableHtml(full, browserLoader).catch(() => "") : Promise.resolve(""),
      ]);
      if (!alive) return;
      setLanding(l);
      setPlayable(p);
    })();
    return () => {
      alive = false;
    };
  }, [full, doPlayable]);

  const email = useMemo(() => (full && parts?.email ? buildEmailHtml(briefEmail(full)) : ""), [full, parts?.email]);
  const banners = campaignBanners(data?.art);

  if (error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-24 text-center">
        <p className="ds-h3">Кампанию не открыть</p>
        <p className="ds-caption">{error}</p>
        <Link href="/history" className={BTN}>
          <ArrowLeft className="h-4 w-4" /> В историю
        </Link>
      </div>
    );
  }
  if (!full || !data || !parts) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Открываем кампанию…
      </div>
    );
  }

  const b = full;
  const title = data.name || [b.topic.trim() || b.art?.themeName || "Кампания", b.brand.trim()].filter(Boolean).join(" — ");
  const slug = campaignSlug(b);
  const sceneLabel = SCENES.find((s) => s.id === b.scene)?.label ?? b.scene;
  const plan = b.tzPlan;

  const downloadAll = async () => {
    setZipping(true);
    try {
      saveBlob(await buildCampaignZip(full, browserLoader, { playable: doPlayable }), `${slug}-campaign.zip`);
      toast.success("Кампания скачана архивом");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось собрать архив");
    } finally {
      setZipping(false);
    }
  };
  const openEditor = async () => {
    try {
      // Из «Моих проектов» — кладём кампанию в редактор; текущая там уже есть.
      router.push(data.projectId && id ? await openProject(data.projectId) : "/campaign");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть в редакторе");
    }
  };
  const html = (text: string, name: string) => saveBlob(new Blob([text], { type: "text/html" }), name);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-4">
        <Link href={id ? "/history" : "/campaign"} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {id ? "К истории" : "К редактору кампании"}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="ds-overline text-accent-green">Кампания</p>
            <h1 className="ds-h1 mt-1 break-words">{title}</h1>
            <p className="ds-body mt-2 text-muted-foreground">
              {[briefHeadline(b), briefOffer(b), `${b.kind === "sport" ? "спорт" : "казино"} · ${euLang(b.lang).label}`, b.landing === "scene" ? `игра: ${sceneLabel}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void openEditor()} className={BTN}>
              <Pencil className="h-4 w-4" /> Открыть в редакторе
            </button>
            <button type="button" onClick={() => void downloadAll()} disabled={zipping} className={BTN_MAIN}>
              {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Скачать всё (ZIP)
            </button>
          </div>
        </div>
        {plan ? (
          <div className="rounded-xl border border-border bg-elevated/50 p-4 text-sm">
            <p className="font-semibold">Как поняли ТЗ</p>
            {plan.summary ? <p className="ds-caption mt-1">{plan.summary}</p> : null}
            {plan.notes.length ? (
              <ul className="ds-caption mt-2 list-disc pl-4">
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      {parts.landing ? (
        <Section icon={MonitorSmartphone} title="Лендинг" actions={landing ? <button type="button" className={BTN} onClick={() => html(landing, `${slug}-landing.html`)}><Download className="h-4 w-4" /> HTML</button> : null}>
          {landing ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              <iframe title="Лендинг" srcDoc={landing} sandbox="allow-scripts" className="h-[640px] w-full rounded-xl border border-border bg-black" />
              <iframe title="Лендинг — телефон" srcDoc={landing} sandbox="allow-scripts" className="mx-auto h-[640px] w-[360px] rounded-[28px] border-4 border-border bg-black" />
            </div>
          ) : (
            <Loading />
          )}
        </Section>
      ) : null}

      {doPlayable ? (
        <Section icon={Gamepad2} title={`Плейбл · ${sceneLabel}`} actions={playable ? <button type="button" className={BTN} onClick={() => html(playable, `${slug}-playable.html`)}><Download className="h-4 w-4" /> HTML</button> : null}>
          {playable ? <iframe title="Плейбл" srcDoc={playable} sandbox="allow-scripts" className="mx-auto block h-[640px] w-[360px] rounded-[28px] border-4 border-border bg-black" /> : <Loading />}
        </Section>
      ) : null}

      {parts.banner ? (
        <Section icon={Megaphone} title={banners.length > 1 ? `Баннеры (${banners.length})` : "Баннер"}>
          {banners.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {banners.map((bn, i) => (
                <figure key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bn.image} alt={bn.name} className="max-h-[420px] w-full rounded-lg object-contain" />
                  <figcaption className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{bn.name} · {bn.aspect}</span>
                    <a href={bn.image} download={`${slug}-banner-${i + 1}-${bn.aspect.replace(":", "x")}.png`} className={BTN}>
                      <Download className="h-4 w-4" />
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="ds-caption">Баннеров ещё нет — соберите кампанию в редакторе («Собрать кампанию»).</p>
          )}
        </Section>
      ) : null}

      {parts.email ? (
        <Section icon={Mail} title="Письмо" actions={<button type="button" className={BTN} onClick={() => html(email, `${slug}-email.html`)}><Download className="h-4 w-4" /> HTML</button>}>
          <iframe title="Письмо" srcDoc={email} sandbox="" className="mx-auto block h-[720px] w-full max-w-[640px] rounded-xl border border-border bg-white" />
        </Section>
      ) : null}

      {b.link ? (
        <p className="ds-caption">
          Кнопки ведут на: <a href={b.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{b.link} <ExternalLink className="h-3 w-3" /></a>
        </p>
      ) : (
        <p className="ds-caption">Ссылка по кнопкам не задана — добавьте её в редакторе кампании.</p>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, actions, children }: { icon: typeof Mail; title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 ds-h3">
          <Icon className="h-5 w-5 text-accent-green" /> {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-border text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Собираем…
    </div>
  );
}
