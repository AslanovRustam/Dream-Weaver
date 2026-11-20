// GET /api/video-ad/{jobId}/clip — сам ИИ-клип (MP4) для сборки форматов в браузере.
// Хранилище не отдаёт CORS, а канвасу нужен «свой» файл — отдаём через сервер.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { isStorageUrl } from "@/lib/ftp/storage";
import { rateLimitResponse } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const { jobId } = await ctx.params;
  if (!UUID.test(jobId)) return new Response("not found", { status: 404 });
  const rl = await rateLimitResponse("video-ad-clip", user.id, 30, 60_000);
  if (rl) return rl;
  const { data } = await getAdminClient()
    .from("video_ad_jobs")
    .select("video_url,status")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  const url = (data as { video_url?: string } | null)?.video_url;
  if (!url || !isStorageUrl(url)) return new Response("not found", { status: 404 });
  const res = await fetch(url, { signal: AbortSignal.timeout(50_000) });
  if (!res.ok || !res.body) return new Response("clip unavailable", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "private, max-age=3600",
      ...(res.headers.get("content-length") ? { "Content-Length": res.headers.get("content-length")! } : {}),
    },
  });
}
