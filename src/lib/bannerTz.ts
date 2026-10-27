// ТЗ баннера → усиленный бриф, сплавленный с выбранным шаблоном.
//
// Разбор полей переносил ТЗ как есть («Глубокий фиолетовый фон, неоновые
// конфеты…») и ничего не знал о шаблоне. Здесь модель — арт-директор: берёт
// всё ценное из ТЗ (оффер, объекты, палитру, эффекты, настроение) и шаблон
// (его раскладку, стиль, иерархию) и пишет одно описание баннера — сильнее
// и цельнее обоих: главный визуал, композиция, свет, глубина, детали. Плюс
// тексты баннера и короткий список «что усилили».
//
// Серверный модуль: вызывается из /api/parse-brief для product: "banner".

import { OFFER_RULE } from "./offerText";

export type BannerTemplateInfo = { name: string; description: string; prompt: string };

export type EnhancedBannerBrief = {
  /** Описание баннера — в поле «Описание» (оно же SUBJECT шаблона). */
  prompt: string;
  bannerText: string;
  buttonText: string;
  /** Что усилили по сравнению с ТЗ — 3–5 коротких пунктов, по-русски. */
  ideas: string[];
};

const SYSTEM = [
  "You are the art director of a top iGaming creative studio. A marketer gives you a banner brief (ТЗ) and the TEMPLATE the banner will be rendered with.",
  "Your job: write ONE banner description that fuses the brief with the template into an epic, cinematic quintessence — stronger than either alone.",
  "- Keep everything valuable from the brief: the offer and numbers, named objects, palette, effects, mood, any required texts. Never drop the offer.",
  "- Fit it to the template: its layout, hierarchy, style and key-visual logic. Do not fight the template — the template's structure wins on composition.",
  "- Upgrade it: one dominant hero visual (what exactly, how it is lit, what makes it feel premium), depth layers (foreground / mid / background), lighting (rim light, glow, volumetric rays), materials and textures, motion and energy (particles, bursts, sparkles), a clear 2–3 colour palette with an accent for the CTA.",
  "- Concrete and visual, no marketing fluff, no camera jargon overload. No real third-party brands unless the brief names them.",
  `- ${OFFER_RULE}`,
  "Write the description in the language of the brief (usually Russian), 70–140 words, as one flowing paragraph the image model can follow.",
  'Return STRICT JSON {"prompt": string, "bannerText": string (headline on the banner, <=50 chars, from the brief if given), "buttonText": string (<=24 chars), "ideas": string[] (3-5 short Russian bullets: what you upgraded vs the brief)}.',
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function enhanceBannerBrief(
  brief: string,
  template: BannerTemplateInfo | null,
  apiKey: string,
): Promise<{ result: EnhancedBannerBrief | null; usage: unknown }> {
  const tpl = template
    ? `TEMPLATE «${template.name}» — ${template.description}\nTemplate prompt (how it renders):\n${template.prompt.slice(0, 3000)}`
    : "TEMPLATE: a premium casino / betting promo banner.";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${tpl}\n\nBRIEF (ТЗ):\n"""${brief}"""` },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) return { result: null, usage: null };
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  try {
    const j = JSON.parse(data?.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
    const prompt = str(j.prompt, 1600);
    if (!prompt) return { result: null, usage: data };
    return {
      result: {
        prompt,
        bannerText: str(j.bannerText, 60),
        buttonText: str(j.buttonText, 28),
        ideas: Array.isArray(j.ideas) ? j.ideas.map((x) => str(x, 140)).filter(Boolean).slice(0, 5) : [],
      },
      usage: data,
    };
  } catch {
    return { result: null, usage: data };
  }
}
