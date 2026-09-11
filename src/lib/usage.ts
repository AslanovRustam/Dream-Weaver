// Per-user AI usage logging for the OpenAI-direct routes (LLM copy, brief
// parsing, landing/email hero images, banner generation). Writes one row per
// call into the existing `public.generations` ledger so spend can be
// aggregated by user in $.
//
// Best-effort: logging never breaks the generation response. OpenAI's chat/
// images APIs return token counts but no per-request $ cost, so costUsd is
// 0 unless the caller computes/passes an estimate itself.
import { getAdminClient } from "./supabase/admin";

export type UsageEntry = {
  model: string;
  /** Which product action produced the call, e.g. "email-content", "parse-brief",
   *  "landing-image". Stored in meta.feature and used to break spend down. */
  feature: string;
  type?: "llm" | "image";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  meta?: Record<string, unknown>;
};

/** Pull token counts + $ cost out of an OpenAI-shaped chat/image response
 *  (also tolerates an OpenRouter-shaped one, which the same field names and
 *  an extra `usage.cost` come from, for any legacy caller still on it). */
export function extractUsage(data: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
} {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const promptTokens = num(u.prompt_tokens) || num(u.input_tokens);
  const completionTokens = num(u.completion_tokens) || num(u.output_tokens);
  const totalTokens = num(u.total_tokens) || promptTokens + completionTokens;
  const costUsd = num(u.cost);
  return { promptTokens, completionTokens, totalTokens, costUsd };
}

/** Insert one usage row for a user. Never throws. */
export async function recordUsage(userId: string, e: UsageEntry): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.from("generations").insert({
      user_id: userId,
      model: e.model || "unknown",
      quality: e.type ?? "llm",
      tokens_input_text: Math.round(e.promptTokens ?? 0),
      tokens_input_image: 0,
      tokens_output: Math.round(e.completionTokens ?? 0),
      total_tokens: Math.round(e.totalTokens ?? (e.promptTokens ?? 0) + (e.completionTokens ?? 0)),
      cost_usd: e.costUsd ?? 0,
      cost_credits: 0,
      meta: { feature: e.feature, source: "openai", ...(e.meta ?? {}) },
    });
  } catch (err) {
    console.warn("recordUsage failed", err);
  }
}
