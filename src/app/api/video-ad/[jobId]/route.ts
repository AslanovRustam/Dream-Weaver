// GET /api/video-ad/{jobId} — состояние ИИ-клипа (клиент опрашивает раз в ~5 с).
//
// pending: спрашиваем xAI. Готово — забираем ролик к себе на FTP (ссылка xAI
// временная) и отмечаем done. Не вышло — failed и возврат кредитов.
// Переходы условные (WHERE status = …): параллельные опросы не заберут ролик
// дважды и не вернут кредиты дважды. Застрявший saving (упал посреди загрузки)
// через 3 минуты можно забрать снова.
import { randomUUID } from "node:crypto";

import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { refundFlat } from "@/lib/billing";
import { uploadVideo } from "@/lib/ftp/storage";
import { logSystem } from "@/lib/logger";
import { rateLimitResponse } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { JOB_COLUMNS, toJob } from "@/lib/videoAd/server";
import { pollVideo } from "@/lib/videoAd/xai";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const SAVING_STALE_MS = 3 * 60_000;
/** Задание старше этого без ответа xAI — считаем потерянным. */
const PENDING_GIVE_UP_MS = 30 * 60_000;

type Row = Record<string, unknown> & {
  id: string;
  status: string;
  provider_request_id: string | null;
  credits: number;
  updated_at: string;
  created_at: string;
};

async function download(url: string): Promise<Buffer> {
  if (!url.startsWith("https://")) throw new Error("bad video url");
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`video download ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_VIDEO_BYTES) throw new Error("video too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_VIDEO_BYTES || buf.byteLength < 1000) throw new Error("video size");
  return buf;
}

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const { jobId } = await ctx.params;
  if (!UUID.test(jobId)) return Response.json({ error: "not found" }, { status: 404 });
  const rl = await rateLimitResponse("video-ad-poll", user.id, 60, 60_000);
  if (rl) return rl;
  const supa = getAdminClient();
  const load = async () => {
    const { data } = await supa
      .from("video_ad_jobs")
      .select(`${JOB_COLUMNS},provider_request_id,updated_at`)
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();
    return data as Row | null;
  };
  const row = await load();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  const now = () => new Date().toISOString();

  const fail = async (from: string, error: string) => {
    const { data: won } = await supa
      .from("video_ad_jobs")
      .update({ status: "failed", error: error.slice(0, 300), refunded_at: now(), updated_at: now() })
      .eq("id", jobId)
      .eq("status", from)
      .select("id");
    // Вернуть кредиты может только тот, кто перевёл задание в failed.
    if (won?.length)
      await refundFlat(supa, user.id, Number(row.credits), { feature: "video-ad", job_id: jobId, reason: "generation_failed" });
  };

  const stuckSaving = row.status === "saving" && Date.now() - Date.parse(row.updated_at) > SAVING_STALE_MS;
  if (row.status === "pending" || stuckSaving) {
    if (!row.provider_request_id) {
      // Старт ещё идёт (или упал до записи id) — ждём, но не вечно.
      if (Date.now() - Date.parse(row.created_at) > 5 * 60_000) await fail("pending", "Задание не дошло до видеомодели");
    } else {
      const p = await pollVideo(row.provider_request_id).catch(() => ({ status: "pending" as const }));
      if (p.status === "failed") await fail(row.status, p.error);
      else if (p.status === "pending") {
        if (Date.now() - Date.parse(row.created_at) > PENDING_GIVE_UP_MS) await fail("pending", "Видеомодель не ответила за 30 минут");
        else {
          const job = toJob(row);
          return Response.json({ job, progress: "progress" in p ? p.progress : undefined });
        }
      } else {
        // Забрать ролик: сначала захватываем задание (pending|stale saving → saving).
        const { data: claimed } = await supa
          .from("video_ad_jobs")
          .update({ status: "saving", updated_at: now() })
          .eq("id", jobId)
          .eq("status", row.status)
          .eq("updated_at", row.updated_at)
          .select("id");
        if (claimed?.length) {
          try {
            const buf = await download(p.url);
            const up = await uploadVideo(buf, user.id, randomUUID());
            await supa
              .from("video_ad_jobs")
              .update({ status: "done", video_url: up.url, ftp_path: up.ftpPath, updated_at: now() })
              .eq("id", jobId)
              .eq("status", "saving");
          } catch (e) {
            void logSystem({ level: "error", category: "video-ad", message: "save clip failed", user_id: user.id, context: { jobId }, error: e });
            // Вернём в pending — следующий опрос попробует снова (ссылка xAI ещё живёт).
            await supa.from("video_ad_jobs").update({ status: "pending", updated_at: now() }).eq("id", jobId).eq("status", "saving");
          }
        }
      }
    }
  }
  const fresh = await load();
  return Response.json({ job: toJob(fresh ?? row) });
}
