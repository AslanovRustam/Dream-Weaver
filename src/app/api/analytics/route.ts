// POST /api/analytics — first-party event ingest.
//
// This route is deliberately open to guests: the whole point is to see what
// people do BEFORE they sign up. That makes it the one unauthenticated write
// path in the app, so it is fenced in instead of trusted:
//   • the body is capped before it is read, and again after parsing;
//   • event names come from a fixed allowlist — unknown names are dropped, not
//     stored, so the table cannot be used as someone else's database;
//   • props are scalars only, with a key count and a length limit;
//   • rate-limited per IP, and the IP is used only as that key: it is hashed
//     for the limiter and never written anywhere;
//   • it costs nothing to serve — no provider call, no credits.
// The response is always 202 with no detail, so it cannot be probed for
// whether a user, a session or the table itself exists.
import { createHash } from "node:crypto";

import { optionalUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_EVENT_SET,
  MAX_BATCH_BYTES,
  MAX_EVENTS_PER_BATCH,
  MAX_ID_LENGTH,
  MAX_PATH_LENGTH,
  MAX_PROP_KEYS,
  MAX_PROP_LENGTH,
} from "@/lib/analyticsEvents";

export const runtime = "nodejs";

const accepted = () => Response.json({ ok: true }, { status: 202 });

type InEvent = {
  name?: unknown;
  props?: unknown;
  path?: unknown;
  ref?: unknown;
};

type Row = {
  name: string;
  user_id: string | null;
  anon_id: string | null;
  session_id: string | null;
  path: string | null;
  referrer_host: string | null;
  props: Record<string, string | number | boolean>;
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function cleanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, MAX_ID_LENGTH);
  return ID_RE.test(s) ? s : null;
}

/** Pathname only — a query string can carry anything the page put in it. */
function cleanPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().split("?")[0].split("#")[0];
  if (!s.startsWith("/")) return null;
  return s.slice(0, MAX_PATH_LENGTH);
}

function cleanReferrerHost(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  try {
    return new URL(v).hostname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

function cleanProps(v: unknown): Record<string, string | number | boolean> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (n >= MAX_PROP_KEYS) break;
    if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof raw === "string") out[k] = raw.slice(0, MAX_PROP_LENGTH);
    else if (typeof raw === "number" && Number.isFinite(raw)) out[k] = raw;
    else if (typeof raw === "boolean") out[k] = raw;
    else continue;
    n += 1;
  }
  return out;
}

function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  // Hashed so the limiter's key store never holds a raw address.
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  const tooBig = rejectLargeBody(request, MAX_BATCH_BYTES);
  if (tooBig) return tooBig;

  const limited = await rateLimitResponse("analytics", clientKey(request), 60, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return accepted();
  }

  const b = (body ?? {}) as { events?: unknown; anon_id?: unknown; session_id?: unknown };
  const list = Array.isArray(b.events) ? b.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
  if (list.length === 0) return accepted();

  // A valid session is optional; a broken one must not lose the event.
  const user = await optionalUser(request).catch(() => null);
  const anonId = cleanId(b.anon_id);
  const sessionId = cleanId(b.session_id);

  const rows: Row[] = [];
  for (const raw of list) {
    const e = (raw ?? {}) as InEvent;
    const name = typeof e.name === "string" ? e.name : "";
    if (!ANALYTICS_EVENT_SET.has(name)) continue;
    rows.push({
      name,
      user_id: user?.id ?? null,
      anon_id: anonId,
      session_id: sessionId,
      path: cleanPath(e.path),
      referrer_host: cleanReferrerHost(e.ref),
      props: cleanProps(e.props),
    });
  }
  if (rows.length === 0) return accepted();

  const { error } = await getAdminClient().from("analytics_events").insert(rows);
  if (error) {
    // A missing table (migration 0012 not applied yet) must never break the
    // page that sent this — log once per failure and still answer 202.
    console.error("analytics insert failed", error.message);
  }
  return accepted();
}
