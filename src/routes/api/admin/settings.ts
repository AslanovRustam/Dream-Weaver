// GET  /api/admin/settings        — list every app_settings row
// PUT  /api/admin/settings        — set one or many settings at once
//
// Body for PUT:
//   { items: [{ key: string, value: <jsonb-compatible> }, ...] }
//
// Updates run through the admin_set_setting RPC (security-definer), which
// validates super-admin status and writes an audit row per change. We
// stream them through the user-scoped client so auth.uid() resolves to the
// caller — service-role would fail the function's email check, same as
// admin_grant_credits in admin/credits.ts.
import { createFileRoute } from "@tanstack/react-router";

import {
  authErrorResponse,
  getUserClient,
  requireSuperAdmin,
  requireUser,
} from "../../../lib/auth-server";
import { getAdminClient } from "../../../lib/supabase/admin";

type Item = { key?: string; value?: unknown };

// Per-key validators. Reject obviously bad values up-front so the RPC
// doesn't store garbage. -1 means "never" for retention keys.
const VALIDATORS: Record<string, (v: unknown) => string | null> = {
  retention_cards_months: numericRange(1, 120),
  retention_logs_days: numericRange(1, 3650),
  retention_audit_days: numericOrNever(1, 3650),
  card_delete_grace_hours: numericRange(1, 24 * 30),
  ftp_retry_max_attempts: numericRange(1, 10_000),
  ftp_retry_max_hours: numericRange(1, 24 * 30),
  crash_recovery_interval_minutes: numericRange(1, 1440),
  resize_format: enumValidator(["png", "jpg90", "jpg95"]),
  bulk_zip_max_cards: numericRange(1, 200),
  history_page_size: numericRange(1, 100),
  ai_naming_enabled: booleanValidator,
  ai_naming_model: stringValidator(1, 60),
};

function numericRange(min: number, max: number) {
  return (v: unknown): string | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "must be a number";
    if (n < min || n > max) return `must be in [${min}, ${max}]`;
    return null;
  };
}

function numericOrNever(min: number, max: number) {
  return (v: unknown): string | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "must be a number";
    if (n === -1) return null;
    if (n < min || n > max) return `must be -1 (never) or in [${min}, ${max}]`;
    return null;
  };
}

function enumValidator(allowed: string[]) {
  return (v: unknown): string | null => {
    if (typeof v !== "string") return "must be a string";
    if (!allowed.includes(v)) return `must be one of ${allowed.join("|")}`;
    return null;
  };
}

function booleanValidator(v: unknown): string | null {
  return typeof v === "boolean" ? null : "must be true|false";
}

function stringValidator(min: number, max: number) {
  return (v: unknown): string | null => {
    if (typeof v !== "string") return "must be a string";
    if (v.length < min || v.length > max) return `length must be in [${min}, ${max}]`;
    return null;
  };
}

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Settings are readable by any logged-in user so client code
          // can mirror server limits (e.g. bulk_zip_max_cards). Writes
          // are super-admin only.
          await requireUser(request);
          const admin = getAdminClient();
          const { data, error } = await admin
            .from("app_settings")
            .select("key, value, description, updated_at, updated_by")
            .order("key", { ascending: true });
          if (error) {
            console.error("settings select failed", error);
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

          // Validate every item before persisting any of them — fail
          // fast instead of half-applying.
          for (const it of items) {
            const key = (it.key || "").trim();
            if (!key) return Response.json({ error: "key required" }, { status: 400 });
            const validator = VALIDATORS[key];
            if (!validator) {
              return Response.json({ error: `unknown setting key "${key}"` }, { status: 400 });
            }
            const verdict = validator(it.value);
            if (verdict) {
              return Response.json({ error: `setting "${key}" ${verdict}` }, { status: 400 });
            }
          }

          const supa = getUserClient(caller.accessToken);
          const results: Array<{ key: string; ok: boolean; error?: string }> = [];
          for (const it of items) {
            const key = (it.key as string).trim();
            const { error } = await supa.rpc("admin_set_setting", {
              p_key: key,
              p_value: it.value,
            });
            results.push({
              key,
              ok: !error,
              error: error?.message,
            });
          }

          // Re-read the full list so the client UI stays in sync with
          // anything the trigger or another admin changed concurrently.
          const admin = getAdminClient();
          const { data } = await admin
            .from("app_settings")
            .select("key, value, description, updated_at, updated_by")
            .order("key", { ascending: true });

          return Response.json({ items: data ?? [], results });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
