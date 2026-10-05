// Серверная очередь генераций: база, вызов роутов, FTP.
//
// Сам порядок исполнения — в driver.ts. Здесь только то, что связывает его с
// миром: какие роуты можно ставить в очередь и почём, как забрать шаг в работу,
// куда положить картинку и как понять, что миграция ещё не применена.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHARACTER_PRICE_CREDITS,
  CRASH_ROCKET_PRICE_CREDITS,
  EMAIL_HERO_PRICE_CREDITS,
  SLOT_SYMBOLS_PRICE_CREDITS,
  TEAM_CREST_PRICE_CREDITS,
  estimateBannerCredits,
} from "@/lib/credit-estimate";
import { decodeDataUrl, uploadImage } from "@/lib/ftp/storage";
import { getAdminClient } from "@/lib/supabase/admin";

import { driveBatch, type DriverDeps, type Job } from "./driver";

/**
 * Что можно ставить в очередь. Цена здесь — для проверки баланса до старта;
 * списывают по-прежнему сами роуты, очередь их только вызывает.
 *
 * Список закрытый: очередь ходит в роуты от имени пользователя, и принять
 * произвольный путь значило бы дать вызвать что угодно на нашем домене.
 */
export const JOB_ROUTES: Record<string, { credits: () => number }> = {
  "/api/generate-email-hero": { credits: () => EMAIL_HERO_PRICE_CREDITS },
  "/api/generate-character": { credits: () => CHARACTER_PRICE_CREDITS },
  "/api/generate-slot-symbols": { credits: () => SLOT_SYMBOLS_PRICE_CREDITS },
  "/api/generate-crash-rocket": { credits: () => CRASH_ROCKET_PRICE_CREDITS },
  "/api/generate-team-crest": { credits: () => TEAM_CREST_PRICE_CREDITS },
  "/api/generate-image": { credits: () => estimateBannerCredits() },
};

export const MAX_STEPS_PER_BATCH = 8;

/**
 * Сколько живёт вызов на платформе. Совпадает с maxDuration роутов очереди:
 * исполнитель работает внутри after() того же вызова.
 */
export const RUN_WINDOW_MS = 280_000;

/**
 * Шаг в статусе running дольше этого — его исполнитель умер вместе с вызовом.
 * Шесть минут: заведомо больше любого maxDuration.
 */
const STALE_MS = 6 * 60_000;

const COLUMNS =
  "id,batch_id,user_id,step_key,label,route,body,credits,blocking,position,status,result,error,attempts,started_at,finished_at,created_at";

/** Миграция 0015 ещё не применена — очереди нет, клиент работает по-старому. */
export function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /generation_jobs/.test(err.message ?? "") && /does not exist|not find|schema cache/i.test(err.message ?? "")
  );
}

export class JobsUnavailableError extends Error {
  constructor() {
    super("generation_jobs table is missing — apply migration 0015");
  }
}

