// GET  /api/notifications        → { items: Notification[], unread: number }
// POST /api/notifications  {all}  → mark all read
// POST /api/notifications  {ids}  → mark the given ids read
//
// Per-user real notifications (see 0007_notifications.sql + src/lib/notifications.ts).
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const LIST_LIMIT = 30;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const admin = getAdminClient();

    const [{ data, error }, { count }] = await Promise.all([
      admin
        .from("notifications")
        .select("id,type,title,body,meta,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
      admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);
    if (error) {
      console.error("notifications select failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ items: data ?? [], unread: count ?? 0 });
  } catch (err) {
    return authErrorResponse(err);
  }
}

type PostBody = { all?: boolean; ids?: string[] };

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const admin = getAdminClient();
    const nowIso = new Date().toISOString();

    let q = admin
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (!body.all) {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, 100) : [];
      if (ids.length === 0) return Response.json({ ok: true, updated: 0 });
      q = q.in("id", ids);
    }
    const { error } = await q;
    if (error) {
      console.error("notifications mark-read failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
