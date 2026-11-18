// Движок ТЗ, шаг 2 — понять задачу целиком, а не разложить по полям.
//
// Сильная модель (gpt-5.5, видит картинки) читает ТЗ как арт-директор и
// аккаунт-менеджер сразу: что за кампания, для кого, какой оффер (дословно),
// какие тексты обязательны, что на референсах и зачем они приложены, какие
// креативы и форматы нужны, какой шаблон из каталога подходит каждому, что
// сделать нельзя и какие допущения пришлось принять. Отдельно — список
// требований: по нему потом проверяется готовый результат.
//
// Серверный модуль.
import { OFFER_RULE } from "@/lib/offerText";
import { BANNER_SIZE_GROUPS } from "@/lib/bannerSizes";
import type { TzBundle } from "./ingest";
import { TZ_PLANS, type TzPlanSpec, type TzProduct } from "./plans";

export const TZ_MODEL = process.env.TZ_MODEL || "gpt-5.5";

export const TZ_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4"] as const;

export type TzRequirement = {
  id: string;
  /** По-русски, проверяемо: «На баннере текст „+150% к депозиту“». */
  text: string;
  kind: "text" | "offer" | "visual" | "legal" | "brand" | "format" | "other";
  /** Для текстов — точная строка, которая должна быть на креативе. */
  exact?: string;
};

export type TzBanner = {
  name: string;
  aspect: (typeof TZ_RATIOS)[number];
  headline: string;
  cta: string;
  /** Подзаголовок / оффер второй строкой, если ТЗ его просит. */
  sub: string;
  /** Что на баннере — по-русски, конкретно: герой, сцена, объекты, свет. */
  visual: string;
  presetId: string;
  presetWhy: string;
  /** Картинка-референс главного визуала (игра, слот, персонаж) — уходит в генерацию картинкой. */
  mainRefId: string | null;
  requirementIds: string[];
};

export type TzJob = {
  summary: string;
  language: string;
  geo: string;
  audience: string;
  brand: { name: string; site: string; colors: string[] };
  offer: string;
  legal: string[];
  style: { direction: string; palette: string[]; mood: string };
  images: { id: string; role: "style" | "main" | "brand" | "character" | "layout" | "irrelevant"; note: string }[];
  links: { url: string; role: "brand" | "game" | "reference" | "competitor" | "other"; note: string }[];
  banners: TzBanner[];
  /** Группы размеров для ресайзов (id из каталога размеров). */
  sizeGroups: string[];
  /** Точные размеры из ТЗ (px) — ресайзы мастера. */
  sizes: { w: number; h: number; label: string }[];
  requirements: TzRequirement[];
  cannot: string[];
  assumptions: string[];
  /** Для какого инструмента понято задание. */
  product: TzProduct;
  /** Решения, своё у каждого инструмента (см. src/lib/tz/plans). */
  plan: Record<string, unknown>;
};

export type TemplateInfo = { id: string; name: string; description: string };

const SIZE_GROUPS = BANNER_SIZE_GROUPS.map((g) => `${g.id} — ${g.title}${g.subtitle ? ` (${g.subtitle})` : ""}`).join("\n");