/** Откуда звать свои же роуты: тот домен, на который пришёл запрос. */
export function originOf(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

function deps(supa: SupabaseClient, ctx: { userId: string; token: string; origin: string }): DriverDeps {
  return {
    list: async (batchId) => {
      const { data, error } = await supa
        .from("generation_jobs")
        .select(COLUMNS)
        .eq("batch_id", batchId)
        .eq("user_id", ctx.userId)
        .order("position");
      if (error) throw new Error(error.message);
      return (data ?? []) as Job[];
    },
    // Атомарность — на условии status = queued: из двух исполнителей строку
    // получит только один, второму вернётся пусто.
    claim: async (jobId) => {
      const { data: current } = await supa
        .from("generation_jobs")
        .select("attempts")
        .eq("id", jobId)
        .maybeSingle();
      const { data, error } = await supa
        .from("generation_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          attempts: ((current as { attempts?: number } | null)?.attempts ?? 0) + 1,
        })
        .eq("id", jobId)
        .eq("status", "queued")
        .select(COLUMNS);
      if (error) throw new Error(error.message);
      return ((data ?? [])[0] as Job | undefined) ?? null;
    },
    finish: async (jobId, patch) => {
      await supa
        .from("generation_jobs")
        .update({
          status: patch.status,
          result: patch.result ?? null,
          error: patch.error ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "running");
    },
    callRoute: async (route, body, timeoutMs) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.token}`,
      };
      // Превью на Vercel может быть закрыто защитой деплоя — тогда свои же
      // роуты отвечают 401. Секрет обхода Vercel кладёт в окружение сам.
      const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      if (bypass) headers["x-vercel-protection-bypass"] = bypass;
      const res = await fetch(`${ctx.origin}${route}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: res.ok, status: res.status, json };
    },
    // Картинка уходит на FTP, в базе остаётся только ссылка: data URL на
    // мегабайт в строке очереди раздул бы таблицу за неделю.
    persist: async (image, job) => {
      if (/^https?:\/\//.test(image)) return { url: image };
      const { buffer, format } = decodeDataUrl(image);
      const up = await uploadImage(buffer, {
        userId: ctx.userId,
        publicId: job.id,
        kind: "asset",
        format,
      });
      return { url: up.url, ftp_path: up.ftpPath };
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

export type StepInput = {
  key: string;
  label: string;
  route: string;
  body: Record<string, unknown>;
  blocking?: boolean;
};

/** Проверить шаги и посчитать смету. Бросает с понятным текстом. */
export function validateSteps(steps: unknown): { steps: StepInput[]; credits: number } {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Пустая сборка");
  if (steps.length > MAX_STEPS_PER_BATCH) throw new Error(`Не больше ${MAX_STEPS_PER_BATCH} шагов за раз`);
  const out: StepInput[] = [];
  let credits = 0;
  for (const raw of steps) {
    const s = raw as Partial<StepInput>;
    if (typeof s.route !== "string" || !JOB_ROUTES[s.route]) throw new Error("Неизвестный шаг сборки");
    if (typeof s.key !== "string" || !s.key || typeof s.label !== "string" || !s.label) {
      throw new Error("У шага нет имени");
    }
    if (!s.body || typeof s.body !== "object" || Array.isArray(s.body)) throw new Error("У шага нет параметров");
    credits += JOB_ROUTES[s.route].credits();
    out.push({
      key: s.key.slice(0, 64),
      label: s.label.slice(0, 120),
      route: s.route,
      body: s.body as Record<string, unknown>,
      blocking: !!s.blocking,
    });
  }
  return { steps: out, credits };
}

export async function insertBatch(userId: string, steps: StepInput[]): Promise<{ batchId: string; jobs: Job[] }> {
  const supa = getAdminClient();
  const batchId = crypto.randomUUID();
  const rows = steps.map((s, i) => ({
    user_id: userId,
    batch_id: batchId,
    step_key: s.key,
    label: s.label,
    route: s.route,
    body: s.body,
    credits: JOB_ROUTES[s.route].credits(),
    blocking: !!s.blocking,
    position: i,
  }));
  const { data, error } = await supa.from("generation_jobs").insert(rows).select(COLUMNS);
  if (isMissingTable(error)) throw new JobsUnavailableError();
  if (error) throw new Error(error.message);
  return { batchId, jobs: (data ?? []) as Job[] };
}

export async function listBatch(userId: string, batchId: string): Promise<Job[]> {
  const supa = getAdminClient();
  const { data, error } = await supa
    .from("generation_jobs")
    .select(COLUMNS)
    .eq("batch_id", batchId)
    .eq("user_id", userId)
    .order("position");
  if (isMissingTable(error)) throw new JobsUnavailableError();
  if (error) throw new Error(error.message);
  return (data ?? []) as Job[];
}

/**
 * Подчистить зависшие шаги. Начатый шаг, чей исполнитель умер, не
 * перезапускаем: генерация могла дойти до провайдера и списать кредиты, и
 * повтор взял бы их второй раз. Отдаём ошибку — повторит человек, видя цену.
 */
export async function failStale(userId: string, batchId: string): Promise<void> {
  const supa = getAdminClient();
  await supa
    .from("generation_jobs")
    .update({
      status: "error",
      error: "Шаг прервался на сервере. Повторите его кнопкой у ассета.",
      finished_at: new Date().toISOString(),
    })
    .eq("batch_id", batchId)
    .eq("user_id", userId)
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STALE_MS).toISOString());
}

export async function cancelBatch(userId: string, batchId: string): Promise<void> {
  const supa = getAdminClient();
  await supa
    .from("generation_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("user_id", userId)
    .eq("status", "queued");
}

/** Довести сборку, сколько успеем в этом вызове. */
export async function runBatch(ctx: { userId: string; token: string; origin: string; batchId: string }) {
  const supa = getAdminClient();
  await driveBatch(deps(supa, ctx), ctx.batchId, Date.now() + RUN_WINDOW_MS);
}

/** Сколько у пользователя незаконченных сборок — чтобы не дать набить очередь. */
export async function activeBatchCount(userId: string): Promise<number> {
  const supa = getAdminClient();
  const { data, error } = await supa
    .from("generation_jobs")
    .select("batch_id")
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);
  if (isMissingTable(error)) throw new JobsUnavailableError();
  if (error) return 0;
  return new Set((data ?? []).map((r) => (r as { batch_id: string }).batch_id)).size;
}
