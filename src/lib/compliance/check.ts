// Проверка креатива по правилам сетей и страны — серверная часть (модель).
// Роут /api/compliance/check: авторизация, лимиты, загрузка картинки — там.
import { complianceRules, type ComplianceGeoId, type ComplianceNetworkId, type ComplianceResult } from "./rules";
import { llmJson, type LlmResult } from "@/lib/llm";

/** Модель: gpt-5.4-mini или claude-haiku-5-5 (провайдер — по названию, lib/llm). */
export const COMPLIANCE_MODEL = process.env.COMPLIANCE_CHECK_MODEL || process.env.TZ_CHECK_MODEL || "gpt-5.4-mini";

const SYSTEM = [
  "You are an ad-network moderation reviewer for iGaming (casino, slots, sports betting) creatives. You get ONE finished ad image and a checklist of moderation rules.",
  "First read ALL visible text on the image, including tiny print in corners (age marks like 18+, disclaimers, hotlines, T&C lines).",
  "For EACH rule decide ok true/false strictly from what is visible. A rule that requires something present (age mark, disclaimer, hotline) is ok only if it is clearly visible and readable; small print counts if legible. A rule that forbids something is ok if that thing is absent.",
  "Do not invent problems: stylised adult characters, coins, chips and slot symbols are normal for casino ads. A single honest CTA button (Play, Get bonus) is NOT fake UI.",
  "note: a short Russian reason — what exactly you saw or what is missing.",
  'Return STRICT JSON {"text":string,"results":[{"id":string,"ok":boolean,"note":string}]} where text is all visible text, lines joined with " | ".',
].join("\n");

/** image — data URL. Возвращает ответы по визуальным пунктам и весь текст с креатива. */
export async function runComplianceCheck(
  image: string,
  networks: ComplianceNetworkId[],
  geo: ComplianceGeoId,
): Promise<{ results: ComplianceResult[]; text: string; llm: LlmResult }> {
  const rules = complianceRules(networks, geo).filter((r) => r.check === "visual");
  const r = await llmJson({
    model: COMPLIANCE_MODEL,
    system: SYSTEM,
    parts: [
      { type: "text", text: "RULES:\n" + rules.map((q) => `${q.id}: ${q.text}`).join("\n") },
      { type: "image", url: image, detail: "high" },
    ],
    effort: "low",
    maxTokens: 8_000,
    timeoutMs: 50_000,
  });
  const j = r.json as { text?: unknown; results?: { id?: unknown; ok?: unknown; note?: unknown }[] };
  const known = new Set(rules.map((q) => q.id));
  const results = (Array.isArray(j.results) ? j.results : [])
    .filter((x) => known.has(String(x.id)))
    .map((x) => ({ id: String(x.id), ok: x.ok === true, note: String(x.note ?? "").slice(0, 200) }));
  return { results, text: String(j.text ?? "").slice(0, 600), llm: r };
}
