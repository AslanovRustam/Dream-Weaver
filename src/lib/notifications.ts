// Server-side helper for writing real notifications (see 0007_notifications.sql).
//
// All writes are best-effort: a notification is a side-effect, never the point
// of the request, so failures are swallowed (logged to console) and never break
// the caller. Inserts use the service-role client — the `notifications` table
// has no INSERT policy for regular users.
import { getAdminClient } from "@/lib/supabase/admin";

export type NotificationType = "credit_grant" | "low_balance" | "creative_ready" | "system";

/** Balance (in credits) at or below which we surface a low-balance nudge. */
export const LOW_BALANCE_THRESHOLD = 20;

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
};

/** Insert one notification for one user. Never throws. */
export async function notify(userId: string, n: NotifyInput): Promise<void> {
  if (!userId) return;
  try {
    const admin = getAdminClient();
    await admin.from("notifications").insert({
      user_id: userId,
      type: n.type,
      title: n.title.slice(0, 200),
      body: (n.body ?? "").slice(0, 1000),
      meta: n.meta ?? {},
    });
  } catch (e) {
    console.warn("notify failed", e);
  }
}

/**
 * Emit a low-balance notification when the balance drops to/below the threshold,
 * but only if there isn't already an unread low-balance one in the last 24h
 * (so a user near the threshold isn't spammed on every generation). Never throws.
 */
export async function notifyLowBalanceIfNeeded(userId: string, balance: number): Promise<void> {
  if (!userId || !Number.isFinite(balance) || balance > LOW_BALANCE_THRESHOLD) return;
  try {
    const admin = getAdminClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "low_balance")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length) return; // already nudged recently
    await notify(userId, {
      type: "low_balance",
      title: "Мало кредитов",
      body: `Осталось ${Math.round(balance)} кр. Пополните баланс, чтобы продолжить генерации.`,
      meta: { balance },
    });
  } catch (e) {
    console.warn("notifyLowBalanceIfNeeded failed", e);
  }
}
