// /api/history/:cardId
//   GET    — full card detail (master + every resize, form_snapshot, dates)
//   PATCH  — rename or toggle favorite (whitelist: name, is_favorite)
//   DELETE — soft-delete with grace window (see soft_delete_card RPC)
//
// Ownership: enforced by RLS on user-scoped client + by RPC checks.
// Super-admin viewing someone else's card uses /api/admin/history.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { getHistoryCard } from "@/lib/history/queries";
import { logAudit, logSystem } from "@/lib/logger";

type PatchBody = {
  name?: string;
  is_favorite?: boolean;
};

function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function GET(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const params = await ctx.params;
  try {
    const user = await requireUser(request);
    const cardId = String(params.cardId);
    const supa = getUserClient(user.accessToken);
    const detail = await getHistoryCard(supa, cardId, user.id);
    if (!detail) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    return Response.json({ card: detail });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const params = await ctx.params;
  try {
    const user = await requireUser(request);
    const cardId = String(params.cardId);

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const clean = sanitizeName(body.name);
      if (!clean) {
        return Response.json({ error: "name cannot be empty" }, { status: 400 });
      }
      update.name = clean;
    }
    if (typeof body.is_favorite === "boolean") {
      update.is_favorite = body.is_favorite;
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: "No editable fields" }, { status: 400 });
    }

    const supa = getUserClient(user.accessToken);
    const { data, error } = await supa
      .from("generation_cards")
      .update(update)
      .eq("id", cardId)
      .eq("user_id", user.id)
      .select("id, name, is_favorite")
      .maybeSingle();
    if (error) {
      void logSystem({
        level: "error",
        category: "history",
        message: "PATCH history card failed",
        user_id: user.id,
        context: { card_id: cardId, update },
        error,
      });
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    // Audit user-driven mutations of the card metadata. Useful for
    // both "I didn't change this" investigations and ops dashboards.
    if ("name" in update) {
      void logAudit({
        user_id: user.id,
        action: "card.renamed",
        resource_type: "card",
        resource_id: cardId,
        details: { new_name: update.name },
      });
    }
    if ("is_favorite" in update) {
      void logAudit({
        user_id: user.id,
        action: update.is_favorite ? "card.favorited" : "card.unfavorited",
        resource_type: "card",
        resource_id: cardId,
      });
    }
    return Response.json({ card: data });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const params = await ctx.params;
  try {
    const user = await requireUser(request);
    const cardId = String(params.cardId);

    // Soft-delete via RPC. The function uses auth.uid() to validate
    // ownership and reads card_delete_grace_hours from app_settings
    // to schedule hard_delete_after.
    const supa = getUserClient(user.accessToken);
    const { error } = await supa.rpc("soft_delete_card", {
      p_card_id: cardId,
    });
    if (error) {
      const msg = error.message || "delete failed";
      const status = msg.includes("card_not_found")
        ? 404
        : msg.includes("forbidden")
          ? 403
          : 500;
      console.error("soft_delete_card rpc failed", error);
      return Response.json({ error: msg }, { status });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
