import { after } from "next/server";

/**
 * Run a fire-and-forget side effect that must OUTLIVE the HTTP response
 * without blocking it (FTP uploads, system/audit logs, AI naming).
 *
 * Why this exists: on a serverless host (Vercel) the function invocation
 * is frozen the moment the response is sent, so a bare `void promise`
 * gets killed mid-flight — uploads never reach FTP, log rows never land.
 * `after()` (from `next/server`) registers the work with the platform's
 * `waitUntil`, so the invocation stays alive until the task settles.
 *
 * Outside a request scope (in-process background workers, server boot)
 * `after()` throws — there we fall back to a plain detached promise,
 * which is fine because those run on a long-lived Node process.
 *
 * The task is always wrapped so a rejection can never escape (these are
 * best-effort side effects and must never crash the caller).
 */
export function runBackground(task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error("[background] task failed", err);
    }
  };
  try {
    // Request scope (route handlers, server actions) — survives serverless.
    after(run);
  } catch {
    // No request scope (workers / boot) — detached on a long-lived process.
    void run();
  }
}
