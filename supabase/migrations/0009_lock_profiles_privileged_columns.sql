-- 0009_lock_profiles_privileged_columns.sql
--
-- CRITICAL fix: privilege escalation via self-update of profiles.role.
--
-- `profiles_update_self` (0001) pinned only credits_balance in its WITH CHECK.
-- 0006 later added `role` and `tier` to profiles WITHOUT tightening that
-- policy, and Supabase's default privileges give `authenticated` a table-wide
-- UPDATE grant — so any signed-in user could
--   PATCH /rest/v1/profiles?id=eq.<own uid>  {"role":"superadmin"}
-- with the public anon key + their own JWT, after which getUserRole()
-- (src/lib/auth-server.ts) trusted that value and requireCapability() let
-- them into /api/admin/users and /api/admin/history.
--
-- Fix, defence in depth:
--   1. Drop the table-wide UPDATE grant; re-grant it column-scoped to the
--      fields a user legitimately edits. No client writes profiles through
--      PostgREST today (/api/me PATCH goes through service_role), so this
--      changes nothing for the app.
--   2. Re-create the self-update policy pinning every privileged column, so
--      even a future widened grant can't be abused.
--   3. Reset any role that was self-granted. The email allow-list in
--      is_super_admin() stays the single source of truth for superadmin.
--
-- Apply after 0007 and 0008 (both still pending as of 2026-09-16).

revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name, nickname, phone, contact)
  on public.profiles to authenticated;

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and credits_balance is not distinct from
        (select p.credits_balance from public.profiles p where p.id = auth.uid())
    and role is not distinct from
        (select p.role from public.profiles p where p.id = auth.uid())
    and tier is not distinct from
        (select p.tier from public.profiles p where p.id = auth.uid())
  );

update public.profiles
   set role = 'user'
 where role = 'superadmin'
   and lower(email) not in ('kela@clickable.agency', 'aslanov@clickable.agency');
