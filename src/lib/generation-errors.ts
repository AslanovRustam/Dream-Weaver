// Turns raw image-provider errors into clear, localized messages for the
// user, and strips internal markers before display.
//
// Background: OpenAI / OpenRouter return machine-oriented error bodies
// (raw JSON, `safety_violations=[sexual]`, `insufficient_quota`, ...).
// Surfacing those verbatim is unhelpful and leaks noise. These helpers
// map them to a short Russian explanation of WHAT went wrong and WHAT to
// do next.

/** Internal prefix imageGen.ts attaches so the batch runner can detect a
 *  moderation block and decide whether to retry. Stripped before display. */
export const CONTENT_FILTER_PREFIX = "[content_filter] ";

// Human-readable names for OpenAI `safety_violations=[...]` categories.
const SAFETY_CATEGORY_RU: Record<string, string> = {
  sexual: "сексуальный контент",
  sexual_minors: "сексуальный контент с участием несовершеннолетних",
  violence: "сцены насилия",
  violence_graphic: "сцены жестокого насилия",
  hate: "разжигание ненависти",
  harassment: "оскорбления/травлю",
  self_harm: "тему самоповреждения",
  illicit: "противоправный контент",
  weapons: "оружие",
};

function parseSafetyCategories(detail: string): string[] {
  const m = detail.match(/safety_violations\s*=\s*\[([^\]]*)\]/i);
  if (!m) return [];
  return m[1]
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function categoriesToRu(cats: string[]): string {
  const named = cats.map((c) => SAFETY_CATEGORY_RU[c] ?? c);
  return named.join(", ");
}

/** Pull the OpenAI request id out of the error body, if present — handy to
 *  quote when contacting support. */
function extractRequestId(detail: string): string | null {
  const m = detail.match(/req_[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

const SWITCH_HINT = "Измените описание/референсы или переключитесь на модель «nano» (Gemini).";

/**
 * Map a raw provider error body + HTTP status into a clear user message.
 * `detail` is the provider's raw response text (may be JSON or plain text).
 */
export function describeProviderError(detail: string, status?: number): string {
  const d = detail || "";
  const low = d.toLowerCase();

  // Billing / quota — actionable only by an admin.
  if (low.includes("insufficient_quota") || low.includes("exceeded your current quota")) {
    return "Недостаточно средств на API-ключе провайдера. Обратитесь к администратору.";
  }

  // Moderation / safety block (OpenAI returns this as 400, we forward as 502).
  const isSafety =
    low.includes("safety_violations") ||
    low.includes("safety system") ||
    low.includes("moderation_block") ||
    low.includes("content_filter") ||
    low.includes("prohibited_content") ||
    /rejected.*safety|safety.*rejected/i.test(d);
  if (isSafety) {
    const cats = parseSafetyCategories(d);
    const reqId = extractRequestId(d);
    const what =
      cats.length > 0
        ? `обнаружен запрещённый контент (${categoriesToRu(cats)})`
        : "запрос не прошёл фильтр безопасности";
    const tail = reqId ? ` Код запроса: ${reqId}.` : "";
    return `Запрос отклонён модерацией провайдера: ${what}. ${SWITCH_HINT}${tail}`;
  }

  // Empty / refused model response.
  if (low.includes("no image payload") || low.includes("empty model response")) {
    return "Модель вернула пустой ответ. Попробуйте сгенерировать ещё раз через несколько секунд.";
  }

  // Rate limit.
  if (status === 429 || low.includes("rate limit") || low.includes("too many requests")) {
    return "Превышен лимит запросов провайдера. Подождите немного и повторите.";
  }

  // Fallback — show a trimmed provider message, not raw JSON.
  const trimmed = d.replace(/\s+/g, " ").trim().slice(0, 200);
  return trimmed
    ? `Провайдер вернул ошибку: ${trimmed}`
    : "Не удалось сгенерировать изображение. Попробуйте ещё раз.";
}

/** Strip internal markers (e.g. the content-filter prefix) so the user
 *  never sees them. Safe to call on any error message. */
export function formatGenerationError(message: string): string {
  if (!message) return "Не удалось сгенерировать изображение.";
  return message.startsWith(CONTENT_FILTER_PREFIX)
    ? message.slice(CONTENT_FILTER_PREFIX.length)
    : message;
}
