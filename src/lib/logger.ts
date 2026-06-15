/**
 * Centralized logger for server-side code.
 *
 * Why a wrapper instead of `console.error` everywhere:
 *   - Persists rows into system_logs (Supabase) so /admin → Логи can
 *     surface them. console output disappears with the process.
 *   - Forces a small structured schema (level, category, message,
 *     context, optional duration_ms / user_id / request_id /
 *     error_stack) — consistent fields for filtering.
 *   - Best-effort: every log call also writes to console; the DB
 *     insert is fire-and-forget and never throws.
 *
 * Two helpers:
 *   logSystem({level, category, message, ...}) — for any technical
 *     observability (errors, retries, durations, FTP events, ...).
 *   logAudit({action, user_id, ...}) — for business / security events
 *     (card created, deletes, admin actions). Stored separately and
 *     not subject to short retention.
 *
 * Pass a Supabase client only when you already have one in scope.
 * Otherwise both helpers will instantiate the admin client themselves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminClient } from "./supabase/admin";

export type LogLevel = "error" | "warn" | "info" | "debug";
export type LogCategory =
  | "ftp"
  | "image-gen"
  | "ai-naming"
  | "auth"
  | "cron"
  | "api"
  | "admin"
  | "history"
  | "billing";

export interface SystemLogArgs {
  level: LogLevel;
  category: LogCategory | string;
  message: string;
  context?: Record<string, unknown>;
  user_id?: string | null;
  request_id?: string | null;
  duration_ms?: number | null;
  error?: unknown;
  /** Pass an existing client to skip the admin client lookup. */
  supa?: SupabaseClient;
}

export async function logSystem(args: SystemLogArgs): Promise<void> {
  const consoleFn =
    args.level === "error" ? console.error : args.level === "warn" ? console.warn : console.log;
  consoleFn(`[${args.category}] ${args.message}`, args.context ?? "", args.error ?? "");

  try {
    const supa = args.supa ?? getAdminClient();
    const stack =
      args.error instanceof Error
        ? (args.error.stack ?? args.error.message)
        : args.error
          ? String(args.error)
          : null;
    await supa.from("system_logs").insert({
      level: args.level,
      category: args.category,
      message: args.message.slice(0, 1000),
      context: args.context ?? {},
      user_id: args.user_id ?? null,
      request_id: args.request_id ?? null,
      duration_ms: typeof args.duration_ms === "number" ? Math.round(args.duration_ms) : null,
      error_stack: stack ? stack.slice(0, 8000) : null,
    });
  } catch {
    // Never throw from logging. Console output above is the fallback.
  }
}

export interface AuditLogArgs {
  user_id?: string | null;
  target_user_id?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  supa?: SupabaseClient;
}

export async function logAudit(args: AuditLogArgs): Promise<void> {
  try {
    const supa = args.supa ?? getAdminClient();
    await supa.from("audit_logs").insert({
      user_id: args.user_id ?? null,
      target_user_id: args.target_user_id ?? null,
      action: args.action.slice(0, 120),
      resource_type: args.resource_type ?? null,
      resource_id: args.resource_id ?? null,
      details: args.details ?? {},
      ip_address: args.ip_address ?? null,
      user_agent: args.user_agent ?? null,
    });
  } catch (err) {
    // Fall back to console — never throw from audit.
    console.error("logAudit failed", err, "for action", args.action);
  }
}

/**
 * Cheap correlation id for a single HTTP request. Pass it through to
 * every logSystem call in the same handler so all related rows can
 * be filtered together in the /admin → Логи viewer.
 */
export function newRequestId(): string {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}
