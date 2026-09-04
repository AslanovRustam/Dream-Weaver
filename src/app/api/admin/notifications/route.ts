// POST /api/admin/notifications  { title, body? }
// Super-admin only. Broadcasts a "system" announcement to every user by
// fanning out one notification row per user (so read state is per-user).
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = { title?: string; body?: string };

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const title = (body.title || "").trim().slice(0, 200);
    const text = (body.body || "").trim().slice(0, 1000);
    if (!title) return Response.json({ error: "title required" }, { status: 400 });

    const admin = getAdminClient();
    const { data: profs, error: profErr } = await admin.from("profiles").select("id");
    if (profErr) {
      console.error("broadcast: profiles select failed", profErr);
      return Response.json({ error: profErr.message }, { status: 500 });
    }
    const ids = (profs ?? []).map((p) => (p as { id: string }).id).filter(Boolean);
    if (ids.length === 0) return Response.json({ ok: true, recipients: 0 });

    // Insert in batches to keep each statement reasonable.
    let inserted = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const rows = ids.slice(i, i + 500).map((uid) => ({
        user_id: uid,
        type: "system",
        title,
        body: text,
        meta: {},
      }));
      const { error } = await admin.from("notifications").insert(rows);
      if (error) {
        console.error("broadcast insert failed", error);
        return Response.json({ error: error.message, inserted }, { status: 500 });
      }
      inserted += rows.length;
    }
    return Response.json({ ok: true, recipients: inserted });
  } catch (err) {
    return authErrorResponse(err);
  }
}