const SYSTEM = (templates: TemplateInfo[], spec: TzPlanSpec) =>
  [
    "You are the lead art director AND account manager of a top iGaming / betting creative studio. You receive a client brief (ТЗ) in any form: a chat message, a document, links, reference images. Understand the TASK, not form fields.",
    "Read EVERYTHING: the text, every opened link (its role: operator/brand site, game example, style reference, competitor), every image (what it shows and WHY the client attached it).",
    `The creatives are made by this tool: ${spec.tool}. Plan everything for THIS tool.`,
    "Then produce a production job:",
    "- summary: what the client wants, 1–3 sentences, Russian.",
    "- language: ISO code of the language the creatives must be written in (from the brief / geo; default the brief's language). geo, audience: short, Russian.",
    "- brand: operator name, site, brand colours as hex if visible on images/site.",
    `- offer: the offer VERBATIM as the client wrote it (numbers, currency, free spins, conditions). ${OFFER_RULE}`,
    "- legal: required legal lines (18+, T&C, responsible gaming) verbatim if given.",
    "- style: concrete art direction (direction, 2–4 hex palette, mood) — from references when present, else from the theme.",
    "- images: for EACH image id: role — style (look to follow), main (the main visual/game/slot to show), brand (logo), character, layout (composition to copy), irrelevant; note in Russian what it shows.",
    "- links: for each link — role and a Russian note.",
    spec.banners ? "- banners: the distinct CREATIVES. Several SIZES of the same creative are NOT separate banners: that is ONE banner (master, in the most important / largest format) + resizes listed in sizes. Separate entries only when texts or visuals differ, or the brief explicitly asks for variants / A-B. Nothing specified → ONE banner 16:9. Each: name (Russian), aspect (one of " + TZ_RATIOS.join(", ") + "), headline / sub / cta in the creatives' language (verbatim from the brief when given; else write strong short ones: headline ≤ 40 chars, cta ≤ 20), visual (Russian, concrete: hero, scene, objects, light), presetId — the BEST template from the catalog below for this banner, presetWhy (Russian, one sentence), mainRefId (image id with role main to put into the banner, else null), requirementIds." : "- banners: [] (this tool does not make banners); sizes: []; sizeGroups: [].",
    spec.banners ? "- sizes: every exact pixel size the brief asks for, as {w,h,label} (label: platform, Russian). sizeGroups: resize groups for the platforms the brief mentions (ids below; none mentioned and no sizes → social-posts, stories, web-horizontal)." : "",
    spec.planInstructions ? `- plan: ${spec.planInstructions}\n  plan shape: ${spec.planShape}` : "- plan: {}",
    "- links: an operator / casino / bookmaker site is role brand.",
    "- requirements: a CHECKLIST of everything the finished creatives must satisfy — required texts, offer, mandatory visual elements, legal, brand, formats. Concrete and checkable, Russian, ids r1, r2…",
    "  exact: ONLY for text that must literally appear on the creative — the string EXACTLY as it must be printed, in the creatives' language (e.g. the localized offer numbers «100% … 5 000 000 so‘m», the CTA, «18+»). Empty for everything else (language, style, formats, brand colours).",
    "- cannot: what we cannot do as written (video, animation timing, exact fonts, licensed characters…), Russian.",
    "- assumptions: what the brief does not say and you decided (Russian), so the client sees it.",
    "Never invent an offer, brand or numbers the brief does not contain — put it into assumptions instead and keep texts generic.",
    "",
    spec.banners && templates.length ? "TEMPLATE CATALOG (id — name: description):\n" + templates.map((t) => `${t.id} — ${t.name}: ${t.description}`).join("\n") + "\n" : "",
    spec.banners ? "RESIZE GROUPS:\n" + SIZE_GROUPS + "\n" : "",
    "Return STRICT JSON with exactly these keys: summary, language, geo, audience, brand{name,site,colors}, offer, legal[], style{direction,palette,mood}, images[{id,role,note}], links[{url,role,note}], banners[{name,aspect,headline,sub,cta,visual,presetId,presetWhy,mainRefId,requirementIds}], sizes[{w,h,label}], sizeGroups[], requirements[{id,text,kind,exact}], cannot[], assumptions[], plan.",
  ]
    .filter(Boolean)
    .join("\n");

function bundlePrompt(b: TzBundle): string {
  const links = b.links.length
    ? "\n\nLINKS (opened by us):\n" +
      b.links
        .map((l) =>
          l.ok
            ? `- ${l.url} [${l.kind}] «${l.name}»${l.title ? ` title: «${l.title}»` : ""}${l.description ? ` description: «${l.description}»` : ""}${l.text ? `\n  page text: ${l.text.slice(0, 1500)}` : ""}`
            : `- ${l.url} — could not open (${l.error ?? "error"})`,
        )
        .join("\n")
    : "";
  const imgs = b.images.length ? `\n\nIMAGES: ${b.images.map((i) => `${i.id} (${i.from})`).join(", ")} — attached below in this order.` : "";
  return `BRIEF (ТЗ):\n"""${b.text || "(no text — only images/links)"}"""${links}${imgs}`;
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const arr = <T,>(v: unknown, f: (x: unknown) => T | null, max = 20): T[] =>
  Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null).slice(0, max) : [];
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : null);

