-- Deleting an account must take its analytics events with it.
--
-- 0012 created the reference with "on delete set null", which keeps the rows
-- and only forgets whose they were. That is not enough for an erasure request:
-- the events stay stitched together by anon_id, so the trail survives the
-- account. Cascade instead — the aggregate reports lose a few rows, which is
-- the right trade against holding data somebody asked us to delete.
--
-- Safe to run before or after 0012 has been applied; it only replaces the
-- constraint.

alter table public.analytics_events
  drop constraint if exists analytics_events_user_id_fkey;

alter table public.analytics_events
  add constraint analytics_events_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
