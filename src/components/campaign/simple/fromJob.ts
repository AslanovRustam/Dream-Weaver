"use client";

// Простой режим кампании: задание движка ТЗ → бриф кампании.
// Части (галочки ∩ решение по ТЗ), тип трафика, язык, оффер, заголовок,
// кнопка, ссылка, механика и игра, шаблон письма, баннеры (задания + размеры
// из ТЗ), тема и визуал для ИИ-графики. Картинки — отдельно и асинхронно:
// лого (роль brand, иначе с сайта бренда), реф (главный визуал) и гамма.
import { briefDefaults, defaultBrief, type BannerSpec, type CampaignBrief, type CampaignPart, type LuckyRoll } from "@/lib/campaign";
import type { CampaignTzPlan } from "@/lib/campaignTz";
import { EU_LANGS } from "@/lib/euLangs";
import { humanizeOffer, humanizeUnit } from "@/lib/offerText";
import { SCENES } from "@/lib/scenes/presets";
import { normalizeCampaignPlan, type CampaignSimplePlan } from "@/lib/tz/plans/campaign";
import { tzImageByRole, type TzUnderstood } from "@/lib/tz/client";
import type { TzJob } from "@/lib/tz/understand";
import { lookupBrand } from "@/lib/brandLookup";
import { looksLikeUrl, nameFromHost } from "@/lib/brandExtract";
import { shrinkPng } from "@/lib/imageCompress";
import { paletteFromImage, type ImagePalette } from "@/lib/imagePalette";

export type CampaignTicks = Record<CampaignPart, boolean>;

/** Баннер кампании из ТЗ: сверх общего задания — шаблон, подзаголовок и кнопка. */
export type SimpleBannerSpec = BannerSpec & { presetId?: string; sub?: string; cta?: string; /** id требований ТЗ — по ним проверяем баннер. */ req?: string[] };

export type PartDecision = {
  id: CampaignPart;
  on: boolean;
  /** Почему не делаем: снята галочка, не нужно по ТЗ, раздел закрыт. */
  off?: "tick" | "brief" | "section";
  why: string;
};

export type CampaignDecisions = {
  plan: CampaignSimplePlan;
  parts: PartDecision[];
  roll: LuckyRoll;
  /** Язык ТЗ, которого нет в кампании, — делаем на английском. */
  langNote: string;
  linkFrom: "brief" | "site" | "";
  /** Текст для раскладки по креативам (/api/campaign-copy, до 600 знаков). */
  copyBrief: string;
};

const sceneLabel = (id: string) => SCENES.find((s) => s.id === id)?.label ?? id;

/** Название игры — не бренд (в ТЗ «казино Plinko»). */
const isGameName = (v: string) => {
  const x = v.trim().toLowerCase();
  return SCENES.some((sc) => sc.id === x || sc.label.toLowerCase() === x) || /^(plinko|aviator|mines|crash|slots?|sweet bonanza|gates of olympus)$/.test(x);
};

const ratio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 0;
};

/** Баннеры: задания из ТЗ; один креатив и точные размеры — по баннеру на каждую новую пропорцию (до 4). */
function bannerSpecs(job: TzJob, lang: string): SimpleBannerSpec[] {
  const specs: SimpleBannerSpec[] = job.banners.map((bn) => ({
    name: bn.name,
    aspect: bn.aspect,
    text: humanizeOffer(bn.headline, lang).slice(0, 80),
    visual: bn.visual,
    presetId: bn.presetId,
    sub: bn.sub ? humanizeOffer(bn.sub, lang).slice(0, 80) : "",
    cta: bn.cta.slice(0, 24),
    req: bn.requirementIds,
  }));
  if (specs.length === 1) {
    for (const sz of job.sizes) {
      if (specs.length >= 4) break;
      const r = sz.w / sz.h;
      if (r > 4 || r < 0.25 || specs.some((sp) => Math.abs(ratio(sp.aspect) - r) / r < 0.04)) continue;
      specs.push({ ...specs[0], name: `${sz.label || specs[0].name} ${sz.w}×${sz.h}`, aspect: `${sz.w}:${sz.h}` });
    }
  }
  return specs;
}

