// POST /api/auth/change-password
// Authenticated password change.
// Body: { current_password?: string, new_password: string }
//
// The current password is REQUIRED for accounts that have an email/password
// identity — a bearer token alone must not be enough to set a new password,
// otherwise any stolen/XSS'd session converts into permanent account
// takeover. It is verified with a throw-away anon-key client via
// signInWithPassword (no session is persisted). Google-only accounts have no
// password yet, so for them this simply attaches one.
import { createClient } from "@supabase/supabase-js";

import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";

function isStrongEnough(pw: string): string | null {
  if (typeof pw !== "string") return "new_password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 128) return "Password too long";
  return null;
}

async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY missing");
  const probe = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (data?.session) {
    // Don't leave a second live session lying around for this user.
    await probe.auth.signOut({ scope: "local" }).catch(() => {});
  }
  return !error && !!data?.user;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    // Brute-forcing the current password through this endpoint must be slow.
    const rl = await rateLimitResponse("change-password", user.id, 5, 15 * 60_000);
    if (rl) return rl;

    let body: { current_password?: string; new_password?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const pw = body.new_password ?? "";
    const reason = isStrongEnough(pw);
    if (reason) return Response.json({ error: reason }, { status: 400 });

    const admin = getAdminClient();

    // Does this account already have a password? (Google-only users don't.)
    const { data: full, error: lookupErr } = await admin.auth.admin.getUserById(user.id);
    if (lookupErr || !full?.user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const hasPasswordIdentity = (full.user.identities ?? []).some((i) => i.provider === "email");

    if (hasPasswordIdentity) {
      const current = body.current_password ?? "";
      if (!current) {
        return Response.json({ error: "current_password is required" }, { status: 400 });
      }
      const ok = await verifyCurrentPassword(user.email, current);
      if (!ok) return Response.json({ error: "wrong_current_password" }, { status: 403 });
      if (current === pw) {
        return Response.json({ error: "New password must differ from the current one" }, { status: 400 });
      }
    }

    const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw });
    if (error) {
      console.error("change-password failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
