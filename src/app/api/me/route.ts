// GET  /api/me   → current profile + credits balance
// PATCH /api/me  → update first_name / last_name / nickname / phone / contact
//
// Auth: requires Authorization: Bearer <supabase access_token>.
// Balance is read-only here; admins change it via /api/admin/credits.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

type ProfilePatch = {
  first_name?: string;
  last_name?: string;
  nickname?: string;
  phone?: string;
  contact?: string;
};

const EDITABLE_FIELDS: ReadonlyArray<keyof ProfilePatch> = [
  "first_name",
  "last_name",
  "nickname",
  "phone",
  "contact",
];

const MAX_LEN: Record<keyof ProfilePatch, number> = {
  first_name: 80,
  last_name: 80,
  nickname: 40,
  phone: 40,
  contact: 200,
};

function sanitize(input: ProfilePatch): Partial<ProfilePatch> {
  const out: Partial<ProfilePatch> = {};
  for (const key of EDITABLE_FIELDS) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, MAX_LEN[key]);
    out[key] = trimmed;
  }
  return out;
}

export async function GET(request: Request) {
        try {
          const user = await requireUser(request);
          const admin = getAdminClient();
          // Use service-role so we always read a fresh row regardless of RLS edge cases.
          const { data, error } = await admin
            .from("profiles")
            .select(
              "id,email,first_name,last_name,nickname,phone,contact,credits_balance,created_at,updated_at",
            )
            .eq("id", user.id)
            .single();
          if (error) {
            console.error("GET /api/me select failed", error);
            return Response.json({ error: "Profile not found" }, { status: 404 });
          }
          return Response.json({
            profile: data,
            is_super_admin: user.isSuperAdmin,
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      }

export async function PATCH(request: Request) {
        try {
          const user = await requireUser(request);
          let body: ProfilePatch;
          try {
            body = (await request.json()) as ProfilePatch;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const patch = sanitize(body || {});
          if (Object.keys(patch).length === 0) {
            return Response.json({ error: "No editable fields provided" }, { status: 400 });
          }

          const admin = getAdminClient();
          const { data, error } = await admin
            .from("profiles")
            .update(patch)
            .eq("id", user.id)
            .select(
              "id,email,first_name,last_name,nickname,phone,contact,credits_balance,created_at,updated_at",
            )
            .single();
          if (error) {
            console.error("PATCH /api/me update failed", error);
            return Response.json({ error: "Update failed" }, { status: 500 });
          }
          return Response.json({ profile: data });
        } catch (err) {
          return authErrorResponse(err);
        }
      }
