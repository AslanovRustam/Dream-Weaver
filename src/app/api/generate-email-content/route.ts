// Generate email copy with the system LLM (gpt-4o-mini). Fills the constructor's
// text fields — but NOT the brand (the user sets their own brand). Optional
// `topic` seeds the theme from whatever the user already typed.
//
// Body: { topic?: string }
// Response: { fields: { subject, preheader, heroTitle, heroSubtitle, body,
//                       steps[3], ctaText, bonusCtaText, footer } }
import { optionalUser } from "@/lib/auth-server";
import { extractUsage, isOpenRouter, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";

type Body = { topic?: string };

const FIELDS = [
  "subject",
  "preheader",
  "heroTitle",
  "heroSubtitle",
  "body",
  "ctaText",
  "bonusCtaText",
  "footer",
] as const;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // All LLM traffic goes through OpenRouter so every call returns real spend
  // (usage.cost). OpenRouter carries the same models (openai/gpt-4o-mini).
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    return Response.json({ error: "Нет ключа OpenRouter" }, { status: 500 });
  }
  const providers = [
    { url: "https://openrouter.ai/api/v1/chat/completions", key: orKey, model: "openai/gpt-4o-mini" },
  ];

  const topic = (body.topic || "").trim().slice(0, 500);
  const system =
    "Сгенерируй промо-письмо для email-рассылки в тематике iGaming (казино/слоты/беттинг). " +
    "Верни СТРОГО валидный JSON без markdown с полями: subject, preheader, heroTitle, " +
    "heroSubtitle, body, steps (массив из 3 строк — шаги активации бонуса), ctaText " +
    "(короткий, напр. PLAY NOW), bonusCtaText (напр. GET BONUS), footer. " +
    "НЕ указывай конкретный бренд и не выдумывай название компании — пользователь подставит свой бренд. " +
    "В heroTitle, body и steps выделяй ключевые слова двойными звёздочками **вот так**. " +
    "Тексты на русском: живые, короткие, рубленые.";
  const user = topic ? `Тема/оффер: ${topic}` : "Придумай привлекательный бонусный оффер.";

  let content = "";
  let detail = "";
  let usedModel = "";
  let usageData: unknown = null;
  for (const p of providers) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          // OpenRouter Usage Accounting → response.usage.cost (USD). OpenAI
          // rejects unknown params, so only send it to OpenRouter.
          ...(isOpenRouter(p.url) ? { usage: { include: true } } : {}),
        }),
      });
      if (!res.ok) {
        detail = (await res.text()).slice(0, 300);
        continue;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content ?? "";
      if (content) {
        usedModel = p.model;
        usageData = data;
        break;
      }
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
  }
  if (!content) {
    return Response.json({ error: "LLM недоступен", detail }, { status: 502 });
  }

  // Real per-generation cost (себестоимость) from OpenRouter usage accounting.
  const usage = extractUsage(usageData);
  // Per-user usage log (best-effort; only when the caller is signed in).
  const authed = await optionalUser(request);
  if (authed) {
    await recordUsage(authed.id, { model: usedModel, feature: "email-content", type: "llm", ...usage });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
  } catch {
    return Response.json({ error: "LLM вернул не-JSON" }, { status: 502 });
  }

  const fields: Record<string, string | string[]> = {};
  for (const k of FIELDS) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) fields[k] = v.trim();
  }
  const steps = parsed.steps;
  if (Array.isArray(steps)) {
    fields.steps = steps.slice(0, 3).map((s) => String(s));
  }

  return Response.json({ fields, costUsd: usage.costUsd });
}
