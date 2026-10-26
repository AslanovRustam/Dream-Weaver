// GET  /api/history/upload-status
// POST /api/history/upload-status { action: "dismiss" }
//
// Значок в шапке «N файлов не сохранены в облаке»: сколько загрузок на FTP
// упало и сколько ещё идёт — по строкам generations пользователя (RLS).
// GET отдаёт ещё и список упавших по проектам: что именно не сохранилось.
//
// Повторить такую загрузку нельзя: ресайзы режутся в браузере, и картинки
// упавшей загрузки на сервере нет. Поэтому POST dismiss — «Скрыть»: упавшие
// строки получают upload_status = 'dismissed' и больше не считаются.
// Сами строки (и учёт расхода) остаются.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

type FailedRow = { card_id: string | null; created_at: string; generation_cards: { name: string | null } | null };

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const supa = getUserClient(user.accessToken);

    const [failed, pending] = await Promise.all([
      supa
        .from("generations")
        .select("card_id,created_at,generation_cards(name)")
        .eq("upload_status", "failed")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
      supa
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("upload_status", "pending")
        .is("deleted_at", null),
    ]);

    if (failed.error) {
      console.error("upload-status failed query", failed.error);
      return Response.json({ error: failed.error.message }, { status: 500 });
    }
    if (pending.error) {
      console.error("upload-status pending query", pending.error);
      return Response.json({ error: pending.error.message }, { status: 500 });
    }

    // По проектам: «Кибербет новорічний банер — 4 файла, 9 сент.».
    const byCard = new Map<string, { cardId: string | null; name: string; count: number; latest: string }>();
    for (const r of (failed.data ?? []) as unknown as FailedRow[]) {
      const key = r.card_id ?? "—";
      const it = byCard.get(key) ?? { cardId: r.card_id, name: r.generation_cards?.name || "Проект без названия", count: 0, latest: r.created_at };
      it.count++;
      byCard.set(key, it);
    }

    return Response.json({
      failed: failed.data?.length ?? 0,
      pending: pending.count ?? 0,
      items: [...byCard.values()],
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    let body: { action?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (body.action !== "dismiss") return Response.json({ error: "Unknown action" }, { status: 400 });
    // Обновлять generations пользователю RLS не даёт — пишем сервером, строго по его user_id.
    const { error } = await getAdminClient()
      .from("generations")
      .update({ upload_status: "dismissed" })
      .eq("user_id", user.id)
      .eq("upload_status", "failed");
    if (error) return Response.json({ error: "Не удалось скрыть" }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
