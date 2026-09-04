// GET /api/admin/usage?days=<n>
// Super-admin only. Aggregates the `generations` ledger into per-user spend
// ($ and tokens) over the last N days, broken down by feature. This is the
// "OpenRouter spend per user, in money" report (Option B — own ledger).
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = {
  user_id: string;
  cost_usd: number | string | null;
  total_tokens: number | null;
  model: string | null;
  meta: { feature?: string } | null;
};

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("generations")
      .select("user_id,cost_usd,total_tokens,model,meta,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) {
      console.error("admin/usage select failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Row[];
    type Agg = {
      userId: string;
      costUsd: number;
      tokens: number;
      calls: number;
      byFeature: Record<string, number>;
    };
    const byUser = new Map<string, Agg>();
    let totalCost = 0;
    for (const r of rows) {
      const cost = Number(r.cost_usd ?? 0) || 0;
      const tokens = Number(r.total_tokens ?? 0) || 0;
      const feature = r.meta?.feature || r.model || "other";
      totalCost += cost;
      let a = byUser.get(r.user_id);
      if (!a) {
        a = { userId: r.user_id, costUsd: 0, tokens: 0, calls: 0, byFeature: {} };
        byUser.set(r.user_id, a);
      }
      a.costUsd += cost;
      a.tokens += tokens;
      a.calls += 1;
      a.byFeature[feature] = (a.byFeature[feature] ?? 0) + cost;
    }

    // Attach emails.
    const ids = [...byUser.keys()];
    const emails = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("id,email").in("id", ids);
      for (const p of (profs ?? []) as { id: string; email: string | null }[]) {
        emails.set(p.id, p.email ?? "");
      }
    }

    const users = [...byUser.values()]
      .map((a) => ({
        userId: a.userId,
        email: emails.get(a.userId) || "",
        costUsd: Number(a.costUsd.toFixed(6)),
        tokens: a.tokens,
        calls: a.calls,
        byFeature: Object.fromEntries(
          Object.entries(a.byFeature).map(([k, v]) => [k, Number(v.toFixed(6))]),
        ),
      }))
      .sort((x, y) => y.costUsd - x.costUsd);

    return Response.json({
      days,
      totalCostUsd: Number(totalCost.toFixed(6)),
      userCount: users.length,
      users,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
