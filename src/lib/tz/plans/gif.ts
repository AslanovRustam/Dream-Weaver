// План движка ТЗ для GIF-генератора.
//
// GIF собирается из готового баннера (src/components/GifGenApp.tsx). Модель решает:
// приложен ли в ТЗ уже готовый баннер (тогда анимируем его) или баннер надо сделать
// заново баннерным конвейером (шаблон из каталога + описание арт-директора — поэтому
// banners: true и клиент шлёт каталог шаблонов); под какую сеть собирать (лимиты
// веса, частота кадров, список размеров); какие размеры; характер движения и повторы.
import { GIF_SIZE_GROUPS } from "@/lib/gifNetworks";
import type { TzPlanSpec } from "./types";

export type GifPlanSource = "attached" | "generate";
export type GifPlanNetwork = "google" | "net150" | "free";
/** auto — сценарий по сети и формату (как в продвинутом режиме). */
export type GifPlanMotion = "auto" | "scene" | "light" | "slides" | "flat";

export type GifTzPlan = {
  source: GifPlanSource;
  /** id картинки из ТЗ, которая и есть готовый баннер (source = attached). */
  sourceImageId: string | null;
  network: GifPlanNetwork;
  networkWhy: string;
  /** «WxH». */
  sizes: string[];
  motion: GifPlanMotion;
  motionWhy: string;
  /** Повторы: 0 — бесконечно (у Google сборщик сам ограничит 30 с). */
  loops: number;
};

const SOURCES: GifPlanSource[] = ["attached", "generate"];
const NETWORKS: GifPlanNetwork[] = ["google", "net150", "free"];
const MOTIONS: GifPlanMotion[] = ["auto", "scene", "light", "slides", "flat"];
const CATALOG = GIF_SIZE_GROUPS.flatMap((g) => g.sizes);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pick = <T extends string>(v: unknown, list: T[], def: T): T => (list.includes(v as T) ? (v as T) : def);

/** «300 x 250», «300×250», {w,h} → «300x250»; мусор и нереальные размеры — null. */
function sizeKey(v: unknown): string | null {
  let w = 0,
    h = 0;
  if (typeof v === "string") {
    const m = v.match(/(\d{2,4})\s*[x×хX*]\s*(\d{2,4})/);
    if (m) [w, h] = [Number(m[1]), Number(m[2])];
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    [w, h] = [Math.round(Number(o.w)), Math.round(Number(o.h))];
  }
  return w >= 50 && h >= 50 && w <= 2000 && h <= 2000 ? `${w}x${h}` : null;
}

export function normalizeGifPlan(raw: Record<string, unknown>): GifTzPlan {
  const sizes = Array.isArray(raw.sizes)
    ? [...new Set(raw.sizes.map(sizeKey).filter((x): x is string => !!x))].slice(0, 12)
    : [];
  const loops = Math.round(Number(raw.loops));
  const source = pick(raw.source, SOURCES, "generate");
  const sourceImageId = source === "attached" ? str(raw.sourceImageId, 16) || null : null;
  return {
    source: source === "attached" && !sourceImageId ? "generate" : source,
    sourceImageId,
    network: pick(raw.network, NETWORKS, "google"),
    networkWhy: str(raw.networkWhy, 240),
    sizes,
    motion: pick(raw.motion, MOTIONS, "auto"),
    motionWhy: str(raw.motionWhy, 240),
    loops: Number.isFinite(loops) && loops >= 0 && loops <= 20 ? loops : 0,
  };
}

export const plan: TzPlanSpec = {
  tool:
    "animated GIF ad banner generator: takes ONE finished static banner (master), splits it into layers (background, character, headline/offer/button lettering) and animates them into GIFs of several display sizes, fitted to an ad network's limits (weight, frame rate, accepted sizes). If the brief has no finished banner, the master banner is generated first from a template catalog (banners[0] is that master; normally exactly ONE banner — all GIF sizes are made from it).",
  banners: true,
  planInstructions: [
    "decide how to make the GIFs.",
    "source: \"attached\" ONLY when one of the brief's images IS a finished ready-to-run banner (composed ad with headline/offer/button) the client wants animated — then sourceImageId is that image id; otherwise \"generate\" (a new master is made from banners[0]; references, logos, screenshots are NOT a finished banner).",
    "network: \"google\" for Google Ads / GDN / КМС / Display & Video 360 (≤150 KB, <5 fps, ≤30 s, only Google sizes); \"net150\" for ExoClick, TrafficStars, Adsterra, PropellerAds, push/pop/adult/iGaming networks or any 150 KB limit; \"free\" for direct placements, sites, partners, socials or no limit mentioned AND no network named. Nothing said → \"google\" if display sizes are asked, else \"net150\". networkWhy: one Russian sentence.",
    `sizes: every GIF size the brief asks for as \"WxH\" (exact pixels; any size is allowed). Nothing asked → pick 3–6 most common for the network from this catalog: ${CATALOG.join(", ")}.`,
    "motion: \"scene\" (elements fly in, offer pulses, button pops — rich), \"light\" (texts still, button/shine/sparkles move — light, fits 150 KB), \"slides\" (headline → offer → … frame by frame — for tiny formats or when the brief asks for frames/slides), \"flat\" (only a shine and sparkles over the unchanged picture — when the brief says don't touch the banner / minimal animation), \"auto\" (best by network and size — default when the brief says nothing about the animation). motionWhy: one Russian sentence.",
    "loops: how many times the animation repeats if the brief says so; 0 = infinite (default).",
    "Exact animation timing, frame-by-frame storyboards, video formats → cannot.",
  ].join(" "),
  planShape:
    '{source:"attached"|"generate", sourceImageId:string|null, network:"google"|"net150"|"free", networkWhy:string, sizes:string[], motion:"auto"|"scene"|"light"|"slides"|"flat", motionWhy:string, loops:number}',
  normalize: (raw) => normalizeGifPlan(raw) as unknown as Record<string, unknown>,
};
