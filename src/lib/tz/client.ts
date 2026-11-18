"use client";

// Клиентская часть движка ТЗ: один вызов «понять ТЗ» для любого инструмента и
// проверка готового креатива по требованиям. Типы — из серверных модулей
// (только типы, код туда не тянется).
import { apiJson } from "@/lib/api-client";
import type { TzImage, TzLinkInfo, TzSource } from "./ingest";
import type { TzProduct } from "./plans/types";
import type { TemplateInfo, TzJob, TzRequirement } from "./understand";

export type { TzImage, TzLinkInfo, TzSource, TzProduct, TzJob, TzRequirement, TemplateInfo };

/** Что человек дал в простом режиме: текст, файлы, картинки и галочки инструмента. */
export type TzRunInput = {
  text: string;
  files: { name: string; base64: string }[];
  images: string[];
  /** Галочки «что нужно» — у каждого инструмента свои id. */
  options: Record<string, boolean>;
};

export type TzUnderstood = { job: TzJob; images: TzImage[]; links: TzLinkInfo[]; sources: TzSource[] };

export function understandTz(input: TzRunInput, product: TzProduct, templates: TemplateInfo[] = []): Promise<TzUnderstood> {
  return apiJson<TzUnderstood>("/api/tz/understand", {
    method: "POST",
    body: JSON.stringify({ product, text: input.text, files: input.files, images: input.images, templates }),
  });
}

export type TzCheck = { results: { id: string; ok: boolean; note: string }[]; faceCovered: boolean };

/** Проверка готовой картинки по требованиям ТЗ (форматы и прочее непроверяемое отбрасывается). */
export function checkByTz(image: string, requirements: TzRequirement[]): Promise<TzCheck> {
  return apiJson<TzCheck>("/api/tz/check", {
    method: "POST",
    body: JSON.stringify({ image, requirements: requirements.filter((r) => r.kind !== "format") }),
  });
}

/** Картинка по id из ответа движка (роль — в job.images). */
export const tzImage = (u: TzUnderstood | { images?: TzImage[] }, id: string | null | undefined) =>
  id ? (u.images ?? []).find((i) => i.id === id)?.src ?? "" : "";

/** Первая картинка с этой ролью (brand → лого, main → главный визуал …). */
export const tzImageByRole = (u: TzUnderstood, role: TzJob["images"][number]["role"]) =>
  tzImage(u, u.job.images.find((i) => i.role === role)?.id);
