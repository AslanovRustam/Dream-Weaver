// GET /api/admin/logs?kind=system|audit&...
//
// Super-admin only. Reads from system_logs or audit_logs depending on
// ?kind=. Supports filtering and offset/limit pagination.
//
// system_logs filters:
//   ?level=error|warn|info|debug
//   ?category=ftp|image-gen|auth|cron|api|admin
//   ?user_id=<uuid>
//   ?q=<substring in message>          (ILIKE)
//
// audit_logs filters:
//   ?action=card.deleted|admin.viewed_user_history|settings.updated|...
//   ?user_id=<uuid>           who did it
//   ?target_user_id=<uuid>    to whom
//
// Common:
//   ?since=<ISO date>        rows newer than this
//   ?offset=0&limit=50
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, requireCapability } from "../../../lib/auth-server";
import { getAdminClient } from "../../../lib/supabase/admin";

const MAX_LIMIT = 200;

export const Route = createFileRoute("/api/admin/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireCapability(request, "logs.view");
          const url = new URL(request.url);
          const kind = url.searchParams.get("kind") || "system";
          if (kind !== "system" && kind !== "audit" && kind !== "tokens") {
            return Response.json({ error: "kind must be system|audit|tokens" }, { status: 400 });
          }

          const limit = Math.min(
            Math.max(Number(url.searchParams.get("limit")) || 50, 1),
            MAX_LIMIT,
          );
          const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
          const since = url.searchParams.get("since") || "";

          const supa = getAdminClient();

          if (kind === "tokens") {
            // Token-usage view: image-gen + ai-naming rows that carry
            // token counts. Joined from system_logs; no separate table.
            const userId = url.searchParams.get("user_id");
            const msgFilter = url.searchParams.get("msg") || "";
            let q = supa
              .from("system_logs")
              .select(
                "id, message, category, context, user_id, duration_ms, created_at",
                { count: "exact" },
              )
              .in("category", ["image-gen", "ai-naming"])
              .in("message", [
                "master generated",
                "resize generated",
                "vision pre-pass succeeded",
                "card name polished",
              ]);
            if (userId) q = q.eq("user_id", userId);
            if (msgFilter) q = q.eq("message", msgFilter);
            if (since) q = q.gte("created_at", since);
            const { data, error, count } = await q
              .order("created_at", { ascending: false })
              .range(offset, offset + limit - 1);
            if (error) {
              console.error("admin/logs tokens query failed", error);
              return Response.json({ error: error.message }, { status: 500 });
            }
            return Response.json({ items: data ?? [], total: count ?? 0, offset, limit });
          }

          if (kind === "system") {
            let q = supa
              .from("system_logs")
              .select(
                "id, level, category, message, context, user_id, request_id, duration_ms, error_stack, created_at",
                { count: "exact" },
              );

            const level = url.searchParams.get("level");
            const category = url.searchParams.get("category");
            const userId = url.searchParams.get("user_id");
            const text = url.searchParams.get("q");

            if (level) q = q.eq("level", level);
            if (category) q = q.eq("category", category);
            if (userId) q = q.eq("user_id", userId);
            if (text) q = q.ilike("message", `%${text}%`);
            if (since) q = q.gte("created_at", since);

            const { data, error, count } = await q
              .order("created_at", { ascending: false })
              .range(offset, offset + limit - 1);
            if (error) {
              console.error("admin/logs system query failed", error);
              return Response.json({ error: error.message }, { status: 500 });
            }
            return Response.json({
              items: data ?? [],
              total: count ?? 0,
              offset,
              limit,
            });
          }

          // audit_logs
          let q = supa
            .from("audit_logs")
            .select(
              "id, user_id, target_user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at",
              { count: "exact" },
            );

          const action = url.searchParams.get("action");
          const userId = url.searchParams.get("user_id");
          const targetUserId = url.searchParams.get("target_user_id");

          if (action) q = q.eq("action", action);
          if (userId) q = q.eq("user_id", userId);
          if (targetUserId) q = q.eq("target_user_id", targetUserId);
          if (since) q = q.gte("created_at", since);

          const { data, error, count } = await q
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) {
            console.error("admin/logs audit query failed", error);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({
            items: data ?? [],
            total: count ?? 0,
            offset,
            limit,
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
