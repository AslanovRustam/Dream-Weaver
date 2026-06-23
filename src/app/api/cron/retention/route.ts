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
import { logSystem } from "@/lib/logger";

// basic-ftp opens raw sockets — must run on the Node.js runtime, never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generous ceiling — a retention pass deletes FTP files for expired cards.
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret isn't configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
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