/** Бриф кампании из задания: всё, что решается без картинок. */
export function briefFromJob(job: TzJob, ticks: CampaignTicks, showPlayable: boolean): { brief: CampaignBrief; d: CampaignDecisions } {
  const plan = normalizeCampaignPlan(job.plan ?? {});
  const want = job.language.trim().toLowerCase();
  const lang = EU_LANGS.some((l) => l.id === want) ? want : "en";
  const langNote = lang === want ? "" : `Языка «${job.language}» в кампании нет — тексты на английском.`;
  const base = defaultBrief(plan.kind, lang);
  const def = briefDefaults(plan.kind, lang);

  // Одна игра на кампанию: у лендинга-сцены — его, иначе — плейбла.
  const sceneId = (plan.landing.mechanic === "scene" ? plan.landing.scene : plan.playable.scene) || base.scene;
  const scene = (SCENES.find((s) => s.id === sceneId)?.id ?? base.scene) as CampaignBrief["scene"];

  // Части: галочки ∩ решение по ТЗ; пусто — что отметили, не отметили ничего — что решило ТЗ.
  const byPlan: CampaignTicks = { landing: plan.landing.make, playable: plan.playable.make, email: plan.email.make, banner: plan.banner.make };
  const avail = (id: CampaignPart) => id !== "playable" || showPlayable;
  const ids: CampaignPart[] = ["landing", "playable", "email", "banner"];
  let chosen = Object.fromEntries(ids.map((id) => [id, ticks[id] && byPlan[id] && avail(id)])) as CampaignTicks;
  if (!ids.some((id) => chosen[id])) chosen = Object.fromEntries(ids.map((id) => [id, ticks[id] && avail(id)])) as CampaignTicks;
  if (!ids.some((id) => chosen[id])) chosen = Object.fromEntries(ids.map((id) => [id, byPlan[id] && avail(id)])) as CampaignTicks;
  if (!ids.some((id) => chosen[id])) chosen.landing = true;
  const why: Record<CampaignPart, string> = { landing: plan.landing.why, playable: plan.playable.why, email: plan.email.why, banner: plan.banner.why };
  const parts: PartDecision[] = ids.map((id) => ({
    id,
    on: chosen[id],
    off: chosen[id] ? undefined : !avail(id) ? "section" : !ticks[id] ? "tick" : "brief",
    why: why[id],
  }));

  const site = job.brand.site || job.links.find((l) => l.role === "brand")?.url || "";
  const siteUrl = site && (/^https?:\/\//i.test(site) ? site : looksLikeUrl(site) ? `https://${site}` : "");
  const link = plan.link || siteUrl;
  const banners = bannerSpecs(job, lang);
  const topic = plan.topic || (job.brand.name && !isGameName(job.brand.name) ? job.brand.name : "") || sceneLabel(scene);
  const headline = humanizeOffer(plan.headline, lang).slice(0, 60);
  const theme = plan.visual || job.style.direction || topic;

  const tzPlan: CampaignTzPlan = {
    summary: job.summary,
    topic,
    visual: theme,
    headline,
    bannerText: banners[0]?.text ?? "",
    landing: { make: chosen.landing, mechanic: plan.landing.mechanic, scene: plan.landing.mechanic === "scene" ? scene : null, why: plan.landing.why },
    playable: { make: chosen.playable, scene, why: plan.playable.why },
    banner: { make: chosen.banner, why: plan.banner.why },
    banners: banners.map((bn) => ({ name: bn.name, aspect: bn.aspect, text: bn.text, visual: bn.visual, why: job.banners.find((x) => x.name === bn.name)?.presetWhy ?? "" })),
    email: { make: chosen.email, template: plan.email.template, why: plan.email.why },
    notes: job.cannot.slice(0, 6),
  };

  const brief: CampaignBrief = {
    ...base,
    topic,
    autoHeadline: plan.headlineFromBrief ? "" : headline,
    headline: plan.headlineFromBrief ? headline : "",
    parts: chosen,
    fixedScene: scene,
    emailTemplate: plan.email.template,
    bannerText: banners[0]?.text ?? "",
    tzPlan,
    copy: null,
    banners,
    brand: job.brand.name && !isGameName(job.brand.name) && !looksLikeUrl(job.brand.name) ? job.brand.name.slice(0, 40) : "",
    offer: job.offer ? humanizeOffer(job.offer, lang).slice(0, 80) : def.offer,
    amount: plan.amount || base.amount,
    unit: (plan.unit && humanizeUnit(plan.unit).slice(0, 12)) || base.unit,
    cta: plan.cta || job.banners[0]?.cta.slice(0, 24) || def.cta,
    link,
    landing: plan.landing.mechanic,
    scene,
    // Фирменный цвет главнее; без него — палитра стиля (реф, если найдётся, её заменит).
    pickColor: job.brand.colors[0] ?? job.style.palette[0],
  };

  const reqs = job.requirements
    .filter((r) => r.kind === "text" || r.kind === "offer" || r.kind === "legal")
    .map((r) => (r.exact ? `обязательно «${r.exact}»` : r.text));
  const copyBrief = [
    job.summary,
    job.offer && `Оффер: ${job.offer}`,
    job.audience && `Аудитория: ${job.audience}`,
    job.geo && `Гео: ${job.geo}`,
    job.style.mood && `Настроение: ${job.style.mood}`,
    ...reqs,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 600);

  return {
    brief,
    d: {
      plan,
      parts,
      roll: { scene, theme, themeName: topic },
      langNote,
      linkFrom: plan.link ? "brief" : link ? "site" : "",
      copyBrief,
    },
  };
}

/** Реф для хранения — сторона до 1024 (как у ручного рефа кампании). */
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

export type JobImages = {
  patch: Partial<CampaignBrief>;
  logoFrom: "brief" | "site" | "";
  refFrom: "main" | "character" | "";
  colorFrom: "brand" | "ref" | "style" | "site" | "";
};

/**
 * Картинки задания → бриф: лого (роль brand, иначе с сайта бренда), реф —
 * главный визуал или персонаж (уходит в баннеры), гамма — фирменный цвет,
 * иначе с рефа или картинки стиля, иначе палитра стиля.
 */
export async function jobImages(u: TzUnderstood, brief: CampaignBrief): Promise<JobImages> {
  const { job } = u;
  const patch: Partial<CampaignBrief> = {};
  let logoFrom: JobImages["logoFrom"] = "";
  let colorFrom: JobImages["colorFrom"] = job.brand.colors.length ? "brand" : job.style.palette.length ? "style" : "";

  const logo = tzImageByRole(u, "brand");
  if (logo) {
    patch.logo = await shrinkPng(logo, 480).catch(() => logo);
    logoFrom = "brief";
  } else {
    const site = job.brand.site || job.links.find((l) => l.role === "brand")?.url || "";
    if (site) {
      try {
        const r = await lookupBrand(site);
        patch.logo = await shrinkPng(r.logo_data_url, 256).catch(() => r.logo_data_url);
        logoFrom = "site";
        if (!brief.brand) patch.brand = (r.brand_name && !looksLikeUrl(r.brand_name) ? r.brand_name : nameFromHost(r.site_url || site)).slice(0, 40);
        if (!job.brand.colors.length && /^#[0-9a-f]{6}$/i.test(r.accent_color_hex)) {
          patch.pickColor = r.accent_color_hex;
          colorFrom = "site";
        }
      } catch {
        /* сайт не открылся — без лого */
      }
    }
  }

  const main = tzImageByRole(u, "main");
  const character = tzImageByRole(u, "character");
  const refSrc = main || character;
  const refFrom: JobImages["refFrom"] = main ? "main" : character ? "character" : "";
  if (refSrc) {
    try {
      patch.ref = await shrinkRef(refSrc);
      patch.refScene = "";
    } catch {
      /* картинка не читается — без рефа */
    }
  }
  // Гамма с картинки — если нет фирменного цвета: реф, иначе картинка стиля.
  const palSrc = patch.ref || tzImageByRole(u, "style");
  if (palSrc && !job.brand.colors.length && colorFrom !== "site") {
    const pal: ImagePalette | null = await paletteFromImage(palSrc).catch(() => null);
    if (pal) {
      patch.refPalette = pal;
      patch.pickColor = undefined;
      colorFrom = "ref";
    }
  }
  return { patch, logoFrom, refFrom, colorFrom };
}
