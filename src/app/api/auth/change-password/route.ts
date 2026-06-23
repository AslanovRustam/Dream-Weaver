// POST /api/auth/change-password
// Authenticated password change (user is logged in, knows current password).
// Body: { new_password: string }
//
// We rely on Supabase Admin API to update the password atomically.
// For email/password users this works as-is; for Google-only users it
// simply attaches a password to their account (which is also useful).
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

function isStrongEnough(pw: string): string | null {
  if (typeof pw !== "string") return "new_password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 128) return "Password too long";
  return null;
}

export async function POST(request: Request) {
        try {
          const user = await requireUser(request);
          let body: { new_password?: string };
          try {
            body = (await request.json()) as { new_password?: string };
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const pw = body.new_password ?? "";
          const reason = isStrongEnough(pw);
          if (reason) {
            return Response.json({ error: reason }, { status: 400 });
          }

          const admin = getAdminClient();
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
