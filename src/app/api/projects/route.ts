// Проекты лендингов и плейблов — для «Моих проектов» в истории.
//
// GET                 — список: id, вид, сцена, имя, даты, в корзине ли. Без
//                       самих черновиков: в них картинки.
// GET ?id=…           — один проект целиком (data — черновик редактора).
// PUT { project }     — сохранить (вставить или обновить по id); снимает из корзины.
// PATCH { id, name?, deleted? } — переименовать, в корзину / из корзины.
// DELETE ?id=…        — удалить навсегда.
//
// Пока миграция 0018 не применена, всё отвечает 503 projects_unavailable —
// клиент на это молча живёт как раньше (черновики в браузере).
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/jobs/server";
import { PROJECT_KINDS, type ProjectKind } from "@/lib/projects";

export const runtime = "nodejs";

/** Фон, персонажи, обложки и объекты в base64 — с запасом. */
const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SCENE = /^[a-z0-9]{0,24}$/;

const unavailable = () => Response.json({ error: "projects_unavailable" }, { status: 503 });

async function auth(request: Request, bucket: string, limit: number) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return { error: authErrorResponse(err) };
  }
  const rl = await rateLimitResponse(bucket, user.id, limit, 60_000);
  if (rl) return { error: rl };
  return { user };
}

export async function GET(request: Request) {
  const a = await auth(request, "projects-read", 120);
  if ("error" in a) return a.error;
  const supa = getAdminClient();
  const id = new URL(request.url).searchParams.get("id");

  if (id !== null) {
    if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
    const { data, error } = await supa
      .from("creative_projects")
      .select("id,kind,scene,name,data")
      .eq("user_id", a.user.id)
      .eq("id", id)
      .maybeSingle();
    if (isMissingTable(error)) return unavailable();
    if (error) return Response.json({ error: "Не удалось загрузить проект" }, { status: 500 });
    if (!data) return Response.json({ error: "Проект не найден" }, { status: 404 });
    return Response.json({ project: data });
  }

  const { data, error } = await supa
    .from("creative_projects")
    .select("id,kind,scene,name,created_at,updated_at,deleted_at")
    .eq("user_id", a.user.id)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось загрузить проекты" }, { status: 500 });
  return Response.json({
    projects: (data ?? []).map((r) => {
      const row = r as { id: string; kind: string; scene: string; name: string; created_at: string; updated_at: string; deleted_at: string | null };
      return { id: row.id, kind: row.kind, scene: row.scene, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, deleted: !!row.deleted_at };
    }),
  });
}

export async function PUT(request: Request) {
  const a = await auth(request, "projects-write", 60);
  if ("error" in a) return a.error;
  const big = rejectLargeBody(request, MAX_PROJECT_BYTES + 64 * 1024);
  if (big) return big;

  let p: Record<string, unknown>;
  try {
    const body = (await request.json()) as { project?: unknown };
    if (!body.project || typeof body.project !== "object" || Array.isArray(body.project)) {
      return Response.json({ error: "project is required" }, { status: 400 });
    }
    p = body.project as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof p.id === "string" ? p.id : "";
  if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
  const kind = p.kind as ProjectKind;
  if (!PROJECT_KINDS.includes(kind)) return Response.json({ error: "Некорректный вид проекта" }, { status: 400 });
  const scene = typeof p.scene === "string" ? p.scene : "";
  if (!SCENE.test(scene)) return Response.json({ error: "Некорректная сцена" }, { status: 400 });
  if (!p.data || typeof p.data !== "object" || Array.isArray(p.data)) return Response.json({ error: "data is required" }, { status: 400 });
  // content-length мог не прийти (chunked) — меряем то, что разобрали.
  if (JSON.stringify(p.data).length > MAX_PROJECT_BYTES) return Response.json({ error: "Проект слишком большой" }, { status: 413 });

  const now = new Date().toISOString();
  const { error } = await getAdminClient()
    .from("creative_projects")
    .upsert(
      {
        user_id: a.user.id,
        id,
        kind,
        scene,
        name: typeof p.name === "string" ? p.name.slice(0, 200) : "",
        data: p.data,
        updated_at: now,
        deleted_at: null,
      },
      { onConflict: "user_id,id" },
    );
  if (isMissingTable(error)) return unavailable();
  // 23514 — ограничение kind ещё без «campaign» (миграция 0019 не применена): молчим, как без таблицы.
  if ((error as { code?: string } | null)?.code === "23514") return unavailable();
  if (error) return Response.json({ error: "Не удалось сохранить проект" }, { status: 500 });
  return Response.json({ ok: true, updatedAt: now });
}

export async function PATCH(request: Request) {
  const a = await auth(request, "projects-write", 60);
  if ("error" in a) return a.error;
  let body: { id?: unknown; name?: unknown; deleted?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
  const upd: Record<string, unknown> = {};
  if (typeof body.name === "string") upd.name = body.name.slice(0, 200);
  if (typeof body.deleted === "boolean") upd.deleted_at = body.deleted ? new Date().toISOString() : null;
  if (!Object.keys(upd).length) return Response.json({ error: "Нечего менять" }, { status: 400 });
  const { error } = await getAdminClient().from("creative_projects").update(upd).eq("user_id", a.user.id).eq("id", id);
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось изменить проект" }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const a = await auth(request, "projects-write", 60);
  if ("error" in a) return a.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
  const { error } = await getAdminClient().from("creative_projects").delete().eq("user_id", a.user.id).eq("id", id);
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось удалить проект" }, { status: 500 });
  return Response.json({ ok: true });
}
