// Серверная очередь генераций.
//
// POST — поставить сборку: шаги проверяются по закрытому списку роутов, баланс
// сверяется со сметой, строки пишутся в generation_jobs, и исполнение
// начинается после ответа (after()) — вкладку можно закрывать.
//
// GET ?batch= — прогресс сборки. Заодно чинит её: зависшие шаги помечает
// ошибкой, а если в очереди что-то осталось и никто этим не занят —
// запускает исполнителя с токеном того, кто спрашивает.
import { after } from "next/server";

import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Job } from "@/lib/jobs/driver";
import {
  JobsUnavailableError,
  activeBatchCount,
  failStale,
  insertBatch,
  listBatch,
  originOf,
  runBatch,
  validateSteps,
} from "@/lib/jobs/server";

export const runtime = "nodejs";
// Исполнитель живёт внутри after() этого же вызова.
export const maxDuration = 300;

/** Больше трёх незаконченных сборок разом — это уже не работа, а очередь из одного человека. */
const MAX_ACTIVE_BATCHES = 3;
/** Сколько ждать тишины, прежде чем решить, что исполнитель умер. */
const IDLE_BEFORE_RESUME_MS = 30_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Наружу — без тел запросов: в них лежат референсы на сотни килобайт. */
function publicJob(j: Job) {
  return {
    id: j.id,
    key: j.step_key,
    label: j.label,
    status: j.status,
    result: j.result,
    error: j.error,
  };
}

const unavailable = () =>
  Response.json(
    { error: "jobs_unavailable", detail: "Очередь ещё не включена на этом сервере" },
    { status: 503 },
  );

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("jobs-create", user.id, 10, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 25 * 1024 * 1024);
  if (big) return big;

  let raw: { steps?: unknown };
  try {
    raw = (await request.json()) as { steps?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let plan: ReturnType<typeof validateSteps>;
  try {
    plan = validateSteps(raw.steps);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Некорректная сборка" }, { status: 400 });
  }

  try {
    if ((await activeBatchCount(user.id)) >= MAX_ACTIVE_BATCHES) {
      return Response.json(
        { error: "Дождитесь окончания уже запущенных сборок" },
        { status: 429 },
      );
    }

    // Баланс — до записи шагов: узнать о нехватке на третьем шаге значит
    // получить оплаченную половину работы.
    const { data: profile } = await getAdminClient()
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .maybeSingle();
    const balance = Number((profile as { credits_balance?: unknown } | null)?.credits_balance ?? 0);
    if (balance < plan.credits) {
      return Response.json(
        {
          error: `Нужно ${plan.credits} кредитов, на балансе ${balance}.`,
          balance,
          required: plan.credits,
        },
        { status: 402 },
      );
    }

    const { batchId, jobs } = await insertBatch(user.id, plan.steps);
    const ctx = { userId: user.id, token: user.accessToken, origin: originOf(request), batchId };
    after(() => runBatch(ctx).catch((e) => console.error("jobs: run failed", e)));

    return Response.json({ batchId, credits: plan.credits, jobs: jobs.map(publicJob) }, { status: 202 });
  } catch (e) {
    if (e instanceof JobsUnavailableError) return unavailable();
    console.error("jobs: create failed", e);
    return Response.json({ error: "Не удалось поставить сборку" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("jobs-poll", user.id, 120, 60_000);
  if (rl) return rl;

  const batchId = new URL(request.url).searchParams.get("batch") ?? "";
  if (!UUID.test(batchId)) return Response.json({ error: "batch is required" }, { status: 400 });

  try {
    await failStale(user.id, batchId);
    const jobs = await listBatch(user.id, batchId);
    if (jobs.length === 0) return Response.json({ error: "Сборка не найдена" }, { status: 404 });

    // Досборка: в очереди что-то есть, в работе ничего, и давно тихо — значит
    // прежний исполнитель кончился вместе со своим вызовом. Ждём паузу, чтобы
    // не заводить второго исполнителя в ту секунду, когда первый просто
    // переходит от фона к персонажам.
    const queued = jobs.some((j) => j.status === "queued");
    const running = jobs.some((j) => j.status === "running");
    const lastActivity = Math.max(
      ...jobs.map((j) =>
        Math.max(
          Date.parse(j.created_at ?? "") || 0,
          Date.parse(j.started_at ?? "") || 0,
          Date.parse(j.finished_at ?? "") || 0,
        ),
      ),
    );
    if (queued && !running && Date.now() - lastActivity > IDLE_BEFORE_RESUME_MS) {
      const ctx = { userId: user.id, token: user.accessToken, origin: originOf(request), batchId };
      after(() => runBatch(ctx).catch((e) => console.error("jobs: resume failed", e)));
    }

    return Response.json({ batchId, jobs: jobs.map(publicJob) });
  } catch (e) {
    if (e instanceof JobsUnavailableError) return unavailable();
    console.error("jobs: poll failed", e);
    return Response.json({ error: "Не удалось получить прогресс" }, { status: 500 });
  }
}
