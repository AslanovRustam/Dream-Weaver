// GET /api/admin/users?q=<search>&limit=<n>&offset=<n>
// Super-admin only. Lists profiles with credit balance. `q` matches
// against email, first_name, last_name, nickname (case-insensitive).
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, requireCapability } from "../../../lib/auth-server";
import { getAdminClient } from "../../../lib/supabase/admin";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireCapability(request, "users.view");
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") || "").trim();
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

          const admin = getAdminClient();
          let query = admin
            .from("profiles")
            .select(
              "id,email,first_name,last_name,nickname,phone,contact,credits_balance,role,tier,created_at,updated_at",
              { count: "exact" },
            )
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

          if (q) {
            // ilike across the obvious text fields.
            const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
            query = query.or(
              `email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},nickname.ilike.${like}`,
            );
          }

          const { data, error, count } = await query;
          if (error) {
            console.error("admin/users select failed", error);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({
            users: data ?? [],
            total: count ?? null,
            limit,
            offset,
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
