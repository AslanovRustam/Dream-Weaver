// POST /api/history/restore
// Body: { card_id: string }
//
// Undeletes a soft-deleted card if still within the grace window.
// The RPC raises 'grace_period_expired' if the window has passed —
// in that case the card is on its way out and cannot be saved.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";

type Body = { card_id?: string };

export async function POST(request: Request) {
        try {
          const user = await requireUser(request);
          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const cardId = (body.card_id || "").trim();
          if (!cardId) {
            return Response.json({ error: "card_id required" }, { status: 400 });
          }

          const supa = getUserClient(user.accessToken);
          const { error } = await supa.rpc("restore_card", { p_card_id: cardId });
          if (error) {
            const msg = error.message || "restore failed";
            const status = msg.includes("card_not_found")
              ? 404
              : msg.includes("forbidden")
                ? 403
                : msg.includes("grace_period_expired")
                  ? 410 // Gone
                  : 500;
            console.error("restore_card rpc failed", error);
            return Response.json({ error: msg }, { status });
          }
          return Response.json({ ok: true });
        } catch (err) {
          return authErrorResponse(err);
        }
      }
