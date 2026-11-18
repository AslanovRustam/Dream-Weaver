"use client";

// Автопилот писем: из понятого ТЗ (job + plan письма) — готовый черновик,
// дозапись обязательных строк, которых модель не вписала, и проверка текста
// письма по требованиям ТЗ. Всё синхронное и бесплатное; генерации — в
// EmailGenApp.
import { applyTemplate, EMAIL_TEMPLATES } from "@/lib/emailTemplates";
import { emailNameFromSubject, newDraft, type EmailDraft } from "@/lib/mailing";
import { tzImage, type TzCheck, type TzUnderstood } from "@/lib/tz/client";
import type { TzRequirement } from "@/lib/tz/understand";
import { normalizeEmailPlan, type EmailPlan } from "@/lib/tz/plans/email";

export type { EmailPlan };

/** План письма из job.plan (сервер уже нормализовал — повторяем на всякий случай: передачи из других инструментов). */
export const emailPlanOf = (u: TzUnderstood): EmailPlan => normalizeEmailPlan(u.job.plan ?? {});

export const templateOf = (p: EmailPlan) => EMAIL_TEMPLATES.find((t) => t.id === p.templateId) ?? EMAIL_TEMPLATES[0];

const plain = (s: string) =>
  s
    .replace(/\*\*/g, "")
    .replace(/[\s  ]+/g, " ")
    .trim()
    .toLowerCase();

/** Черновик письма из ТЗ: шаблон → тексты плана → бренд, цвета, ссылки. Лого по сайту и картинку добавляет вызывающий. */
export function draftFromTz(u: TzUnderstood, p: EmailPlan): EmailDraft {
  const { job } = u;
  const t = templateOf(p);
  const d = applyTemplate(newDraft(), t);
  // Тексты плана поверх шаблонных: пустое поле плана — пустое в письме, не шаблонная «рыба».
  const steps = [...p.steps, "", "", ""].slice(0, 3);
  const logo = tzImage(u, job.images.find((i) => i.role === "brand")?.id);
  const colors = [...job.brand.colors, ...job.style.palette];
  let heroSubtitle = p.heroSubtitle;
  let body = p.body;
  // Оффер дословно должен быть в письме: нет ни в заголовке, ни в тексте — ставим подзаголовком или в текст.
  if (p.offerLine && ![p.heroTitle, p.heroSubtitle, p.body].some((x) => plain(x).includes(plain(p.offerLine)))) {
    if (!heroSubtitle) heroSubtitle = p.offerLine;
    else body = body ? `**${p.offerLine}**. ${body}` : `**${p.offerLine}**`;
  }
  const out: EmailDraft = {
    ...d,
    subject: p.subject || t.fields.subject,
    name: emailNameFromSubject(p.subject || t.fields.subject),
    preheader: p.preheader,
    heroTitle: p.heroTitle || p.offerLine || job.offer || t.fields.heroTitle,
    heroSubtitle,
    body,
    stepsTitle: p.stepsTitle,
    steps,
    ctaText: p.ctaText || t.fields.ctaText,
    bonusCtaText: p.bonusCtaText,
    footer: p.footer || job.legal.join(" ") || t.fields.footer,
    ctaUrl: p.ctaUrl || (/^https?:\/\//i.test(job.brand.site) ? job.brand.site : ""),
    payments: p.payments,
    brand: job.brand.name,
    logo,
    brandMode: logo ? "logo" : "text",
    // Лого из ТЗ не отдаём ИИ перерисовывать: кладём медальоном поверх картинки — один в один.
    logoMode: "overlay",
    accent: p.accent || colors[0] || t.accent,
    base: p.base || t.base,
    blocks: {
      ...t.blocks,
      subtitle: !!heroSubtitle,
      body: !!body,
      steps: p.steps.length > 0,
      cta: true,
      bonusCta: !!p.bonusCtaText,
      apps: p.apps,
      // Платёжки шаблона — чужой список; только то, что назвало ТЗ.
      payments: !!p.payments,
      footer: true,
    },
  };
  return out;
}

/** Текст письма, который видит получатель (только включённые блоки). */
function copyOf(d: EmailDraft): string {
  const b = d.blocks;
  return plain(
    [
      d.subject,
      d.preheader,
      d.heroTitle,
      b.subtitle ? d.heroSubtitle : "",
      b.body ? d.body : "",
      b.steps ? [d.stepsTitle, ...d.steps].join(" ") : "",
      b.cta ? d.ctaText : "",
      b.bonusCta ? d.bonusCtaText : "",
      b.footer ? d.footer : "",
    ].join(" "),
  );
}

/**
 * Обязательные строки ТЗ, которых нет в тексте: юридические — в футер,
 * остальные — подзаголовком или в конец текста. Возвращает, что дописано.
 */
export function ensureExact(d: EmailDraft, reqs: TzRequirement[], skipIds: string[] = []): { draft: EmailDraft; added: string[] } {
  let next = d;
  const added: string[] = [];
  for (const r of reqs) {
    if (!r.exact || skipIds.includes(r.id) || r.kind === "format") continue;
    if (copyOf(next).includes(plain(r.exact))) continue;
    if (r.kind === "legal") next = { ...next, footer: `${next.footer} ${r.exact}`.trim(), blocks: { ...next.blocks, footer: true } };
    else if (!next.blocks.subtitle || !next.heroSubtitle) next = { ...next, heroSubtitle: r.exact, blocks: { ...next.blocks, subtitle: true } };
    else next = { ...next, body: `${next.body} **${r.exact}**`.trim(), blocks: { ...next.blocks, body: true } };
    added.push(r.exact);
  }
  return { draft: next, added };
}

/** Проверка текста письма: точные строки ТЗ — есть ли в письме. Остальное не трогаем. */
export function checkCopy(d: EmailDraft, reqs: TzRequirement[], skipIds: string[] = []): TzCheck["results"] {
  const text = copyOf(d);
  return reqs
    .filter((r) => r.exact && r.kind !== "format" && !skipIds.includes(r.id))
    .map((r) => {
      const ok = text.includes(plain(r.exact!));
      return { id: r.id, ok, note: ok ? "есть в тексте письма" : "нет в тексте письма" };
    });
}
