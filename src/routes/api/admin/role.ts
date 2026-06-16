// POST /api/admin/role  { user_id, role?, tier? }
// Super-admin only. Assigns a staff role and/or billing tier via the
// audited admin_set_user_role RPC (which itself re-checks super-admin +
// self-protection at the DB layer). Pass only the field you want to
// change; omit the other.
//
// Requires migration 0005_rbac_foundation.sql to be applied — until then
// the RPC is missing and this returns 500.
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, getUserClient, requireCapability } from "../../../lib/auth-server";
import { isRole, isTier } from "../../../lib/rbac";

type Body = {
  user_id?: string;
  role?: string | null;
  tier?: string | null;
};

export const Route = createFileRoute("/api/admin/role")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await requireCapability(request, "roles.assign");

          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }

          const userId = (body.user_id || "").trim();
          if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

          const role = body.role == null ? null : String(body.role);
          const tier = body.tier == null ? null : String(body.tier);
          if (role === null && tier === null) {
            return Response.json({ error: "nothing to change" }, { status: 400 });
          }
          if (role !== null && !isRole(role)) {
            return Response.json({ error: "invalid role" }, { status: 400 });
          }
          if (tier !== null && !isTier(tier)) {
            return Response.json({ error: "invalid tier" }, { status: 400 });
          }

          // Call as the authenticated super-admin so the RPC's
          // auth.jwt()->>'email' / role check passes (service_role has no
          // email claim). SECURITY DEFINER gives it the privileges it needs.
          const userScoped = getUserClient(caller.accessToken);
          const { data, error } = await userScoped.rpc("admin_set_user_role", {
            p_target_user: userId,
            p_role: role,
            p_tier: tier,
          });
          if (error) {
            const msg = error.message || "RPC failed";
            const status = msg.includes("user_not_found")
              ? 404
              : msg.includes("forbidden")
                ? 403
                : msg.includes("cannot_")
                  ? 409
                  : 500;
            return Response.json({ error: msg }, { status });
          }

          return Response.json({ profile: data });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
