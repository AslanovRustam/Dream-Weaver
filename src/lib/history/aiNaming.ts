/**
 * AI naming for history cards (Task #5).
 *
 * After a master generation creates a generation_cards row, we kick this
 * off fire-and-forget. It calls gpt-4o-mini with a compact summary of the
 * user-supplied form fields and rewrites `card.name` from the bland
 * template ("Спорт · Лига · 1 июн") into something human ("Финал ЛЧ —
 * Реал vs Челси, 1 июн").
 *
 * Billing: the user pays for the call via spend_credits using the
 * pricing_coefficients row ('gpt-4o-mini', 'standard'). Cost is fractions
 * of a credit per card. If billing or the LLM call fails, the template
 * name stays — the user loses nothing.
 *
 * Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystem } from "../logger";

const NAMING_MODEL = "gpt-4o-mini";
const NAMING_QUALITY = "standard";
const FALLBACK_COEFFICIENT = 0.001;

const PRESET_LABELS: Record<string, string> = {
  preset1: "Широкий угол",
  preset2: "Слот",
  preset3: "Событие",
  preset4: "Спорт",
};

const SYSTEM_PROMPT = `Ты помощник, который придумывает короткие человеческие названия для карточек в истории генераций баннеров.
Правила:
- 3-7 слов, без кавычек, без эмодзи, без точки в конце
- Сразу понятно ЧТО на баннере (бренд, событие, оффер)
- Не повторяй слово "баннер", "креатив", "генерация"
- Не выдумывай факты, бери только из переданных полей
- Язык — тот же, что в полях формы (рус/укр/англ)
- Если данных мало — лаконично, без воды
Верни ТОЛЬКО само название, без префиксов и пояснений.`;

interface FieldSummary {
  preset: string;
  fields: Array<[string, string]>;
}

function summarizeBody(body: Record<string, unknown>): FieldSummary {
  const presetId = (body.preset_id as string) || "";
  const preset = PRESET_LABELS[presetId] || presetId || "—";

  const candidates: Array<[string, string]> = [
    ["Бренд", (body.brand_name as string) || ""],
    ["Тема", (body.subject as string) || ""],
    ["Заголовок", (body.banner_text as string) || ""],
    ["Подзаголовок", (body.subheadline_text as string) || ""],
    ["CTA", (body.button_text as string) || ""],
    ["Событие", (body.event_name as string) || (body.event_text as string) || ""],
    ["Слот", (body.slot_name as string) || ""],
    ["Спорт", (body.sport_type as string) || ""],
    ["Тип матча", (body.match_type as string) || ""],
    ["Сторона A", (body.side_a_name as string) || ""],
    ["Сторона B", (body.side_b_name as string) || ""],
    ["Бонус", (body.bonus_text as string) || ""],
    ["Дата матча", (body.match_datetime as string) || ""],
    ["Место", (body.location as string) || ""],
    ["Язык", (body.language as string) || ""],
  ];
  const fields = candidates.filter(([, v]) => v && v.trim());
  return { preset, fields };
}

function buildUserPrompt(summary: FieldSummary, templateName: string): string {
  const lines = [
    `Пресет: ${summary.preset}`,
    ...summary.fields.map(([k, v]) => `${k}: ${v.slice(0, 200)}`),
  ];
  return `Текущее автоназвание (можно отбросить): ${templateName}\n\nПоля формы:\n${lines.join("\n")}\n\nНазвание:`;
}

function sanitize(name: string): string {
  return name
    .replace(/^["'«»\s]+|["'«»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.\s*$/, "")
    .slice(0, 120)
    .trim();
}

export interface PolishCardNameArgs {
  supa: SupabaseClient;
  userId: string;
  cardId: string;
  body: Record<string, unknown>;
  templateName: string;
}

/**
 * Fire-and-forget. Never throws. On any failure the template name remains.
 * Charges the user via spend_credits.
 */
