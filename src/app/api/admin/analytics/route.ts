// GET /api/admin/analytics?days=<n>
// Super-admin only. Aggregates analytics_events into the few numbers worth
// looking at: who came, what they opened, where they stopped. Everything is
// computed here rather than in SQL so the route works on a database where
// migration 0012 has only just been applied and no views exist yet.
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = {
  created_at: string;
  name: string;
  user_id: string | null;
  anon_id: string | null;
  path: string | null;
  referrer_host: string | null;
  props: Record<string, unknown> | null;
};

const MAX_ROWS = 50000;

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const { data, error } = await getAdminClient()
      .from("analytics_events")
      .select("created_at,name,user_id,anon_id,path,referrer_host,props")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      // PostgREST says 42P01 when the table is not there yet. That is not a
      // failure worth a 500 — it is "apply migration 0012".
      const missing = /relation .* does not exist/i.test(error.message) || error.code === "42P01";
      if (missing) return Response.json({ days, tableMissing: true });
      console.error("admin/analytics select failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Row[];

    const visitors = new Set<string>();
    const users = new Set<string>();
    const byName = new Map<string, number>();
    const byPath = new Map<string, number>();
    const byReferrer = new Map<string, number>();
    const byDay = new Map<string, { views: number; visitors: Set<string> }>();
    const funnelIds = {
      visited: new Set<string>(),
      template: new Set<string>(),
      generate: new Set<string>(),
      exported: new Set<string>(),
    };
    const tour = { started: 0, completed: 0, abandoned: 0 };

    for (const r of rows) {
      const who = r.anon_id || r.user_id || "";
      if (who) visitors.add(who);
      if (r.user_id) users.add(r.user_id);
      byName.set(r.name, (byName.get(r.name) ?? 0) + 1);

      if (r.name === "page_view") {
        const day = r.created_at.slice(0, 10);
        let d = byDay.get(day);
        if (!d) {
          d = { views: 0, visitors: new Set() };
          byDay.set(day, d);
        }
        d.views += 1;
        if (who) d.visitors.add(who);
        if (r.path) byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
        if (r.referrer_host) {
          byReferrer.set(r.referrer_host, (byReferrer.get(r.referrer_host) ?? 0) + 1);
        }
        if (who) funnelIds.visited.add(who);
      }
      if (who && (r.name === "template_selected" || r.name === "landing_template_selected")) {
        funnelIds.template.add(who);
      }
      if (who && r.name === "generate_clicked") funnelIds.generate.add(who);
      if (who && r.name === "landing_exported") funnelIds.exported.add(who);

      if (r.name === "tour_started") tour.started += 1;
      if (r.name === "tour_completed") tour.completed += 1;
      if (r.name === "tour_abandoned") tour.abandoned += 1;
    }

    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({ key, count }));

    return Response.json({
      days,
      truncated: rows.length >= MAX_ROWS,
      totals: {
        events: rows.length,
        visitors: visitors.size,
        users: users.size,
        pageViews: byName.get("page_view") ?? 0,
      },
      byDay: [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([day, d]) => ({ day, views: d.views, visitors: d.visitors.size })),
      byName: top(byName, 25),
      topPaths: top(byPath, 10),
      topReferrers: top(byReferrer, 10),
      funnel: {
        visited: funnelIds.visited.size,
        template: funnelIds.template.size,
        generate: funnelIds.generate.size,
        exported: funnelIds.exported.size,
      },
      tour,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
