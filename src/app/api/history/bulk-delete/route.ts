// POST /api/history/bulk-delete
// Body: { card_ids: string[] }
//
// Soft-deletes a batch of cards. Each call dispatches the soft_delete_card
// RPC per card (the RPC also writes an audit row and resolves the grace
// window). We loop because there's no batched server-side function — but
// bulk operations are gated to BULK_CARD_LIMIT to keep latency sane.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { BULK_CARD_LIMIT } from "@/lib/history/queries";

type Body = { card_ids?: string[] };

export async function POST(request: Request) {
        try {
          const user = await requireUser(request);
          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const ids = (body.card_ids ?? [])
            .filter((x): x is string => typeof x === "string" && !!x.trim())
            .map((x) => x.trim());

          if (ids.length === 0) {
            return Response.json({ error: "card_ids required" }, { status: 400 });
          }
          if (ids.length > BULK_CARD_LIMIT) {
            return Response.json(
              { error: `Maximum ${BULK_CARD_LIMIT} cards per bulk request` },
              { status: 400 },
            );
          }

          const supa = getUserClient(user.accessToken);
          const results: Array<{ id: string; ok: boolean; error?: string }> = [];
          for (const id of ids) {
            const { error } = await supa.rpc("soft_delete_card", { p_card_id: id });
            results.push({
              id,
              ok: !error,
              error: error?.message,
            });
          }

          const okCount = results.filter((r) => r.ok).length;
          return Response.json({ ok: true, deleted: okCount, results });
        } catch (err) {
          return authErrorResponse(err);
        }
      }
