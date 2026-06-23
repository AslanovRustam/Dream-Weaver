// Next.js instrumentation hook — runs ONCE when the server process boots.
// This is the App Router replacement for the old TanStack `src/server.ts`
// boot block that kicked off the background workers:
//
//   - uploadRetryWorker: 2-min cadence, retries pending FTP uploads
//   - retentionWorker:   6-hour cadence, hard-deletes expired cards + trims
//                        log tables
//
// Both workers are idempotent and hold unref'd timers, so they never block
// process exit. They are unchanged from the original — only the bootstrap
// moved here.
//
// Guarded to the Node.js runtime: the workers use Node sockets (basic-ftp)
// and timers and must never run in the Edge runtime. On a long-lived Node
// host (ukraine.com.ua) `register()` fires once at `next start` and the
// setInterval timers live for the life of the process.
//
// Alternative for idle-prone / serverless hosts: disable this by setting
// WORKERS_IN_PROCESS=false and drive the same logic via host cron hitting
// dedicated cron endpoints instead (see docs / migration notes).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKERS_IN_PROCESS === "false") return;

  const { startUploadRetryWorker } = await import("@/lib/history/uploadRetryWorker");
  const { startRetentionWorker } = await import("@/lib/history/retentionWorker");
  startUploadRetryWorker();
  startRetentionWorker();
}
