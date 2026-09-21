-- First-party product analytics.
--
-- Why a table and not a third-party script: the `generations` ledger already
-- answers "what was generated and what did it cost", but it says nothing about
-- the part before a generation — which templates get opened and abandoned,
-- where guests drop off, whether the tour is finished. That needs client
-- events. Keeping them here means no third party, no data leaving the project,
-- and the events are joinable with the ledger in plain SQL.
--
-- What is deliberately NOT stored: IP address, user-agent string, full URLs
-- with query strings, and anything free-text from the user. The client sends a
-- name from a fixed allowlist plus a small bag of scalar props.

create table if not exists public.analytics_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  -- Event name from the allowlist in src/lib/analyticsEvents.ts.
  name text not null,
  -- Set when the request carried a valid session; null for guests.
  user_id uuid references auth.users (id) on delete set null,
  -- Random id kept in the browser, ONLY while analytics consent is on.
  anon_id text,
  -- Random id kept for one tab session, for funnel stitching.
  session_id text,
  -- Pathname only, never the query string.
  path text,
  -- Host of the referrer, not the full URL.
  referrer_host text,
  props jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at desc);
create index if not exists analytics_events_user_idx
  on public.analytics_events (user_id, created_at desc);

-- No client touches this table: writes go through /api/analytics (service role,
-- validated and rate-limited), reads through /api/admin/analytics.
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;
revoke all on sequence public.analytics_events_id_seq from anon, authenticated;

-- Retention. Called by the retention cron; keeps half a year by default.
create or replace function public.analytics_prune(p_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.analytics_events
  where created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.analytics_prune(integer) from public, anon, authenticated;
grant execute on function public.analytics_prune(integer) to service_role;
