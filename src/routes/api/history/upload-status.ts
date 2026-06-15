// GET /api/history/upload-status
//
// Lightweight summary endpoint for the header badge: counts of failed
// and still-pending uploads for the calling user. Numbers come from
// generations rows, masked through RLS so each user sees only their
// own. Used to render the "не сохранено в облаке" indicator.
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, getUserClient, requireUser } from "../../../lib/auth-server";

export const Route = createFileRoute("/api/history/upload-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const supa = getUserClient(user.accessToken);

          const [failed, pending] = await Promise.all([
            supa
              .from("generations")
              .select("id", { count: "exact", head: true })
              .eq("upload_status", "failed")
              .is("deleted_at", null),
            supa
              .from("generations")
              .select("id", { count: "exact", head: true })
              .eq("upload_status", "pending")
              .is("deleted_at", null),
          ]);

          if (failed.error) {
            console.error("upload-status failed query", failed.error);
            return Response.json({ error: failed.error.message }, { status: 500 });
          }
          if (pending.error) {
            console.error("upload-status pending query", pending.error);
            return Response.json({ error: pending.error.message }, { status: 500 });
          }

          return Response.json({
            failed: failed.count ?? 0,
            pending: pending.count ?? 0,
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