export async function polishCardName(args: PolishCardNameArgs): Promise<void> {
  const { supa, userId, cardId, body, templateName } = args;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  // Honor admin kill-switch — admin panel exposes ai_naming_enabled as
  // a boolean toggle for cost control.
  try {
    const { data: setting } = await supa
      .from("app_settings")
      .select("value")
      .eq("key", "ai_naming_enabled")
      .maybeSingle();
    if (setting && setting.value === false) return;
  } catch {
    // If the lookup fails we proceed — better to name than to silently
    // skip on a transient DB hiccup.
  }

  const summary = summarizeBody(body);
  if (summary.fields.length === 0) {
    // Nothing meaningful to summarize — keep template name, skip LLM call.
    return;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NAMING_MODEL,
        temperature: 0.3,
        max_tokens: 40,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(summary, templateName) },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      void logSystem({
        supa,
        level: "warn",
        category: "ai-naming",
        message: "ai-naming provider error",
        user_id: userId,
        duration_ms: Date.now() - startedAt,
        context: {
          card_id: cardId,
          status: res.status,
          response_preview: text.slice(0, 200),
        },
      });
      return;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const raw = data.choices?.[0]?.message?.content ?? "";
    const name = sanitize(raw);
    if (!name || name.length < 3) return; // gibberish, keep template

    // Pricing: try the pricing_coefficients row, fall back to a tiny default.
    let coefficient = FALLBACK_COEFFICIENT;
    try {
      const { data: price } = await supa
        .from("pricing_coefficients")
        .select("coefficient")
        .eq("model", NAMING_MODEL)
        .eq("quality", NAMING_QUALITY)
        .maybeSingle();
      if (price && Number.isFinite(Number(price.coefficient))) {
        coefficient = Number(price.coefficient);
      }
    } catch (e) {
      void logSystem({
        supa,
        level: "warn",
        category: "ai-naming",
        message: "ai-naming pricing lookup failed (used fallback)",
        user_id: userId,
        context: { card_id: cardId },
        error: e,
      });
    }

    const totalTokens = Math.max(Number(data.usage?.total_tokens) || 0, 1);
    const charge = Number((totalTokens * coefficient).toFixed(4));

    // Spend (best-effort). If the user has zero balance we still keep the
    // new name — the cost is fractions of a credit and we'd rather not
    // half-apply the side effects.
    try {
      await supa.rpc("spend_credits", {
        p_user: userId,
        p_amount: charge,
        p_meta: {
          purpose: "ai_naming",
          card_id: cardId,
          model: NAMING_MODEL,
          total_tokens: totalTokens,
          coefficient,
        },
      });
    } catch (e) {
      void logSystem({
        supa,
        level: "warn",
        category: "billing",
        message: "ai-naming spend_credits failed",
        user_id: userId,
        context: { card_id: cardId, charge },
        error: e,
      });
    }

    // Update card name. Note: this also re-runs the search_tsv trigger,
    // so /history full-text search picks up the polished name.
    const { error: updErr } = await supa.from("generation_cards").update({ name }).eq("id", cardId);
    if (updErr) {
      void logSystem({
        supa,
        level: "error",
        category: "ai-naming",
        message: "ai-naming card update failed",
        user_id: userId,
        context: { card_id: cardId, name },
        error: updErr,
      });
    } else {
      void logSystem({
        supa,
        level: "info",
        category: "ai-naming",
        message: "card name polished",
        user_id: userId,
        duration_ms: Date.now() - startedAt,
        context: {
          card_id: cardId,
          new_name: name,
          template_name: templateName,
          model: NAMING_MODEL,
          prompt_tokens: data.usage?.prompt_tokens ?? null,
          completion_tokens: data.usage?.completion_tokens ?? null,
          total_tokens: totalTokens,
          charge,
        },
      });
    }
  } catch (err) {
    void logSystem({
      supa,
      level: "error",
      category: "ai-naming",
      message: "ai-naming unexpected failure",
      user_id: userId,
      context: { card_id: cardId },
      error: err,
    });
  }
}
