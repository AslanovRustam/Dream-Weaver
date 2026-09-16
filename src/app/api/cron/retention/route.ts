// GET /api/cron/retention — scheduled retention pass for serverless hosts.
//
// On a long-lived Node host the retentionWorker runs in-process via a
// setInterval (see instrumentation.ts). On serverless (Vercel) there is no
// persistent process, so the same logic is driven by an external scheduler
// hitting this endpoint on a cron (see vercel.json).
//
// Auth: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set. We reject anything else so the
// endpoint can't be triggered by the public.
import { runRetentionOnce } from "@/lib/history/retentionWorker";
import { timingSafeEqual } from "node:crypto";

import { logSystem } from "@/lib/logger";

// basic-ftp opens raw sockets — must run on the Node.js runtime, never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Constant-time compare so the header check can't leak the secret byte by
  // byte through response timing.
  const given = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    await runRetentionOnce();
    return Response.json({ ok: true, duration_ms: Date.now() - startedAt });
  } catch (e) {
    void logSystem({
      level: "error",
      category: "cron",
      message: "retention cron failed",
      duration_ms: Date.now() - startedAt,
      error: e,
    });
    return Response.json({ ok: false, error: "retention failed" }, { status: 500 });
  }
}
