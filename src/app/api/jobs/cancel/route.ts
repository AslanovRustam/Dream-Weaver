// Отменить оставшиеся шаги сборки.
//
// Отменяются только те, что ещё в очереди. Начатые доводятся до конца: запрос
// к провайдеру уже ушёл и оплачен, бросить его — значит заплатить за пустоту.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse } from "@/lib/request-guard";
import { JobsUnavailableError, cancelBatch } from "@/lib/jobs/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("jobs-cancel", user.id, 30, 60_000);
  if (rl) return rl;

  let batchId = "";
  try {
    batchId = String(((await request.json()) as { batchId?: unknown }).batchId ?? "");
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!UUID.test(batchId)) return Response.json({ error: "batchId is required" }, { status: 400 });

  try {
    await cancelBatch(user.id, batchId);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof JobsUnavailableError) {
      return Response.json({ error: "jobs_unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Не удалось отменить" }, { status: 500 });
  }
}