export function normalizeJob(
  j: Record<string, unknown>,
  b: TzBundle,
  templates: TemplateInfo[],
  product: TzProduct = "banner",
): TzJob {
  const spec = TZ_PLANS[product];
  const ids = new Set(templates.map((t) => t.id));
  const imgIds = new Set(b.images.map((i) => i.id));
  const groups = new Set(BANNER_SIZE_GROUPS.map((g) => g.id));
  const o = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
  const brand = o(j.brand);
  const style = o(j.style);
  const requirements = arr<TzRequirement>(j.requirements, (x) => {
    const r = o(x);
    const text = s(r.text, 240);
    if (!text) return null;
    const kinds = ["text", "offer", "visual", "legal", "brand", "format", "other"];
    return { id: s(r.id, 8) || "r", text, kind: (kinds.includes(String(r.kind)) ? r.kind : "other") as TzRequirement["kind"], exact: s(r.exact, 160) || undefined };
  }, 30).map((r, i, all) => ({
    ...r,
    // id модели — на них ссылаются баннеры; кривые или повторные — по порядку.
    id: /^r\d+$/.test(r.id) && all.findIndex((x) => x.id === r.id) === i ? r.id : `r${i + 1}`,
  }));
  let banners = arr<TzBanner>(j.banners, (x) => {
    const r = o(x);
    const aspect = (TZ_RATIOS as readonly string[]).includes(String(r.aspect)) ? (r.aspect as TzBanner["aspect"]) : "16:9";
    const presetId = ids.has(String(r.presetId)) ? String(r.presetId) : templates[0]?.id ?? "preset1";
    const ref = String(r.mainRefId ?? "");
    return {
      name: s(r.name, 80) || "Баннер",
      aspect,
      headline: s(r.headline, 60),
      sub: s(r.sub, 80),
      cta: s(r.cta, 28),
      visual: s(r.visual, 900),
      presetId,
      presetWhy: s(r.presetWhy, 240),
      mainRefId: imgIds.has(ref) ? ref : null,
      requirementIds: arr(r.requirementIds, (y) => (typeof y === "string" ? y : null)),
    };
  }, 8);
  if (!spec.banners) banners = [];
  else if (!banners.length)
    banners = [{ name: "Баннер", aspect: "16:9", headline: "", sub: "", cta: "", visual: "", presetId: templates[0]?.id ?? "preset1", presetWhy: "", mainRefId: null, requirementIds: [] }];
  const roles = ["style", "main", "brand", "character", "layout", "irrelevant"];
  const linkRoles = ["brand", "game", "reference", "competitor", "other"];
  return {
    summary: s(j.summary, 600),
    language: s(j.language, 8) || "ru",
    geo: s(j.geo, 80),
    audience: s(j.audience, 160),
    brand: { name: s(brand.name, 60), site: s(brand.site, 200), colors: arr(brand.colors, hex, 4) },
    offer: s(j.offer, 200),
    legal: arr(j.legal, (x) => s(x, 200) || null, 5),
    style: { direction: s(style.direction, 600), palette: arr(style.palette, hex, 4), mood: s(style.mood, 120) },
    images: arr(j.images, (x) => {
      const r = o(x);
      const id = String(r.id ?? "");
      if (!imgIds.has(id)) return null;
      return { id, role: (roles.includes(String(r.role)) ? r.role : "style") as TzJob["images"][number]["role"], note: s(r.note, 200) };
    }, 8),
    links: arr(j.links, (x) => {
      const r = o(x);
      const url = s(r.url, 300);
      if (!url) return null;
      return { url, role: (linkRoles.includes(String(r.role)) ? r.role : "other") as TzJob["links"][number]["role"], note: s(r.note, 200) };
    }, 8),
    banners,
    sizes: arr(j.sizes, (x) => {
      const r = o(x);
      const w = Math.round(Number(r.w)), h = Math.round(Number(r.h));
      return w >= 50 && h >= 50 && w <= 4000 && h <= 4000 ? { w, h, label: s(r.label, 60) } : null;
    }, 20),
    sizeGroups: arr(j.sizeGroups, (x) => (typeof x === "string" && groups.has(x) ? x : null), 6),
    requirements,
    cannot: arr(j.cannot, (x) => s(x, 240) || null, 10),
    assumptions: arr(j.assumptions, (x) => s(x, 240) || null, 10),
    product,
    plan: (() => {
      const raw = o(j.plan);
      try {
        return spec.normalize ? spec.normalize(raw) : raw;
      } catch {
        return {};
      }
    })(),
  };
}

export async function understandTz(
  b: TzBundle,
  templates: TemplateInfo[],
  apiKey: string,
  product: TzProduct = "banner",
): Promise<{ job: TzJob; usage: unknown }> {
  const spec = TZ_PLANS[product];
  const content: unknown[] = [{ type: "text", text: bundlePrompt(b) }];
  for (const im of b.images) content.push({ type: "image_url", image_url: { url: im.src, detail: "high" } });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: TZ_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM(templates, spec) },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  });
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(data?.error?.message || `модель ответила ${res.status}`);
  const raw = JSON.parse(data?.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
  return { job: normalizeJob(raw, b, templates, product), usage: data };
}
