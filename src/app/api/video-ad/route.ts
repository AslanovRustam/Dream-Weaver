// /api/video-ad — ИИ-клипы раздела «Видеореклама».
//
// POST — запустить клип по баннеру. Порядок как у всех платных генераций с
// известной ценой: списать кредиты → запросить xAI → не вышло — вернуть.
//   Body: { image: https | data URL, prompt, quality: fast|max, total, endCard,
//           audio, formats: string[], title?, idea?, cardId? }
//   Response: { job: VideoAdJob }
// GET — последние задания пользователя: { jobs: VideoAdJob[] }.
import { randomUUID } from "node:crypto";

import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { decodeDataUrl, isStorageUrl, uploadImage } from "@/lib/ftp/storage";
import { logSystem } from "@/lib/logger";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { getAdminClient } from "@/lib/supabase/admin";
import { recordUsage } from "@/lib/usage";
import {
  aiSeconds,
  VIDEO_AD_DURATIONS,
  VIDEO_AD_FORMAT_BY_ID,
  VIDEO_AD_MODELS,
  videoAdCredits,
  type VideoAdFormatId,
  type VideoAdQuality,
} from "@/lib/videoAd/spec";
import { toJob, JOB_COLUMNS } from "@/lib/videoAd/server";
import { startVideo, videoConfigured } from "@/lib/videoAd/xai";

export const runtime = "nodejs";
export const maxDuration = 90;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const { data, error } = await getAdminClient()
    .from("video_ad_jobs")
    .select(JOB_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) return Response.json({ jobs: [], error: "Видеозадания недоступны" }, { status: 200 });
  return Response.json({ jobs: (data ?? []).map((r) => toJob(r as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  if (!videoConfigured())
    return Response.json({ error: "Видео пока не подключено: нет ключа XAI_API_KEY" }, { status: 503 });
  const rl = await rateLimitResponse("video-ad-start", user.id, 6, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 14 * 1024 * 1024);
  if (big) return big;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = str(body.prompt, 1500);
  if (prompt.length < 10) return Response.json({ error: "Опишите движение" }, { status: 400 });
  const quality: VideoAdQuality = body.quality === "max" ? "max" : "fast";
  const total = (VIDEO_AD_DURATIONS as readonly number[]).includes(Number(body.total)) ? Number(body.total) : 10;
  const endCard = body.endCard !== false;
  const audio = body.audio !== false;
  const formats = (Array.isArray(body.formats) ? body.formats : [])
    .map(String)
    .filter((f): f is VideoAdFormatId => VIDEO_AD_FORMAT_BY_ID.has(f as VideoAdFormatId))
    .slice(0, 4);
  if (!formats.length) formats.push("9:16");
  const cardId = typeof body.cardId === "string" && UUID.test(body.cardId) ? body.cardId : null;
  const seconds = aiSeconds(total, endCard);
  const model = VIDEO_AD_MODELS[quality];
  const credits = videoAdCredits(quality, seconds);

  // Баннер — публичной ссылкой: xAI забирает картинку сам. Наше хранилище — как есть,
  // остальное (data URL, чужие ссылки) — сначала к себе.
  let imageUrl = str(body.image, 16 * 1024 * 1024);
  if (!(imageUrl.startsWith("https://") && isStorageUrl(imageUrl))) {
    try {
      let buffer: Buffer;
      let format: "png" | "jpg";
      if (imageUrl.startsWith("data:")) {
        const bad = assertImageDataUrl("image", imageUrl);
        if (bad) return bad;
        ({ buffer, format } = decodeDataUrl(imageUrl));
      } else if (imageUrl.startsWith("https://")) {
        const f = await safeFetchImage(imageUrl);
        buffer = f.buffer;
        format = f.mime === "image/png" ? "png" : "jpg";
      } else return Response.json({ error: "image required" }, { status: 400 });
      imageUrl = (await uploadImage(buffer, { userId: user.id, publicId: randomUUID(), kind: "asset", format })).url;
    } catch {
      return Response.json({ error: "Не удалось подготовить баннер" }, { status: 400 });
    }
  }

  const supa = getAdminClient();
  // Строка задания — до списания: без таблицы (миграция 0021 не применена) кредиты не трогаем.
  const { data: row, error: insErr } = await supa
    .from("video_ad_jobs")
    .insert({
      user_id: user.id,
      card_id: cardId,
      title: str(body.title, 80),
      image_url: imageUrl,
      prompt,
      model: model.model,
      quality,
      seconds,
      credits,
      recipe: { formats, endCard, total, idea: str(body.idea, 400) || undefined, audio },
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !row) {
    void logSystem({ level: "error", category: "video-ad", message: "video_ad_jobs insert failed", user_id: user.id, error: insErr });
    return Response.json({ error: "Видеозадания недоступны (нужна миграция 0021)" }, { status: 500 });
  }
  const jobId = (row as { id: string }).id;
  const meta = { feature: "video-ad", job_id: jobId, model: model.model, seconds };
  const charged = await chargeFlat(supa, user.id, credits, meta);
  if (!charged.ok) {
    await supa.from("video_ad_jobs").delete().eq("id", jobId);
    return charged.response;
  }

  try {
    const requestId = await startVideo({
      model: model.model,
      prompt,
      imageUrl,
      duration: seconds,
      resolution: model.resolution,
      audio,
    });
    await supa
      .from("video_ad_jobs")
      .update({ provider_request_id: requestId, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    await recordUsage(user.id, {
      model: model.model,
      feature: "video-ad",
      costUsd: seconds * model.usdPerSec,
      meta: { source: "xai", job_id: jobId, seconds },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await refundFlat(supa, user.id, credits, { ...meta, reason: "start_failed" });
    await supa
      .from("video_ad_jobs")
      .update({ status: "failed", error: msg.slice(0, 300), refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId);
    void logSystem({ level: "error", category: "video-ad", message: "xAI start failed", user_id: user.id, context: { jobId, msg } });
    return Response.json({ error: "Видеомодель не приняла задание — кредиты возвращены", detail: msg }, { status: 502 });
  }

  const { data: fresh } = await supa.from("video_ad_jobs").select(JOB_COLUMNS).eq("id", jobId).single();
  return Response.json({ job: toJob((fresh ?? {}) as Record<string, unknown>), balance: charged.balance });
}
