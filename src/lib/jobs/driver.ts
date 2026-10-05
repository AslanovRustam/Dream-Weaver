// Исполнитель сборки — без базы, сети и FTP: всё это приходит снаружи.
//
// Так его можно проверить тестом на поддельных зависимостях, не тратя кредиты
// и не поднимая Supabase. Боевые зависимости собирает server.ts.

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type Job = {
  id: string;
  batch_id: string;
  user_id: string;
  step_key: string;
  label: string;
  route: string;
  body: Record<string, unknown>;
  credits: number;
  blocking: boolean;
  position: number;
  status: JobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  started_at: string | null;
  finished_at?: string | null;
  created_at?: string;
};

export type RouteResponse = { ok: boolean; status: number; json: Record<string, unknown> | null };

export type DriverDeps = {
  /** Все шаги сборки. */
  list: (batchId: string) => Promise<Job[]>;
  /** Атомарно перевести queued → running. null — шаг уже забрал другой исполнитель. */
  claim: (jobId: string) => Promise<Job | null>;
  finish: (
    jobId: string,
    patch: { status: "done" | "error"; result?: Record<string, unknown>; error?: string },
  ) => Promise<void>;
  callRoute: (route: string, body: Record<string, unknown>, timeoutMs: number) => Promise<RouteResponse>;
  /** Унести картинку из ответа на постоянное хранение. */
  persist: (image: string, job: Job) => Promise<{ url: string; ftp_path?: string }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

/** Сколько оставить под один шаг: генерация картинки — до полутора минут. */
export const STEP_BUDGET_MS = 100_000;
/** Как часто ждущий исполнитель перечитывает состояние сборки. */
const POLL_MS = 1_500;

/**
 * Параллельность сборки. Роут баннеров держит четыре запроса в лёте от одного
 * пользователя, остальные — по лимиту частоты, поэтому там двое.
 */
export function parallelFor(jobs: Job[]): number {
  return jobs.length > 0 && jobs.every((j) => j.route === "/api/generate-image") ? 4 : 2;
}

/** Картинка в ответе роута: у баннеров `image`, у остальных `imageUrl`. */
export function pickImage(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  for (const key of ["imageUrl", "image"]) {
    const v = json[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function errorText(res: RouteResponse): string {
  const j = res.json ?? {};
  const parts = [j.error, j.detail].filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.join(" — ") || `Сбой генерации (${res.status})`;
}

/**
 * Выбрать и забрать следующий шаг.
 *
 * Блокирующий шаг (фон) идёт один: пока он в работе, остальные ждут, а не
 * разбегаются. Если чужой исполнитель уже занял все слоты, ждём — иначе два
 * исполнителя одной сборки вдвоём превысили бы лимит роута.
 */
async function pickAndClaim(deps: DriverDeps, batchId: string, deadline: number): Promise<Job | null> {
  for (;;) {
    if (deps.now() > deadline - STEP_BUDGET_MS) return null;

    const jobs = await deps.list(batchId);
    const queued = jobs
      .filter((j) => j.status === "queued")
      .sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.position - b.position);
    if (queued.length === 0) return null;

    const running = jobs.filter((j) => j.status === "running");
    if (running.some((j) => j.blocking)) {
      await deps.sleep(POLL_MS);
      continue;
    }

    const next = queued[0];
    if (next.blocking) {
      // Блокирующий запускается, только когда в работе нет вообще ничего.
      if (running.length > 0) {
        await deps.sleep(POLL_MS);
        continue;
      }
    } else if (running.length >= parallelFor(jobs)) {
      await deps.sleep(POLL_MS);
      continue;
    }

    const claimed = await deps.claim(next.id);
    if (claimed) return claimed;
    // Шаг перехватил другой исполнитель — перечитываем и пробуем дальше.
  }
}

async function runOne(deps: DriverDeps, job: Job, deadline: number): Promise<void> {
  try {
    const timeout = Math.max(30_000, deadline - deps.now());
    const res = await deps.callRoute(job.route, job.body, timeout);
    if (!res.ok) {
      await deps.finish(job.id, { status: "error", error: errorText(res) });
      return;
    }
    const image = pickImage(res.json);
    if (!image) {
      await deps.finish(job.id, { status: "error", error: "Генератор вернул пустой ответ" });
      return;
    }
    const stored = await deps.persist(image, job);
    const cardId = res.json?.card_id;
    await deps.finish(job.id, {
      status: "done",
      result: { ...stored, ...(typeof cardId === "string" ? { card_id: cardId } : {}) },
    });
  } catch (e) {
    await deps.finish(job.id, {
      status: "error",
      error: e instanceof Error ? e.message : "Сбой генерации",
    });
  }
}

/**
 * Довести сборку до конца или до дедлайна.
 *
 * Дедлайн — это время жизни вызова на платформе: не успели — оставшиеся шаги
 * остаются в очереди, и их подхватит следующий запрос прогресса. Начатый шаг
 * не бросаем: он уже платный.
 */
export async function driveBatch(deps: DriverDeps, batchId: string, deadline: number): Promise<void> {
  const jobs = await deps.list(batchId);
  const workers = parallelFor(jobs);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const job = await pickAndClaim(deps, batchId, deadline);
        if (!job) return;
        await runOne(deps, job, deadline);
      }
    }),
  );
}
