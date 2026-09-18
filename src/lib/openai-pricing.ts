// OpenAI list prices (USD per 1M tokens) for the models this app calls
// directly. OpenAI's responses carry token counts but no $ figure, so every
// ledger row computes its own cost here. Verified against the live pricing
// pages in Sep 2026 — re-check when a model is swapped.
//
// gpt-image-2.5 (sunburst / flare share one price): input tokens (text AND
// image) $8 / 1M, output image tokens $30 / 1M → a 1536×1024 medium image is
// ~$0.04. gpt-4o-mini: $0.15 / 1M in, $0.60 / 1M out.

const IMAGE_INPUT_PER_M = 8;
const IMAGE_OUTPUT_PER_M = 30;

const LLM_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-5.4-mini": { input: 0.15, output: 0.6 },
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function imageCostUsd(t: { inputText?: number; inputImage?: number; output?: number }): number {
  const input = (t.inputText ?? 0) + (t.inputImage ?? 0);
  return round6((input * IMAGE_INPUT_PER_M + (t.output ?? 0) * IMAGE_OUTPUT_PER_M) / 1e6);
}

export function llmCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const key = Object.keys(LLM_PER_M).find((k) => model.toLowerCase().startsWith(k));
  if (!key) return 0;
  const p = LLM_PER_M[key];
  return round6((promptTokens * p.input + completionTokens * p.output) / 1e6);
}

export type ImageUsage = {
  inputText: number;
  inputImage: number;
  output: number;
  total: number;
  costUsd: number;
};

/** Token counts + $ from an OpenAI images API response (generations / edits). */
export function imageUsageFromResponse(json: unknown): ImageUsage {
  const u = (json as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const details = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const inputText = num(details.text_tokens);
  const inputImage = num(details.image_tokens);
  const inputTotal = num(u.input_tokens) || inputText + inputImage;
  // If details are missing, treat all input as text (same price anyway).
  const inText = inputText || inputImage ? inputText : inputTotal;
  const output = num(u.output_tokens);
  const total = num(u.total_tokens) || inputTotal + output;
  return { inputText: inText, inputImage, output, total, costUsd: imageCostUsd({ inputText: inText, inputImage, output }) };
}
