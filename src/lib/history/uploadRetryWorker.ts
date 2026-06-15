/**
 * Crash-recoverable FTP upload retry worker (Task #7).
 *
 * Lifecycle of an upload:
 *
 *   1. /api/generate-image writes a generations row with upload_status='pending'
 *      and tries to push to FTP immediately (uploadInBackground in cardWriter).
 *
 *   2. If that first try succeeds → row gets image_url + upload_status='success'.
 *      Done.
 *
 *   3. If the first try fails, we persist the raw image bytes to a local
 *      temp directory (persistPendingBuffer) and bump upload_attempts +
 *      next_retry_at. The server can now crash without losing the bytes.
 *
 *   4. This worker (startUploadRetryWorker) runs on a setInterval inside
 *      the Node process. Every WORKER_INTERVAL_MS it queries:
 *
 *        SELECT id, public_id, user_id, is_master, width, height,
 *               upload_attempts, created_at
 *          FROM generations
 *         WHERE upload_status = 'pending'
 *           AND (next_retry_at IS NULL OR next_retry_at <= now())
 *           AND upload_attempts < MAX_ATTEMPTS
 *           AND created_at > now() - 72h
 *         LIMIT BATCH_SIZE;
 *
 *      For each row it tries an FTP upload using the buffer it pulled
 *      from disk. On success it clears the temp file; on fail it
 *      schedules the next retry with progressive backoff.
 *
 *   5. After MAX_ATTEMPTS or after the 72h budget is exhausted, the row
 *      is marked upload_status='failed' and the temp file is deleted.
 *
 * Why a temp file and not a column or memory map:
 *   - Memory map: lost on crash, not what the user asked for.
 *   - DB column: works but every retry rereads ~1.5 MB through Supabase,
 *     and writes never compact, bloating the row. Disk is faster.
 *   - Temp file: survives crashes, free to read, cleaned up on success.
 *
 * Server-only.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminClient } from "../supabase/admin";
import { uploadImage, type ImageFormat } from "../ftp/storage";

const WORKER_INTERVAL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 100;
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
const BATCH_SIZE = 20;

const TEMP_DIR = join(tmpdir(), "dream-weaver-uploads");

let workerStarted = false;
let workerTimer: NodeJS.Timeout | null = null;

/**
 * Persist the image bytes to a local temp file so the retry worker can
 * recover them after a server restart. Called from cardWriter's
 * uploadInBackground on the first FTP failure.
 */
export async function persistPendingBuffer(
  generationId: string,
  buffer: Buffer,
  format: ImageFormat,
): Promise<void> {
  await mkdir(TEMP_DIR, { recursive: true });
  const path = pendingFilePath(generationId, format);
  await writeFile(path, buffer);
}

function pendingFilePath(generationId: string, format: ImageFormat): string {
  return join(TEMP_DIR, `${generationId}.${format}`);
}

/**
 * Try both .png and .jpg paths since we don't know which format was used
 * (and persisting two metadata fields per row is overkill).
 */
