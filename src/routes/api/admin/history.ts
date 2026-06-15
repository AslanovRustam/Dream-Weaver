// GET /api/admin/history?user_id=...&...
// GET /api/admin/history?user_id=...&card_id=...   → single card detail
//
// Super-admin only. Reuses the queries module — same response shape as
// /api/history for the user-facing endpoints — but driven by service-role
// so RLS is bypassed and we filter by an arbitrary user_id.
//
// Audit: every super-admin peek is logged via audit_logs (action =
// 'admin.viewed_user_history') so we can answer "who looked at whom".
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, requireSuperAdmin } from "../../../lib/auth-server";
import { getAdminClient } from "../../../lib/supabase/admin";
import { getHistoryCard, listHistoryCards } from "../../../lib/history/queries";

async function writeAudit(
  adminUserId: string,
  targetUserId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const supa = getAdminClient();
    await supa.from("audit_logs").insert({
      user_id: adminUserId,
      target_user_id: targetUserId,
      action: "admin.viewed_user_history",
      resource_type: "history",
      details,
    });
  } catch (err) {
    console.error("audit_logs insert failed", err);
  }
}

export const Route = createFileRoute("/api/admin/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await requireSuperAdmin(request);
          const url = new URL(request.url);
          const targetUserId = (url.searchParams.get("user_id") || "").trim();
          if (!targetUserId) {
            return Response.json({ error: "user_id required" }, { status: 400 });
          }
          const cardId = url.searchParams.get("card_id");
          const supa = getAdminClient();

          if (cardId) {
            // Single-card detail mode. Don't restrict by ownerUserId
            // here — we already know the target via user_id param and
            // want to surface a clear 404 if the IDs don't match.
            const detail = await getHistoryCard(supa, cardId, targetUserId);
            if (!detail) {
              return Response.json({ error: "Card not found" }, { status: 404 });
            }
            await writeAudit(caller.id, targetUserId, { card_id: cardId });
            return Response.json({ card: detail });
          }

          const result = await listHistoryCards(supa, targetUserId, {
            offset: Number(url.searchParams.get("offset") || 0),
            limit: Number(url.searchParams.get("limit") || 20),
            q: url.searchParams.get("q") || undefined,
            presetId: url.searchParams.get("preset") || undefined,
            favoritesOnly: url.searchParams.get("favorites") === "1",
            bucket: url.searchParams.get("bucket") === "trash" ? "trash" : "active",
          });
          await writeAudit(caller.id, targetUserId, {
            offset: result.offset,
            limit: result.limit,
            q: url.searchParams.get("q") ?? null,
          });
          return Response.json(result);
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
