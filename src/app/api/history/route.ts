// GET /api/history
// Lists the caller's history cards, paginated and filtered.
//
// Query params:
//   ?offset=0&limit=20
//   ?q=spartak              full-text search (русский dictionary)
//   ?preset=preset4         preset filter
//   ?favorites=1            only favorite-starred cards
//   ?bucket=active|trash    default 'active' (non-deleted), 'trash' = soft-deleted
//
// Returns { items, total, offset, limit }. See HistoryListResult in
// src/lib/history/queries.ts for the item shape.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { listHistoryCards } from "@/lib/history/queries";

export async function GET(request: Request) {
        try {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const supa = getUserClient(user.accessToken);

          const result = await listHistoryCards(supa, user.id, {
            offset: Number(url.searchParams.get("offset") || 0),
            limit: Number(url.searchParams.get("limit") || 20),
            q: url.searchParams.get("q") || undefined,
            presetId: url.searchParams.get("preset") || undefined,
            favoritesOnly: url.searchParams.get("favorites") === "1",
            bucket: url.searchParams.get("bucket") === "trash" ? "trash" : "active",
          });

          return Response.json(result);
        } catch (err) {
          return authErrorResponse(err);
        }
      }
