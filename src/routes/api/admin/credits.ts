// POST /api/admin/credits
// Body: { user_id: string, delta: number, reason?: string, note?: string }
// Super-admin only. Atomically adjusts a user's credit balance and writes
// an audit row in credit_transactions.
//
// Positive delta = grant, negative delta = revoke. Going below zero is
// allowed for admins (e.g. clawback) — the DB function does not block it
// because admin_grant_credits is distinct from the spend path.
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, getUserClient, requireSuperAdmin } from "../../../lib/auth-server";

type Body = {
  user_id?: string;
  delta?: number;
  reason?: string;
  note?: string;
};

export const Route = createFileRoute("/api/admin/credits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await requireSuperAdmin(request);
          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }

          const userId = (body.user_id || "").trim();
          const delta = Number(body.delta);
          if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
          if (!Number.isFinite(delta) || delta === 0) {
            return Response.json({ error: "delta must be a non-zero number" }, { status: 400 });
          }
          if (Math.abs(delta) > 10_000_000) {
            return Response.json({ error: "delta out of range" }, { status: 400 });
          }
          const reason = (body.reason || "admin_grant").trim().slice(0, 40);

          // IMPORTANT: call the RPC as the authenticated user, not via
          // service_role. The function checks auth.jwt()->>'email' against
          // the super-admin allow-list, and service_role has no email claim.
          // SECURITY DEFINER on the function still gives it the privileges
          // it needs to update profiles + write the audit row.
          const userScoped = getUserClient(caller.accessToken);
          const { data, error } = await userScoped.rpc("admin_grant_credits", {
            p_target_user: userId,
            p_delta: delta,
            p_reason: reason,
            p_meta: {
              note: (body.note || "").slice(0, 500),
              admin_email: caller.email,
            },
          });
          if (error) {
            console.error("admin_grant_credits rpc failed", error);
            // Map known errors to readable HTTP status codes.
            const msg = error.message || "RPC failed";
            const status = msg.includes("user not found")
              ? 404
              : msg.includes("forbidden")
                ? 403
                : 500;
            return Response.json({ error: msg }, { status });
          }
          return Response.json({ new_balance: data });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
