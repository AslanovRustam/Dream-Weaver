// Проверка исполнителя серверной очереди на поддельных зависимостях:
// порядок шагов, параллельность, изоляция ошибок, два исполнителя на одной
// сборке, дедлайн. Без базы, сети и кредитов.
//
//   npx tsx scripts/jobs-driver-check.mts

import { driveBatch, type Job, type DriverDeps } from "../src/lib/jobs/driver";

type Log = { id: string; start: number; end: number };

function makeWorld(jobsIn: Partial<Job>[], opts: { fail?: Set<string>; ms?: number } = {}) {
  let t = 0;
  const jobs: Job[] = jobsIn.map((j, i) => ({
    id: j.id ?? `j${i}`,
    batch_id: "b",
    user_id: "u",
    step_key: j.id ?? `j${i}`,
    label: j.id ?? `j${i}`,
    route: j.route ?? "/api/generate-character",
    body: {},
    credits: 1,
    blocking: j.blocking ?? false,
    position: i,
    status: "queued",
    result: null,
    error: null,
    attempts: 0,
    started_at: null,
  }));
  const calls: Log[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const execCount = new Map<string, number>();
  // Виртуальное время: sleep и вызовы роутов продвигают часы через очередь событий.
  const waiters: { at: number; resolve: () => void }[] = [];
  const sleepUntil = (ms: number) =>
    new Promise<void>((resolve) => {
      waiters.push({ at: t + ms, resolve });
    });
  const tick = async () => {
    for (let guard = 0; guard < 100000; guard++) {
      await new Promise((r) => setImmediate(r));
      if (waiters.length === 0) return;
      waiters.sort((a, b) => a.at - b.at);
      const w = waiters.shift()!;
      t = Math.max(t, w.at);
      w.resolve();
    }
  };

  const deps: DriverDeps = {
    list: async () => jobs.map((j) => ({ ...j })),
    claim: async (id) => {
      const j = jobs.find((x) => x.id === id)!;
      if (j.status !== "queued") return null;
      j.status = "running";
      j.attempts++;
      return { ...j };
    },
    finish: async (id, p) => {
      const j = jobs.find((x) => x.id === id)!;
      j.status = p.status;
      j.result = p.result ?? null;
      j.error = p.error ?? null;
    },
    callRoute: async (route, _body, _timeout) => {
      const job = jobs.find((x) => x.status === "running" && !calls.some((c) => c.id === x.id && c.end === -1) && !execCount.has(x.id + "#active"));
      void route;
      const id = job ? job.id : "?";
      execCount.set(id, (execCount.get(id) ?? 0) + 1);
      execCount.set(id + "#active", 1);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const log: Log = { id, start: t, end: -1 };
      calls.push(log);
      await sleepUntil(opts.ms ?? 10_000);
      inFlight--;
      log.end = t;
      execCount.delete(id + "#active");
      if (opts.fail?.has(id)) return { ok: false, status: 502, json: { error: "provider down" } };
      return { ok: true, status: 200, json: { imageUrl: "data:image/png;base64,AAAA" } };
    },
    persist: async (_img, job) => ({ url: `https://ftp/${job.id}.png` }),
    now: () => t,
    sleep: (ms) => sleepUntil(ms),
  };
  return { jobs, deps, calls, execCount, get maxInFlight() { return maxInFlight; }, tick, now: () => t };
}

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

// 1. Лендинг: фон первым и в одиночку, дальше не больше двух разом.
{
  const w = makeWorld([{ id: "bg", blocking: true }, { id: "l" }, { id: "r" }, { id: "icons" }]);
  const p = driveBatch(w.deps, "b", 10_000_000);
  await w.tick();
  await p;
  const bg = w.calls.find((c) => c.id === "bg")!;
  const others = w.calls.filter((c) => c.id !== "bg");
  check("все шаги выполнены", w.jobs.every((j) => j.status === "done"));
  check("фон закончился раньше, чем начался любой другой шаг", others.every((c) => c.start >= bg.end));
  check("не больше двух одновременно", w.maxInFlight <= 2, `max=${w.maxInFlight}`);
  check("результат — ссылка, а не data URL", w.jobs.every((j) => String(j.result?.url).startsWith("https://")));
}

// 2. Упавший шаг не роняет соседей.
{
  const w = makeWorld([{ id: "bg", blocking: true }, { id: "l" }, { id: "r" }], { fail: new Set(["l"]) });
  const p = driveBatch(w.deps, "b", 10_000_000);
  await w.tick();
  await p;
  const st = Object.fromEntries(w.jobs.map((j) => [j.id, j.status]));
  check("упавший шаг — error, остальные — done", st.l === "error" && st.bg === "done" && st.r === "done", JSON.stringify(st));
  check("причина ошибки сохранена", w.jobs.find((j) => j.id === "l")!.error === "provider down");
}

// 3. Два исполнителя на одной сборке не выполняют шаг дважды.
{
  const w = makeWorld([{ id: "bg", blocking: true }, { id: "a" }, { id: "b2" }, { id: "c" }]);
  const p1 = driveBatch(w.deps, "b", 10_000_000);
  const p2 = driveBatch(w.deps, "b", 10_000_000);
  await w.tick();
  await Promise.all([p1, p2]);
  const counts = w.jobs.map((j) => w.execCount.get(j.id) ?? 0);
  check("каждый шаг выполнен ровно один раз", counts.every((n) => n === 1), JSON.stringify(counts));
  check("и вдвоём не больше двух одновременно", w.maxInFlight <= 2, `max=${w.maxInFlight}`);
}

// 4. Дедлайн: новые шаги не начинаются, оставшиеся ждут следующего исполнителя.
{
  const w = makeWorld([{ id: "bg", blocking: true }, { id: "a" }, { id: "b2" }, { id: "c" }], { ms: 60_000 });
  // Хватает на фон и одну волну, третьей волне места нет.
  const p = driveBatch(w.deps, "b", 200_000);
  await w.tick();
  await p;
  const st = w.jobs.map((j) => j.status);
  check("часть шагов осталась в очереди", st.includes("queued"), JSON.stringify(st));
  check("начатые шаги доведены до конца", !st.includes("running"));
}

// 5. Пачка баннеров — четыре разом.
{
  const w = makeWorld(
    ["v1", "v2", "v3", "v4"].map((id) => ({ id, route: "/api/generate-image" })),
  );
  const p = driveBatch(w.deps, "b", 10_000_000);
  await w.tick();
  await p;
  check("баннеры идут вчетвером", w.maxInFlight === 4, `max=${w.maxInFlight}`);
  check("все варианты готовы", w.jobs.every((j) => j.status === "done"));
}

console.log(failed ? `\n${failed} проверок не прошло` : "\nВсе проверки прошли");
process.exit(failed ? 1 : 0);
