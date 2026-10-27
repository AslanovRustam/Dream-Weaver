"use client";

// Кампания целиком — для страницы кампании и архива: загрузить (из «Моих
// проектов» или текущую из браузера), подтянуть переводы и собрать ZIP со всеми
// материалами. Общий код редактора кампании (CampaignApp) и страницы
// /campaign/view.

import { apiFetch } from "./api-client";
import { briefEmail, briefLandingHtml, briefParts, briefPlayableHtml, briefSource, defaultBrief, type CampaignArt, type CampaignBrief } from "./campaign";
import { sourceHash, type CampaignI18n } from "./campaignI18n";
import { buildEmailHtml } from "./emailExport";
import { EU_LANGS } from "./euLangs";
import { idbGet } from "./idbStore";
import { CAMPAIGN_ART_KEY, CAMPAIGN_BRIEF_KEY } from "./projects";
import type { SceneLoader } from "./scenes/build";

/** Кэш перевода текстов кампании: один на язык и набор текстов. */
export const campaignTrKey = (lang: string, hash: string) => `dw_campaign_tr:${lang}:${hash}`;

/** Бриф из хранилища (старые — дополняются умолчаниями). */
export function normalizeBrief(raw: unknown): CampaignBrief {
  const p = { ...defaultBrief(), ...((raw && typeof raw === "object" ? raw : {}) as Partial<CampaignBrief>) };
  return EU_LANGS.some((l) => l.id === p.lang) ? p : { ...p, lang: "ru" };
}

export type LoadedCampaign = { brief: CampaignBrief; art: CampaignArt | null; projectId: string | null; name: string; updatedAt: string | null };

/** Кампания из «Моих проектов» (id) или текущая — из браузера редактора. */
export async function loadCampaign(id: string | null): Promise<LoadedCampaign> {
  if (id) {
    const res = await apiFetch(`/api/projects?id=${encodeURIComponent(id)}`);
    const body = (await res.json().catch(() => null)) as { project?: { kind: string; name: string; data: { brief?: unknown; art?: CampaignArt | null } }; error?: string } | null;
    if (!res.ok || !body?.project || body.project.kind !== "campaign") throw new Error(body?.error || "Кампания не найдена");
    return { brief: normalizeBrief(body.project.data.brief), art: body.project.data.art ?? null, projectId: id, name: body.project.name, updatedAt: null };
  }
  let brief = defaultBrief();
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_BRIEF_KEY);
    if (raw) brief = normalizeBrief(JSON.parse(raw));
  } catch {
    /* хранилище недоступно */
  }
  const art = ((await idbGet<CampaignArt>(CAMPAIGN_ART_KEY).catch(() => null)) as CampaignArt | null) ?? null;
  let projectId: string | null = null;
  try {
    projectId = window.localStorage.getItem(`${CAMPAIGN_BRIEF_KEY}__project`);
  } catch {
    /* без id */
  }
  return { brief, art: art && art.scene ? art : null, projectId, name: "", updatedAt: null };
}

/** Перевод текстов кампании: из кэша браузера или запросом (для языков без готовых текстов). */
export async function loadCampaignI18n(b: CampaignBrief, canFetch: boolean): Promise<CampaignI18n> {
  const source = briefSource(b);
  if (!Object.keys(source).length) return {};
  const key = campaignTrKey(b.lang, sourceHash(source));
  try {
    const cached = window.localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as CampaignI18n;
  } catch {
    /* без кэша */
  }
  if (!canFetch) return {};
  const res = await apiFetch("/api/translate-texts", { method: "POST", json: { lang: b.lang, texts: source } });
  const data = (await res.json().catch(() => ({}))) as { texts?: CampaignI18n; error?: string };
  if (!res.ok || !data.texts) throw new Error(data.error || "Не удалось перевести");
  try {
    window.localStorage.setItem(key, JSON.stringify(data.texts));
  } catch {
    /* без кэша */
  }
  return data.texts;
}

/** Баннеры кампании списком (старые кампании — один art.banner). */
export function campaignBanners(art: CampaignArt | null | undefined): { name: string; aspect: string; image: string }[] {
  if (!art) return [];
  const list = art.banners?.length ? art.banners : art.banner ? [{ name: "Баннер", aspect: "16:9", image: art.banner }] : [];
  return list.filter((bn) => bn && bn.image);
}

export const campaignSlug = (b: CampaignBrief) =>
  (b.brand.trim() || "campaign").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "campaign";

/** Архив кампании: лендинг, плейбл (web + MRAID), письмо, все баннеры, README. */
export async function buildCampaignZip(full: CampaignBrief, load: SceneLoader, opts: { playable: boolean }): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const parts = briefParts(full);
  if (parts.landing) zip.file("landing/index.html", await briefLandingHtml(full, load));
  if (opts.playable) {
    zip.file("playable/web.html", await briefPlayableHtml(full, load, "web"));
    zip.file("playable/mraid.html", await briefPlayableHtml(full, load, "mraid"));
  }
  if (parts.email) zip.file("email/email.html", buildEmailHtml(briefEmail(full)));
  const banners = parts.banner ? campaignBanners(full.art) : [];
  for (const [i, bn] of banners.entries()) {
    const m = bn.image.match(/^data:image\/(\w+);base64,(.+)$/);
    const name = `banner/${String(i + 1).padStart(2, "0")}-${bn.aspect.replace(":", "x")}`;
    if (m) zip.file(`${name}.${m[1] === "jpeg" ? "jpg" : m[1]}`, m[2], { base64: true });
    else {
      const blob = await fetch(bn.image).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      if (blob) zip.file(`${name}.${blob.type.includes("png") ? "png" : "jpg"}`, blob);
    }
  }
  zip.file(
    "README.txt",
    [
      `Кампания ${full.brand || ""}`.trim(),
      "",
      parts.landing ? "landing/index.html — лендинг, один файл: загрузите на хостинг или в трекер." : "",
      opts.playable ? "playable/mraid.html — плейбл для MRAID-сетей (AppLovin, Unity, Liftoff); web.html — для сайта." : "",
      banners.length ? "banner/ — баннеры кампании (по одному на задание из ТЗ); другие размеры — в генераторе баннеров (раздел «Мои проекты»)." : "",
      parts.email ? "email/email.html — письмо: шапка — баннер кампании без текстов; картинки перед рассылкой разместите на хостинге (генератор писем делает это при выгрузке)." : "",
      "",
      `Ссылка по кнопкам: ${full.link || "не задана — добавьте в редакторах"}`,
    ]
      .filter((l) => l !== "")
      .join("\n"),
  );
  return zip.generateAsync({ type: "blob" });
}

/** Скачать blob файлом. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
