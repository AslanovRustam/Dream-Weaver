// /api/admin/templates — CRUD for the editable template catalogue.
//
// Staff-only (capability "templates.edit"). All calls run as the authenticated
// user, not service_role, so the RLS policies in migration 0005 are the real
// gate — this route only validates input and shapes the response.
//
//   GET    → every template, drafts included (staff view)
//   POST   → create   { section, name, category?, description?, preview_url?, meta?, visible?, sort_order? }
//   PATCH  → update   { id, ...same fields }
//   DELETE → remove   ?id=<uuid>
import { authErrorResponse, getUserClient, requireCapability } from "@/lib/auth-server";

const SECTIONS = ["banner", "landing", "playable", "video"] as const;
type Section = (typeof SECTIONS)[number];

type Body = {
  id?: string;
  section?: string;
  category?: string;
  name?: string;
  description?: string;
  preview_url?: string | null;
  meta?: Record<string, unknown>;
  visible?: boolean;
  sort_order?: number;
};

const isSection = (v: unknown): v is Section =>
  typeof v === "string" && (SECTIONS as readonly string[]).includes(v);

/** Shared field validation/normalisation. `partial` skips required checks. */
function buildPatch(body: Body, partial: boolean): Record<string, unknown> | string {
  const patch: Record<string, unknown> = {};

  if (body.section !== undefined || !partial) {
    if (!isSection(body.section)) return `section must be one of: ${SECTIONS.join(", ")}`;
    patch.section = body.section;
  }
  if (body.name !== undefined || !partial) {
    const name = (body.name || "").trim();
    if (!name) return "name required";
    if (name.length > 120) return "name too long (max 120)";
    patch.name = name;
  }
  if (body.category !== undefined) patch.category = String(body.category).trim().slice(0, 60);
  if (body.description !== undefined) {
    patch.description = String(body.description).trim().slice(0, 500);
  }
  if (body.preview_url !== undefined) {
    const url = body.preview_url === null ? null : String(body.preview_url).trim();
    if (url && url.length > 2000) return "preview_url too long";
    patch.preview_url = url || null;
  }
  if (body.meta !== undefined) {
    if (body.meta === null || typeof body.meta !== "object" || Array.isArray(body.meta)) {
      return "meta must be an object";
    }
    patch.meta = body.meta;
  }
  if (body.visible !== undefined) patch.visible = Boolean(body.visible);
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isFinite(n)) return "sort_order must be a number";
    patch.sort_order = Math.trunc(n);
  }
  return patch;
}

async function readBody(request: Request): Promise<Body | null> {
  try {
    return (await request.json()) as Body;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const caller = await requireCapability(request, "templates.edit");
    const db = getUserClient(caller.accessToken);
    const { data, error } = await db
      .from("templates")
      .select("*")
      .order("section", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("templates select failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ templates: data ?? [] });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const caller = await requireCapability(request, "templates.edit");
    const body = await readBody(request);
    if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

    const patch = buildPatch(body, false);
    if (typeof patch === "string") return Response.json({ error: patch }, { status: 400 });

    const db = getUserClient(caller.accessToken);
    const { data, error } = await db.from("templates").insert(patch).select().single();
    if (error) {
      console.error("templates insert failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ template: data }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const caller = await requireCapability(request, "templates.edit");
    const body = await readBody(request);
    if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

    const id = (body.id || "").trim();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const patch = buildPatch(body, true);
    if (typeof patch === "string") return Response.json({ error: patch }, { status: 400 });
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }

    const db = getUserClient(caller.accessToken);
    const { data, error } = await db
      .from("templates")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error("templates update failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) return Response.json({ error: "template not found" }, { status: 404 });
    return Response.json({ template: data });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const caller = await requireCapability(request, "templates.edit");
    const id = (new URL(request.url).searchParams.get("id") || "").trim();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const db = getUserClient(caller.accessToken);
    const { error } = await db.from("templates").delete().eq("id", id);
    if (error) {
      console.error("templates delete failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
