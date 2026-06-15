// GET  /api/admin/pricing — list all (model, quality) coefficients
// PUT  /api/admin/pricing — upsert one or many rows
//
// Body for PUT:
//   { items: [{ model: string, quality: 'low'|'medium'|'high', coefficient: number }, ...] }
//
// credits charged per generation = total_tokens * coefficient
// (we keep coefficients in the DB so the team can tune them without redeploy).
import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, requireSuperAdmin, requireUser } from "../../../lib/auth-server";
import { getAdminClient } from "../../../lib/supabase/admin";

type Item = { model?: string; quality?: string; coefficient?: number };

const ALLOWED_QUALITY = new Set(["low", "medium", "high"]);

export const Route = createFileRoute("/api/admin/pricing")({
  server: {
    handlers: {
      // Pricing is readable by any authenticated user (the UI may want to
      // show "this generation will cost ~X credits"). The RLS policy
      // already allows that — we just enforce auth at the API boundary.
      GET: async ({ request }) => {
        try {
          await requireUser(request);
          const admin = getAdminClient();
          const { data, error } = await admin
            .from("pricing_coefficients")
            .select("id,model,quality,coefficient,updated_at,updated_by")
            .order("model", { ascending: true })
            .order("quality", { ascending: true });
          if (error) {
            console.error("pricing select failed", error);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ items: data ?? [] });
        } catch (err) {
          return authErrorResponse(err);
        }
      },

      PUT: async ({ request }) => {
        try {
          const caller = await requireSuperAdmin(request);
          let body: { items?: Item[] };
          try {
            body = (await request.json()) as { items?: Item[] };
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const items = Array.isArray(body.items) ? body.items : [];
          if (items.length === 0) {
            return Response.json({ error: "items required" }, { status: 400 });
          }
          if (items.length > 50) {
            return Response.json({ error: "Too many items" }, { status: 400 });
          }

          const rows: Array<{
            model: string;
            quality: string;
            coefficient: number;
            updated_by: string;
            updated_at: string;
          }> = [];
          for (const raw of items) {
            const model = (raw.model || "").trim().slice(0, 60);
            const quality = (raw.quality || "").trim().toLowerCase();
            const coef = Number(raw.coefficient);
            if (!model) {
              return Response.json({ error: "model required for each item" }, { status: 400 });
            }
            if (!ALLOWED_QUALITY.has(quality)) {
              return Response.json(
                { error: `quality must be one of low|medium|high (got "${quality}")` },
                { status: 400 },
              );
            }
            if (!Number.isFinite(coef) || coef < 0 || coef > 1000) {
              return Response.json(
                { error: `coefficient out of range for ${model}/${quality}` },
                { status: 400 },
              );
            }
            rows.push({
              model,
              quality,
              coefficient: coef,
              updated_by: caller.id,
              updated_at: new Date().toISOString(),
            });
          }

          const admin = getAdminClient();
          const { data, error } = await admin
            .from("pricing_coefficients")
            .upsert(rows, { onConflict: "model,quality" })
            .select("id,model,quality,coefficient,updated_at,updated_by");
          if (error) {
            console.error("pricing upsert failed", error);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ items: data ?? [] });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
