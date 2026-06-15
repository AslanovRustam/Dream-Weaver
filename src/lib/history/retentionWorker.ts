/**
 * Retention worker (Task #9).
 *
 * Two responsibilities, fused into one daily tick because they share
 * the same wake-up cost:
 *
 *  1. Hard-delete cards that are past their hard_delete_after (the
 *     post-soft-delete grace window has elapsed) AND cards whose
 *     expires_at is in the past (retention period exhausted). For each:
 *
 *       a) Read every generations row for the card to get its ftp_path
 *       b) Delete those files from FTP (continue on per-file failure —
 *          the row carries the path so we can re-try later)
 *       c) Call hard_delete_card RPC (service-role only) → cascades to
 *          generations rows
 *
 *  2. Run cleanup_expired_logs RPC to trim system_logs / audit_logs
 *     per their retention_*_days settings. The RPC handles the SQL
 *     side; we just kick it.
 *
 * Schedule: once every 6 hours. The grace window is measured in hours,
 * retention in months — there's no urgency, and we'd rather batch the
 * FTP work.
 *
 * Server-only. Idempotent boot via startRetentionWorker(); the timer is
 * unref'd so it doesn't block process exit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminClient } from "../supabase/admin";
import { deleteCardFiles } from "../ftp/storage";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BATCH_SIZE = 100;

let workerStarted = false;
let workerTimer: NodeJS.Timeout | null = null;

interface ExpiringCard {
  id: string;
  user_id: string;
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
      category: "cron",
      message,
      context,
    });
  } catch {
    // never throw from logging
  }
}

/**
 * Collect cards that should disappear right now:
 *   - Hard-delete window expired (was soft-deleted, grace gone)
 *   - Retention expired (expires_at < now, no soft-delete needed)
 *
 * We don't filter out cards that are still uploading — if expires_at
 * caught up with a pending row, the user has bigger problems than a
 * skipped retention pass.
 */
async function fetchExpiringCards(supa: SupabaseClient): Promise<ExpiringCard[]> {
  const nowIso = new Date().toISOString();

  const [hardDel, retention] = await Promise.all([
    supa
      .from("generation_cards")
      .select("id, user_id")
      .not("hard_delete_after", "is", null)
      .lte("hard_delete_after", nowIso)
      .limit(BATCH_SIZE),
    supa
      .from("generation_cards")
      .select("id, user_id")
      .is("deleted_at", null)
      .lte("expires_at", nowIso)
      .limit(BATCH_SIZE),
  ]);

  if (hardDel.error) console.error("retention: hard-del select", hardDel.error);
  if (retention.error) console.error("retention: expires select", retention.error);

  const merged = new Map<string, ExpiringCard>();
  for (const r of (hardDel.data ?? []) as ExpiringCard[]) merged.set(r.id, r);
  for (const r of (retention.data ?? []) as ExpiringCard[]) merged.set(r.id, r);
  return Array.from(merged.values());
}

async function processCard(supa: SupabaseClient, card: ExpiringCard): Promise<void> {
  // Pull every generations row tied to this card. We only care about
  // ftp_path so we can erase the file.
  const { data: gens, error: genErr } = await supa
    .from("generations")
    .select("id, ftp_path")
    .eq("card_id", card.id);
  if (genErr) {
    await logSystem(supa, "error", "retention: select generations failed", {
      card_id: card.id,
      error: genErr.message,
    });
    return;
  }

  const ftpPaths = ((gens ?? []) as Array<{ id: string; ftp_path: string | null }>)
    .map((g) => g.ftp_path)
    .filter((p): p is string => !!p);

  try {
    if (ftpPaths.length > 0) {
      await deleteCardFiles(ftpPaths);
    }
  } catch (err) {
    // We log but proceed — if FTP-side delete is broken we still want
    // to release DB space. Orphaned files can be cleaned up by hand
    // and the system_logs row tells us exactly which.
    await logSystem(supa, "warn", "retention: ftp delete failed (continuing)", {
      card_id: card.id,
      paths: ftpPaths,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const { error: rpcErr } = await supa.rpc("hard_delete_card", { p_card_id: card.id });
  if (rpcErr) {
    await logSystem(supa, "error", "retention: hard_delete_card rpc failed", {
      card_id: card.id,
      error: rpcErr.message,
    });
    return;
  }

  await logSystem(supa, "info", "card hard-deleted", {
    card_id: card.id,
    user_id: card.user_id,
    file_count: ftpPaths.length,
  });
}

async function tick(): Promise<void> {
  let supa: SupabaseClient;
  try {
    supa = getAdminClient();
  } catch (err) {
    console.error("retention-worker: admin client unavailable", err);
    return;
  }

  try {
    const cards = await fetchExpiringCards(supa);
    for (const c of cards) {
      try {
        await processCard(supa, c);
      } catch (err) {
        console.error("retention-worker: card failed", c.id, err);
      }
    }

    // Logs cleanup. The RPC is idempotent and tiny — fine to run every tick.
    try {
      const { error } = await supa.rpc("cleanup_expired_logs");
      if (error) {
        console.error("retention-worker: cleanup_expired_logs failed", error);
      }
    } catch (err) {
      console.error("retention-worker: cleanup_expired_logs threw", err);
    }
  } catch (err) {
    console.error("retention-worker: tick crashed", err);
  }
}

/**
 * Idempotent. Starts the once-every-6h retention loop.
 */
export function startRetentionWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  // Fire one tick at boot so a long-running server that just came back
  // up doesn't sit on a pile of expired cards for hours.
  void tick();
  workerTimer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  if (workerTimer && typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }
  console.log(`[retention-worker] started, interval=${TICK_INTERVAL_MS}ms`);
}

export const __testing = { tick };
