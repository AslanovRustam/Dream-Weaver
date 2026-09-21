// POST /api/auth/forgot-password
// Body: { email: string }
//
// Sends a password-reset email via Supabase. To prevent account enumeration,
// the response is identical whether the email exists or not.
//
// Unauthenticated, and it makes the product send mail to an address the caller
// names — so it is rate-limited twice: per address, so one mailbox cannot be
// buried, and per client, so a script cannot walk a list. The link target is
// built here from the request's own host instead of taken from the body: a
// caller-supplied redirect would put the reset token on whatever origin they
// asked for if the Supabase redirect allow-list were ever left open.
//
// Configure the reset email template and SITE_URL / redirect URLs in
// Supabase Dashboard → Auth → URL Configuration before going to prod.
import { createHash } from "node:crypto";

import { clientRateKey, rateLimitResponse, readJsonCapped } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

/** Where the reset link lands: our own origin, as the proxy reports it. */
function resetRedirect(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  try {
    return new URL("/reset-password", `${proto}://${host}`).toString();
  } catch {
    return new URL("/reset-password", request.url).toString();
  }
}

const GENERIC_OK = { ok: true, message: "If the email exists, a reset link has been sent." };

export async function POST(request: Request) {
        const parsed = await readJsonCapped(request, MAX_BODY_BYTES);
        if (!parsed.ok) return parsed.response;
        const body = (parsed.value ?? {}) as { email?: string };
        const email = (body.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) {
          return Response.json({ error: "Valid email required" }, { status: 400 });
        }

        // Keyed by a hash: the limiter's store keeps no addresses of any kind.
        const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);
        const perEmail = await rateLimitResponse("forgot-password:email", emailKey, 5, 15 * 60_000);
        if (perEmail) return perEmail;
        const client = clientRateKey(request);
        const perClient = await rateLimitResponse(
          "forgot-password:client",
          client.key,
          client.identified ? 20 : 200,
          60 * 60_000,
        );
        if (perClient) return perClient;

        try {
          const admin = getAdminClient();
          // We call the public reset endpoint (anon) — the Admin client is
          // fine to use; resetPasswordForEmail does not require service role
          // but works under it too.
          const { error } = await admin.auth.resetPasswordForEmail(email, {
            redirectTo: resetRedirect(request),
          });
          if (error) {
            // Log but do not leak details to the caller.
            console.error("forgot-password resetPasswordForEmail error", error);
          }
        } catch (err) {
          console.error("forgot-password unexpected error", err);
        }
        return Response.json(GENERIC_OK);
      }
