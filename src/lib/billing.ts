// Flat-price credit billing for the fixed-cost generators (character, slot
// symbols, crash rocket, email hero). Unlike the banner master — which is
// billed post-hoc from the provider's token count — these have a known price
// up front, so the safe order is: charge → call provider → refund on failure.
// That closes the "provider cost sunk before we know the user can pay" race
// the banner route has, and means a broke user never triggers a paid call.
//
// Both RPCs are SECURITY DEFINER and granted to service_role only, so this
// must only ever run with getAdminClient() on the server.
import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystem } from "@/lib/logger";
import { notifyLowBalanceIfNeeded } from "@/lib/notifications";

export type ChargeResult = { ok: true; balance: number } | { ok: false; response: Response };

/** Debit `amount` credits atomically. On insufficient balance returns a
 *  ready 402 (caller returns it verbatim); on any other failure a 500. */
export async function chargeFlat(
  supa: SupabaseClient,
  userId: string,
  amount: number,
  meta: Record<string, unknown>,
): Promise<ChargeResult> {
  const { data, error } = await supa.rpc("spend_credits", {
    p_user: userId,
    p_amount: amount,
    p_meta: { ...meta, flat: true, amount },
  });
  if (error) {
    if (/insufficient_credits/i.test(error.message)) {
      return {
        ok: false,
        response: Response.json(
          { error: "insufficient_credits", required: amount },
          { status: 402 },
        ),
      };
    }
    await logSystem({
      supa,
      level: "error",
      category: "billing",
      message: "spend_credits failed",
      user_id: userId,
      context: { amount, feature: meta.feature, error: error.message },
    });
    return {
      ok: false,
      response: Response.json({ error: "billing_error" }, { status: 500 }),
    };
  }
  const balance = Number(data ?? 0);
  void notifyLowBalanceIfNeeded(userId, balance);
  return { ok: true, balance };
}

/** Give a flat charge back after the provider call failed. Best-effort:
 *  logs on failure, never throws — the caller is already on an error path. */
export async function refundFlat(
  supa: SupabaseClient,
  userId: string,
  amount: number,
  meta: Record<string, unknown>,
): Promise<void> {
  const { error } = await supa.rpc("refund_credits", {
    p_user: userId,
    p_amount: amount,
    p_meta: { ...meta, flat: true, amount },
  });
  if (error) {
    await logSystem({
      supa,
      level: "error",
      category: "billing",
      message: "refund_credits failed — user was charged for a failed generation",
      user_id: userId,
      context: { amount, feature: meta.feature, error: error.message },
    });
  }
}
