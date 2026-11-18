// Один вызов «инструкция + текст и картинки → JSON» для двух провайдеров.
//
// Модель выбирает провайдера по названию: «claude-…» — Anthropic (официальный
// SDK), остальное — OpenAI chat/completions. Так шаг движка ТЗ переключается
// одной переменной окружения (TZ_MODEL, TZ_CHECK_MODEL, TZ_BRIEF_MODEL) и
// сравнивается на одних и тех же ТЗ.
//
// Claude:
//  - инструкция (system) кэшируется — каталог шаблонов и правила одинаковы у всех
//    запросов, повторное чтение из кэша стоит 5–10 % цены;
//  - мышление у Opus 5.5 / Haiku 5.5 всегда включено, глубину задаёт effort;
//  - Opus и Sonnet 5.5 — с серверным запасным вариантом на отказ (fallbacks: "default");
//  - отказ (stop_reason "refusal") — ошибка с категорией, а не пустой ответ.
//
// usage — в форме OpenAI ({prompt_tokens, completion_tokens, cost}), чтобы учёт
// расходов (lib/usage.ts) брал готовую цену в долларах.
//
// Серверный модуль.
import Anthropic from "@anthropic-ai/sdk";

import { llmCostUsd } from "@/lib/openai-pricing";

export type LlmPart = { type: "text"; text: string } | { type: "image"; url: string; detail?: "low" | "high" | "auto" };

export type LlmUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cost: number;
};

export type LlmResult = { json: Record<string, unknown>; usage: LlmUsage; model: string; ms: number; raw: string };

/** Цены Claude за 1M токенов: вход, выход, чтение кэша (запись кэша — 1,25 × вход). */
const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export const isClaude = (model: string) => model.startsWith("claude-");

/** JSON из ответа модели: от первой «{» до последней «}» (без обёрток ```json). */
function parseJson(text: string): Record<string, unknown> {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("модель не вернула JSON");
  return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
}

let anthropic: Anthropic | null = null;
const client = () => (anthropic ??= new Anthropic());

async function callClaude(o: {
  model: string;
  system: string;
  parts: LlmPart[];
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs: number;
}): Promise<Omit<LlmResult, "ms" | "json"> & { text: string }> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = o.parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s.exec(p.url);
    return m
      ? { type: "image", source: { type: "base64", media_type: m[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: m[2] } }
      : { type: "image", source: { type: "url", url: p.url } };
  });
  // Запасной вариант на отказ — только там, где он есть (Opus / Sonnet 5.5).
  const withFallback = o.model === "claude-opus-5-5" || o.model === "claude-sonnet-5-5";
  const res = await client().beta.messages.create(
    {
      model: o.model,
      max_tokens: o.maxTokens,
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      ...(o.effort ? { output_config: { effort: o.effort } } : {}),
      system: [
        {
          type: "text",
          text: `${o.system}\n\nRespond with ONLY the JSON object — no prose before or after it, no code fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
    },
    { timeout: o.timeoutMs },
  );
  if (res.stop_reason === "refusal") {
    const d = (res as { stop_details?: { category?: string | null } | null }).stop_details;
    throw new Error(`Claude отказался${d?.category ? ` (${d.category})` : ""}`);
  }
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const u = res.usage;
  const price = CLAUDE_PRICES[res.model] ?? CLAUDE_PRICES[o.model] ?? { input: 0, output: 0, cacheRead: 0 };
  const inTok = u.input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const outTok = u.output_tokens ?? 0;
  const cost = (inTok * price.input + cacheWrite * price.input * 1.25 + cacheRead * price.cacheRead + outTok * price.output) / 1e6;
  return {
    text,
    raw: text,
    model: res.model,
    usage: { prompt_tokens: inTok + cacheRead + cacheWrite, completion_tokens: outTok, cache_read_tokens: cacheRead, cost: Math.round(cost * 1e6) / 1e6 },
  };
}

async function callOpenAI(o: { model: string; system: string; parts: LlmPart[]; timeoutMs: number }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: o.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: o.system },
        {
          role: "user",
          content: o.parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.url, detail: p.detail ?? "high" } })),
        },
      ],
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    error?: { message?: string };
  } | null;
  if (!res.ok) throw new Error(data?.error?.message || `модель ответила ${res.status}`);
  const text = data?.choices?.[0]?.message?.content ?? "";
  const pt = data?.usage?.prompt_tokens ?? 0;
  const ct = data?.usage?.completion_tokens ?? 0;
  return {
    text,
    raw: text,
    model: o.model,
    usage: { prompt_tokens: pt, completion_tokens: ct, cache_read_tokens: data?.usage?.prompt_tokens_details?.cached_tokens ?? 0, cost: llmCostUsd(o.model, pt, ct) },
  };
}

/** Инструкция + текст/картинки → JSON-объект. Провайдер — по названию модели. */
export async function llmJson(o: {
  model: string;
  system: string;
  parts: LlmPart[];
  /** Только Claude: потолок ответа (включая мышление). */
  maxTokens?: number;
  /** Только Claude: глубина мышления. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs?: number;
}): Promise<LlmResult> {
  const t0 = Date.now();
  const timeoutMs = o.timeoutMs ?? 110_000;
  const r = isClaude(o.model)
    ? await callClaude({ model: o.model, system: o.system, parts: o.parts, maxTokens: o.maxTokens ?? 16_000, effort: o.effort, timeoutMs })
    : await callOpenAI({ model: o.model, system: o.system, parts: o.parts, timeoutMs });
  return { json: parseJson(r.text), usage: r.usage, model: r.model, ms: Date.now() - t0, raw: r.raw };
}
