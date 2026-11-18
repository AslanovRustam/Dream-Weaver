// ТЗ карточки — с чего сделан баннер в простом режиме: текст ТЗ, как его понял
// движок (суть, оффер, язык, требования, допущения) и итог проверки по ТЗ.
// Видно в Истории рядом с результатом; по нему можно сделать ещё раз.
//
// POST /api/history/$cardId/tz
//   Body: { text: string, job: TzJob, check?: {results, faceCovered} }
//   Картинки ТЗ не храним (только текст и решения) — form_snapshot.tz.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type SavedTz = {
  text: string;
  job: {
    summary: string;
    offer: string;
    language: string;
    geo: string;
    brand: string;
    product: string;
    requirements: { id: string; text: string; kind: string; exact?: string }[];
    assumptions: string[];
    cannot: string[];
  };
  check?: { results: { id: string; ok: boolean; note: string }[]; faceCovered: boolean };
  at: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown, max: number, n: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : [];

export async function POST(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await ctx.params;
  try {
    const big = rejectLargeBody(request, 512 * 1024);
    if (big) return big;
    const user = await requireUser(request);
    const rl = await rateLimitResponse("card-tz", user.id, 30, 60_000);
    if (rl) return rl;
    const { data: card } = await getUserClient(user.accessToken)
      .from("generation_cards")
      .select("id, form_snapshot")
      .eq("id", cardId)
      .maybeSingle();
    if (!card) return Response.json({ error: "Card not found" }, { status: 404 });
    let body: { text?: unknown; job?: Record<string, unknown>; check?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const j = body.job ?? {};
    const brand = (j.brand ?? {}) as Record<string, unknown>;
    const reqs = Array.isArray(j.requirements) ? (j.requirements as Record<string, unknown>[]) : [];
    const chk = body.check;
    const tz: SavedTz = {
      text: str(body.text, 8000),
      job: {
        summary: str(j.summary, 600),
        offer: str(j.offer, 200),
        language: str(j.language, 8),
        geo: str(j.geo, 80),
        brand: str(brand.name, 60),
        product: str(j.product, 20),
        requirements: reqs.slice(0, 30).map((r) => ({ id: str(r.id, 8), text: str(r.text, 240), kind: str(r.kind, 12), exact: str(r.exact, 160) || undefined })),
        assumptions: strs(j.assumptions, 240, 10),
        cannot: strs(j.cannot, 240, 10),
      },
      check:
        chk && Array.isArray(chk.results)
          ? {
              results: (chk.results as Record<string, unknown>[]).slice(0, 30).map((r) => ({ id: str(r.id, 8), ok: r.ok === true, note: str(r.note, 200) })),
              faceCovered: chk.faceCovered === true,
            }
          : undefined,
      at: new Date().toISOString(),
    };
    const snap = ((card as { form_snapshot: Record<string, unknown> | null }).form_snapshot ?? {}) as Record<string, unknown>;
    // Владение проверено выше (RLS); пишем админ-клиентом — в RLS нет update form_snapshot.
    const { error } = await getAdminClient()
      .from("generation_cards")
      .update({ form_snapshot: { ...snap, tz } })
      .eq("id", cardId)
      .eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
