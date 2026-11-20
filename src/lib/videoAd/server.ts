// Видеореклама — общее для серверных роутов: строка задания → VideoAdJob.
import type { VideoAdJob, VideoAdJobStatus, VideoAdQuality } from "./spec";

/** Колонки, которые видит клиент (без prompt и путей FTP). */
export const JOB_COLUMNS =
  "id,status,title,image_url,card_id,quality,seconds,credits,recipe,error,created_at,video_url";

export function toJob(r: Record<string, unknown>): VideoAdJob {
  const recipe = (r.recipe ?? {}) as VideoAdJob["recipe"];
  return {
    id: String(r.id ?? ""),
    status: (r.status as VideoAdJobStatus) ?? "pending",
    title: String(r.title ?? ""),
    image_url: String(r.image_url ?? ""),
    card_id: (r.card_id as string | null) ?? null,
    quality: (r.quality as VideoAdQuality) ?? "fast",
    seconds: Number(r.seconds ?? 0),
    credits: Number(r.credits ?? 0),
    recipe: {
      formats: Array.isArray(recipe.formats) ? recipe.formats : ["9:16"],
      endCard: recipe.endCard !== false,
      total: Number(recipe.total ?? 10),
      idea: recipe.idea,
    },
    error: (r.error as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    ready: r.status === "done" && !!r.video_url,
  };
}
