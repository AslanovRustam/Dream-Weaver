"use client";

// Клиентская часть движка ТЗ: «понять ТЗ» для любого инструмента (с живым
// ходом разбора), уточняющие вопросы, проверка готового креатива по
// требованиям, «последнее ТЗ» между инструментами и снимок автопилота для
// восстановления после перезагрузки. Типы — из серверных модулей (только типы).
import { apiFetch, apiJson } from "@/lib/api-client";
import { idbGet, idbSet } from "@/lib/idbStore";
import type { TzImage, TzLinkInfo, TzSource } from "./ingest";
import type { TzProduct } from "./plans/types";
import type { TemplateInfo, TzJob, TzQuestion, TzRequirement } from "./understand";

export type { TzImage, TzLinkInfo, TzSource, TzProduct, TzJob, TzRequirement, TemplateInfo, TzQuestion };

/** Что человек дал в простом режиме: текст, файлы, картинки и галочки инструмента. */
export type TzRunInput = {
  text: string;
  files: { name: string; base64: string }[];
  images: string[];
  /** Галочки «что нужно» — у каждого инструмента свои id. */
  options: Record<string, boolean>;
};

export type TzUnderstood = { job: TzJob; images: TzImage[]; links: TzLinkInfo[]; sources: TzSource[] };

/** Ответы на вопросы движка, дописанные к ТЗ: со второго раза модель их видит и не спрашивает снова. */
export function withClarifications(input: TzRunInput, clarifications: string): TzRunInput {
  if (!clarifications.trim()) return input;
  return { ...input, text: `${input.text}\n\nCLARIFICATIONS (ответы клиента на вопросы по ТЗ):\n${clarifications}` };
}

/** Ответы → строки для withClarifications. answers: id вопроса → выбранный или введённый ответ. */
export function answersText(questions: TzQuestion[], answers: Record<string, string>): string {
  return questions
    .filter((q) => answers[q.id]?.trim())
    .map((q) => `- ${q.text} → ${answers[q.id].trim()}`)
    .join("\n");
}

/**
 * Понять ТЗ. С onEvent — потоком: по ходу приходят строки «Открыл сайт…»,
 * «Оффер: …» (для живого прогресса), в конце — результат.
 */
export async function understandTz(
  input: TzRunInput,
  product: TzProduct,
  templates: TemplateInfo[] = [],
  onEvent?: (message: string) => void,
): Promise<TzUnderstood> {
  const payload = { product, text: input.text, files: input.files, images: input.images, templates };
  if (!onEvent) return apiJson<TzUnderstood>("/api/tz/understand", { method: "POST", body: JSON.stringify(payload) });
  const res = await apiFetch("/api/tz/understand", { method: "POST", body: JSON.stringify({ ...payload, stream: true }) });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Не удалось разобрать ТЗ (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { type: string; message?: string; error?: string } & Partial<TzUnderstood>;
      if (msg.type === "event" && msg.message) onEvent(msg.message);
      else if (msg.type === "error") throw new Error(msg.error || "Не удалось разобрать ТЗ");
      else if (msg.type === "result") return { job: msg.job!, images: msg.images ?? [], links: msg.links ?? [], sources: msg.sources ?? [] };
    }
    if (done) break;
  }
  throw new Error("Разбор ТЗ оборвался — попробуйте ещё раз");
}

export type TzCheck = { results: { id: string; ok: boolean; note: string }[]; faceCovered: boolean };

/** Проверка готовой картинки по требованиям ТЗ (форматы и прочее непроверяемое отбрасывается). */
export function checkByTz(image: string, requirements: TzRequirement[]): Promise<TzCheck> {
  return apiJson<TzCheck>("/api/tz/check", {
    method: "POST",
    body: JSON.stringify({ image, requirements: requirements.filter((r) => r.kind !== "format") }),
  });
}

/** Не прошедшие проверку пункты, которые стоит исправлять перегенерацией (тексты, оффер, юр. строка). */
export function failedCritical(check: TzCheck | null | undefined, requirements: TzRequirement[]) {
  return (check?.results ?? []).filter((r) => {
    const q = requirements.find((x) => x.id === r.id);
    return !r.ok && !!q && (!!q.exact || q.kind === "text" || q.kind === "offer" || q.kind === "legal");
  });
}

/** Картинка по id из ответа движка (роль — в job.images). */
export const tzImage = (u: TzUnderstood | { images?: TzImage[] }, id: string | null | undefined) =>
  id ? (u.images ?? []).find((i) => i.id === id)?.src ?? "" : "";

/** Первая картинка с этой ролью (brand → лого, main → главный визуал …). */
export const tzImageByRole = (u: TzUnderstood, role: TzJob["images"][number]["role"]) =>
  tzImage(u, u.job.images.find((i) => i.role === role)?.id);

// ---- План перед запуском --------------------------------------------------

/** Дороже этого — сначала показываем план и цену, запуск по кнопке. */
export const REVIEW_CREDITS = 60;

/** Нужен ли шаг «план → Запускаем»: есть вопросы по ТЗ или запуск дорогой. */
export const needsReview = (u: TzUnderstood, cost: number | null) =>
  u.job.questions.length > 0 || (cost !== null && cost >= REVIEW_CREDITS);

// ---- Последнее ТЗ (между инструментами) ----------------------------------

export type LastTz = { input: TzRunInput; tool: string; toolLabel: string; at: number };
const LAST_KEY = "dw:lastTz";
const LAST_TTL = 24 * 60 * 60 * 1000;

/** Запомнить ТЗ, по которому только что работали, — другие инструменты предложат «подставить». */
export async function rememberLastTz(input: TzRunInput, tool: string, toolLabel: string): Promise<void> {
  await idbSet(LAST_KEY, { input: { ...input, options: {} }, tool, toolLabel, at: Date.now() } satisfies LastTz);
}

export async function loadLastTz(): Promise<LastTz | null> {
  const v = await idbGet<LastTz>(LAST_KEY);
  return v && Date.now() - v.at < LAST_TTL ? v : null;
}

// ---- Снимок автопилота (переживает перезагрузку) ---------------------------

const snapKey = (tool: string) => `dw:auto:${tool}`;

export function saveAutoSnapshot<T>(tool: string, value: T | null): Promise<void> {
  return idbSet(snapKey(tool), value === null ? undefined : { value, at: Date.now() });
}

/** Снимок не старше суток. */
export async function loadAutoSnapshot<T>(tool: string): Promise<T | null> {
  const v = await idbGet<{ value: T; at: number }>(snapKey(tool));
  return v && Date.now() - v.at < LAST_TTL ? v.value : null;
}
