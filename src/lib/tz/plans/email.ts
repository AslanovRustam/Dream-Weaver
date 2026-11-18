// План движка ТЗ для генератора писем.
//
// Сверх общей части задания модель решает всё письмо целиком: шаблон из
// каталога (состав блоков и гамма) и почему он, тему, прехедер, заголовок,
// тексты, шаги, кнопки, футер с юридическими строками, ссылку кнопки,
// платёжки, цвета — и описание hero-картинки (по-английски, без текста).
// Все тексты — на языке письма. Клиент кладёт это в черновик и собирает
// готовое письмо (src/components/EmailGenApp.tsx, простой режим).
//
// Серверный модуль, но каталог шаблонов — чистые данные, его можно тянуть сюда.
import { EMAIL_TEMPLATES } from "@/lib/emailTemplates";
import type { TzPlanSpec } from "./types";

export type EmailPlan = {
  templateId: string;
  /** Почему этот шаблон — по-русски, одно предложение. */
  templateWhy: string;
  language: string;
  subject: string;
  preheader: string;
  heroTitle: string;
  heroSubtitle: string;
  body: string;
  stepsTitle: string;
  steps: string[];
  ctaText: string;
  /** Повтор кнопки после текста; пусто — второй кнопки нет. */
  bonusCtaText: string;
  /** Оффер одной строкой на языке письма, цифры дословно. */
  offerLine: string;
  footer: string;
  ctaUrl: string;
  /** Платёжки из ТЗ через запятую; пусто — блок выключен. */
  payments: string;
  /** Блок App Store / Google Play — только если ТЗ про приложение. */
  apps: boolean;
  /** Цвет кнопок и акцентов; пусто — цвет шаблона. */
  accent: string;
  /** Базовый цвет фона письма; пусто — цвет шаблона. */
  base: string;
  /** Промпт hero-картинки по-английски; пусто — картинка не нужна. */
  heroPrompt: string;
  /** Картинка из ТЗ, которую ставим в письмо как есть (готовый баннер письма). */
  heroFromImageId: string;
  /** Требования, которые должны быть видны на самой картинке (обычно пусто). */
  heroRequirementIds: string[];
};

const CATALOG = EMAIL_TEMPLATES.map((t) => `${t.id} — ${t.name}: ${t.when}`).join("; ");
const IDS = new Set(EMAIL_TEMPLATES.map((t) => t.id));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : "");
const url = (v: unknown) => {
  const u = str(v, 300);
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "";
};

/** Привести план письма к безопасной форме (и на клиенте — для передачи из другого инструмента). */
export function normalizeEmailPlan(raw: Record<string, unknown>): EmailPlan {
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((x) => str(x, 140)).filter(Boolean).slice(0, 3);
  const reqIds = (Array.isArray(raw.heroRequirementIds) ? raw.heroRequirementIds : [])
    .map((x) => str(x, 8))
    .filter((x) => /^r\d+$/.test(x))
    .slice(0, 10);
  const templateId = IDS.has(String(raw.templateId)) ? String(raw.templateId) : "welcome";
  return {
    templateId,
    templateWhy: str(raw.templateWhy, 240),
    language: str(raw.language, 8),
    subject: str(raw.subject, 90),
    preheader: str(raw.preheader, 140),
    heroTitle: str(raw.heroTitle, 90),
    heroSubtitle: str(raw.heroSubtitle, 120),
    body: str(raw.body, 700),
    stepsTitle: steps.length ? str(raw.stepsTitle, 60) : "",
    steps,
    ctaText: str(raw.ctaText, 28),
    bonusCtaText: str(raw.bonusCtaText, 28),
    offerLine: str(raw.offerLine, 200),
    footer: str(raw.footer, 500),
    ctaUrl: url(raw.ctaUrl),
    payments: str(raw.payments, 200),
    apps: raw.apps === true,
    accent: hex(raw.accent),
    base: hex(raw.base),
    heroPrompt: str(raw.heroPrompt, 1200),
    heroFromImageId: str(raw.heroFromImageId, 12),
    heroRequirementIds: reqIds,
  };
}

export const plan: TzPlanSpec = {
  tool: "promo email builder (one marketing email: optional hero image on top, headline, subtitle, body, activation steps, CTA buttons, app/payments rows, legal footer; exported as HTML)",
  banners: false,
  planInstructions: [
    "plan ONE finished promo email, ready to send.",
    `templateId — the best starting template from this EMAIL TEMPLATE CATALOG (id — name: when to use): ${CATALOG}. templateWhy: one Russian sentence why.`,
    "language — ISO code of the email language (= job.language). ALL copy below is written in that language, native and natural, never translated word by word.",
    "subject ≤ 70 chars (the offer or hook, no ALL CAPS, at most one emoji only if the brief's tone allows); preheader ≤ 100 chars, complements the subject, never repeats it.",
    "heroTitle ≤ 60 chars, UPPERCASE allowed, wrap the key offer words in **double asterisks**; heroSubtitle ≤ 80 chars or empty.",
    "body: 1–3 short sentences (≤ 400 chars), concrete benefit and conditions from the brief, key numbers in **double asterisks**.",
    "steps: 0–3 short activation steps (only when the offer has a real activation flow: deposit, promo code, opt-in…; else []), stepsTitle a short heading for them or empty.",
    "ctaText ≤ 20 chars imperative; bonusCtaText — a second button repeating the CTA after the text, only for long emails, else empty.",
    "offerLine — the offer as ONE short line in the email language, numbers/currency/conditions exactly as in the brief.",
    "footer — the legal lines from the brief (18+, responsible gaming, T&C, licence) in the email language; none given → a short standard 18+ responsible-gaming line.",
    "ctaUrl — the landing / operator URL the button must open, from the brief or links; else empty. payments — payment systems the brief names, comma-separated, else empty. apps — true only if the brief is about a mobile app.",
    "accent / base — hex: accent = CTA and highlight colour, base = email background, from brand colours / references / style; empty to keep the template's colours. Keep strong contrast between them.",
    "heroPrompt — ONE English image prompt for the email hero (wide 16:9): concrete scene and subject from the offer / game / theme, characters or objects, lighting, mood, palette hex; follow style references. NO text, letters, words or logos in the image (numbers allowed only when they are the offer). Empty only if the email must have no picture (e.g. a plain service notice).",
    "heroFromImageId — id of an attached image to put into the email AS-IS as its hero, only when the brief says to use that picture (a ready email banner); else empty.",
    "heroRequirementIds — ids of requirements that must be visible ON the hero image itself (rare: a required character, object or number on the picture); text requirements belong to the email copy, not the image. Usually [].",
    "Every requirement with an exact text must appear verbatim in one of the copy fields (headline, body, CTA, footer…).",
  ].join(" "),
  planShape:
    "{templateId:string, templateWhy:string, language:string, subject:string, preheader:string, heroTitle:string, heroSubtitle:string, body:string, stepsTitle:string, steps:string[], ctaText:string, bonusCtaText:string, offerLine:string, footer:string, ctaUrl:string, payments:string, apps:boolean, accent:string, base:string, heroPrompt:string, heroFromImageId:string, heroRequirementIds:string[]}",
  normalize: (raw) => normalizeEmailPlan(raw) as unknown as Record<string, unknown>,
};
