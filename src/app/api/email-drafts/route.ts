// Черновики писем в базе.
//
// GET              — список: id, имя, тема, дата. Без самих писем: в них
//                    картинки, и список из двадцати черновиков весил бы мегабайты.
// GET ?id=…        — один черновик целиком.
// PUT { draft }    — сохранить (вставить или обновить по id).
// DELETE ?id=…     — удалить.
//
// Пока миграция 0016 не применена, всё отвечает 503 drafts_unavailable — клиент
// на это остаётся на localStorage, как было.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/jobs/server";

export const runtime = "nodejs";

/** Баннер, его исходник и лого в base64 — с запасом на три картинки. */
const MAX_DRAFT_BYTES = 5 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const unavailable = () =>
  Response.json({ error: "drafts_unavailable" }, { status: 503 });

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
  const a = await auth(request, "email-drafts-read", 120);
  if ("error" in a) return a.error;
  const supa = getAdminClient();
  const id = new URL(request.url).searchParams.get("id");

  if (id !== null) {
    if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
    const { data, error } = await supa
      .from("email_drafts")
      .select("data")
      .eq("user_id", a.user.id)
      .eq("id", id)
      .maybeSingle();
    if (isMissingTable(error)) return unavailable();
    if (error) return Response.json({ error: "Не удалось загрузить черновик" }, { status: 500 });
    if (!data) return Response.json({ error: "Черновик не найден" }, { status: 404 });
    return Response.json({ draft: (data as { data: unknown }).data });
  }

  const { data, error } = await supa
    .from("email_drafts")
    .select("id,name,subject,updated_at")
    .eq("user_id", a.user.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось загрузить черновики" }, { status: 500 });
  return Response.json({
    drafts: (data ?? []).map((r) => {
      const row = r as { id: string; name: string; subject: string; updated_at: string };
      return { id: row.id, name: row.name, subject: row.subject, updatedAt: row.updated_at };
    }),
  });
}

export async function PUT(request: Request) {
  const a = await auth(request, "email-drafts-write", 60);
  if ("error" in a) return a.error;
  const big = rejectLargeBody(request, MAX_DRAFT_BYTES + 64 * 1024);
  if (big) return big;

  let draft: Record<string, unknown>;
  try {
    const body = (await request.json()) as { draft?: unknown };
    if (!body.draft || typeof body.draft !== "object" || Array.isArray(body.draft)) {
      return Response.json({ error: "draft is required" }, { status: 400 });
    }
    draft = body.draft as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof draft.id === "string" ? draft.id : "";
  if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
  // content-length мог не прийти (chunked) — меряем то, что разобрали.
  if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) {
    return Response.json({ error: "Черновик слишком большой" }, { status: 413 });
  }

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const now = new Date().toISOString();
  const { error } = await getAdminClient()
    .from("email_drafts")
    .upsert(
      {
        user_id: a.user.id,
        id,
        name: str(draft.name, 200),
        subject: str(draft.subject, 300),
        data: { ...draft, updatedAt: now },
        updated_at: now,
      },
      { onConflict: "user_id,id" },
    );
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось сохранить черновик" }, { status: 500 });
  return Response.json({ ok: true, updatedAt: now });
}

export async function DELETE(request: Request) {
  const a = await auth(request, "email-drafts-write", 60);
  if ("error" in a) return a.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return Response.json({ error: "Некорректный id" }, { status: 400 });
  const { error } = await getAdminClient()
    .from("email_drafts")
    .delete()
    .eq("user_id", a.user.id)
    .eq("id", id);
  if (isMissingTable(error)) return unavailable();
  if (error) return Response.json({ error: "Не удалось удалить черновик" }, { status: 500 });
  return Response.json({ ok: true });
}