async function loadPendingBuffer(
  generationId: string,
): Promise<{ buffer: Buffer; format: ImageFormat; path: string } | null> {
  for (const format of ["png", "jpg"] as ImageFormat[]) {
    const path = pendingFilePath(generationId, format);
    if (existsSync(path)) {
      try {
        const buffer = await readFile(path);
        return { buffer, format, path };
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Progressive backoff matching the schedule we agreed in the design:
 *   attempts  1-10  → 30 s
 *   attempts 11-30  → 2 min
 *   attempts 31-60  → 10 min
 *   attempts 61-100 → 60 min
 * Total worst case ≈ 46 h — well within the 72 h budget.
 */
function nextRetryDelayMs(attempts: number): number {
  if (attempts < 10) return 30_000;
  if (attempts < 30) return 2 * 60_000;
  if (attempts < 60) return 10 * 60_000;
  return 60 * 60_000;
}

async function logSystem(
  supa: SupabaseClient,
  level: "error" | "warn" | "info",
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await supa.from("system_logs").insert({
      level,
      category: "ftp",
      message,
      context,
    });
  } catch {
    // never throw from logging
  }
}

interface PendingRow {
  id: string;
  public_id: string;
  user_id: string;
  is_master: boolean;
  width: number | null;
  height: number | null;
  upload_attempts: number;
  created_at: string;
}

async function processOne(supa: SupabaseClient, row: PendingRow): Promise<void> {
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > MAX_AGE_MS) {
    await markFailed(supa, row.id, `Превышен лимит ${MAX_AGE_MS / 3_600_000} ч`);
    await cleanupTempFiles(row.id);
    await logSystem(supa, "warn", "upload give-up: age limit", {
      generation_id: row.id,
      attempts: row.upload_attempts,
      age_ms: ageMs,
    });
    return;
  }

  const loaded = await loadPendingBuffer(row.id);
  if (!loaded) {
    // No buffer on disk → cannot retry. Either the server was restarted
    // without graceful temp-dir migration, or the file was hand-deleted.
    await markFailed(supa, row.id, "Бинарь не найден на диске для повтора");
    await logSystem(supa, "error", "upload give-up: no buffer on disk", {
      generation_id: row.id,
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await uploadImage(loaded.buffer, {
      userId: row.user_id,
      publicId: row.public_id,
      kind: row.is_master ? "master" : "resize",
      format: loaded.format,
      width: row.is_master ? undefined : (row.width ?? undefined),
      height: row.is_master ? undefined : (row.height ?? undefined),
    });
    await supa
      .from("generations")
      .update({
        image_url: result.url,
        ftp_path: result.ftpPath,
        filename: result.filename,
        upload_status: "success",
        next_retry_at: null,
        last_error: null,
      })
      .eq("id", row.id);
    await cleanupTempFiles(row.id);
    await logSystem(supa, "info", "upload retry succeeded", {
      generation_id: row.id,
      attempts: row.upload_attempts + 1,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const nextAttempts = row.upload_attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await markFailed(supa, row.id, msg);
      await cleanupTempFiles(row.id);
      await logSystem(supa, "warn", "upload give-up: max attempts", {
        generation_id: row.id,
        attempts: nextAttempts,
        last_error: msg.slice(0, 200),
      });
      return;
    }
    const delay = nextRetryDelayMs(nextAttempts);
    await supa
      .from("generations")
      .update({
        upload_attempts: nextAttempts,
        next_retry_at: new Date(Date.now() + delay).toISOString(),
        last_error: msg.slice(0, 500),
      })
      .eq("id", row.id);
    await logSystem(supa, "warn", "upload retry failed", {
      generation_id: row.id,
      attempts: nextAttempts,
      next_in_ms: delay,
      error: msg.slice(0, 200),
    });
  }
}

async function markFailed(
  supa: SupabaseClient,
  generationId: string,
  reason: string,
): Promise<void> {
  await supa
    .from("generations")
    .update({
      upload_status: "failed",
      last_error: reason.slice(0, 500),
      next_retry_at: null,
    })
    .eq("id", generationId);
}

async function cleanupTempFiles(generationId: string): Promise<void> {
  for (const format of ["png", "jpg"] as ImageFormat[]) {
    const path = pendingFilePath(generationId, format);
    if (existsSync(path)) {
      try {
        await unlink(path);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

/**
 * The main tick. Pulls a batch of due pending rows and processes each.
 * Errors are caught per-row so one bad upload never breaks the loop.
 */
async function tick(): Promise<void> {
  let supa: SupabaseClient;
  try {
    supa = getAdminClient();
  } catch (err) {
    // Env not ready (likely during cold boot) — try again next tick.
    console.error("upload-retry-worker: admin client unavailable", err);
    return;
  }

  try {
    const { data, error } = await supa
      .from("generations")
      .select("id, public_id, user_id, is_master, width, height, upload_attempts, created_at")
      .eq("upload_status", "pending")
      .lt("upload_attempts", MAX_ATTEMPTS)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("upload-retry-worker: select failed", error);
      return;
    }
    const rows = (data ?? []) as PendingRow[];
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        await processOne(supa, row);
      } catch (err) {
        console.error("upload-retry-worker: row failed", row.id, err);
      }
    }
  } catch (err) {
    console.error("upload-retry-worker: tick crashed", err);
  }
}

/**
 * Idempotent. Starts the retry loop. Safe to call from multiple module
 * loads — only one timer ever runs in the process.
 */
export function startUploadRetryWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  // Fire one immediate tick at boot so any pending rows from before a
  // crash get picked up right away instead of waiting WORKER_INTERVAL_MS.
  void tick();
  workerTimer = setInterval(() => {
    void tick();
  }, WORKER_INTERVAL_MS);
  // Make sure the worker doesn't hold the process open if the runtime
  // ever wants to exit (e.g. test teardown).
  if (workerTimer && typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }
  console.log(
    `[upload-retry-worker] started, interval=${WORKER_INTERVAL_MS}ms, max_attempts=${MAX_ATTEMPTS}, max_age=${MAX_AGE_MS}ms`,
  );
}

export const __testing = { tick, nextRetryDelayMs };
