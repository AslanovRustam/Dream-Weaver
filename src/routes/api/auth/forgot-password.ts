// POST /api/auth/forgot-password
// Body: { email: string, redirect_to?: string }
//
// Sends a password-reset email via Supabase. To prevent account enumeration,
// the response is identical whether the email exists or not.
//
// Configure the reset email template and SITE_URL / redirect URLs in
// Supabase Dashboard → Auth → URL Configuration before going to prod.
import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "../../../lib/supabase/admin";

const GENERIC_OK = { ok: true, message: "If the email exists, a reset link has been sent." };

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; redirect_to?: string };
        try {
          body = (await request.json()) as { email?: string; redirect_to?: string };
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const email = (body.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) {
          return Response.json({ error: "Valid email required" }, { status: 400 });
        }

        try {
          const admin = getAdminClient();
          // We call the public reset endpoint (anon) — the Admin client is
          // fine to use; resetPasswordForEmail does not require service role
          // but works under it too.
          const { error } = await admin.auth.resetPasswordForEmail(email, {
            redirectTo: body.redirect_to,
          });
          if (error) {
            // Log but do not leak details to the caller.
            console.error("forgot-password resetPasswordForEmail error", error);
          }
        } catch (err) {
          console.error("forgot-password unexpected error", err);
        }
        return Response.json(GENERIC_OK);
      },
    },
  },
});
