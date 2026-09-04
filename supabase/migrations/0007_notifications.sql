-- 0007_notifications.sql
--
-- Real in-app notifications. Replaces the hard-coded NOTIF_META mock in
-- AppHeader with per-user rows written by the server on real events:
--   • credit_grant   — admin granted credits (admin_grant_credits, positive delta)
--   • low_balance    — balance dropped below the low-credit threshold after a spend
--   • creative_ready — a master banner/landing was generated (history card created)
--   • system         — product announcements, broadcast by a super-admin
--
-- Rows are always per-user (announcements are fanned out one row per user) so
-- read state is a simple read_at column. Inserts happen via service_role from
-- the server; users can read and mark-read their own rows.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,                       -- credit_grant | low_balance | creative_ready | system
  title       text not null,
  body        text not null default '',
  meta        jsonb not null default '{}'::jsonb,  -- { amount, card_id, preset_id, href, ... }
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;

-- User reads only their own; super-admin reads all (for support/debug).
drop policy if exists notif_select_self  on public.notifications;
create policy notif_select_self on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notif_select_admin on public.notifications;
create policy notif_select_admin on public.notifications
  for select using (public.is_caller_super_admin());

-- User may mark their own notifications read (read_at only, enforced by grant).
drop policy if exists notif_update_self on public.notifications;
create policy notif_update_self on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- INSERT is service_role only (server writes on events) — no INSERT policy.

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
