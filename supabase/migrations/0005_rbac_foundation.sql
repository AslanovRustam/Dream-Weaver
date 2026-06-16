-- =====================================================================
-- 0005_rbac_foundation.sql
-- RBAC foundation: staff role + billing tier on profiles, role-aware
-- super-admin check, audited role-assignment RPC, column hardening.
--
-- Minimal by design — role/tier are TEXT (not pg enums) so the set can
-- evolve without a painful enum migration every time. The capability→
-- role matrix lives in app code (src/lib/rbac.ts) for now; it can move
-- into a DB table later without changing the API surface.
--
-- Idempotent. Safe to run on a DB that already has 0001–0004 applied.
-- =====================================================================

-- 1. Columns ----------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists tier text not null default 'regular';

-- No CHECK constraint on purpose: the allowed set changes often and is
-- validated in the app (rbac.ts) + the assignment RPC below. A CHECK
-- would force a migration per role/tier change.

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';
create index if not exists profiles_tier_idx on public.profiles (tier) where tier <> 'regular';

-- 2. Seed existing super-admins from the bootstrap email list ----------
update public.profiles
   set role = 'superadmin'
 where lower(email) in (
   'kela@clickable.agency',
   'skobelev@clickable.agency',
   'skobelev.victor.v@gmail.com',
   'aslanov@clickable.agency'
 )
   and role <> 'superadmin';

-- 3. Make the DB super-admin check honor role (bridge SEC-M1) ----------
-- A caller is super-admin if their profile role = 'superadmin' OR their
-- email is in the hardcoded bootstrap list — the email fallback means we
-- can never lock ourselves out before roles are assigned.
create or replace function public.is_super_admin(p_email text)
returns boolean
language sql
stable
as $$
  select lower(coalesce(p_email, '')) in (
    'kela@clickable.agency',
    'skobelev@clickable.agency',
    'skobelev.victor.v@gmail.com',
    'aslanov@clickable.agency'
  )
  or exists (
    select 1 from public.profiles
     where lower(email) = lower(coalesce(p_email, ''))
       and role = 'superadmin'
  );
$$;
-- is_caller_super_admin() is unchanged — it calls
-- is_super_admin(auth.jwt() ->> 'email') and now picks up role too.

-- 4. Harden: users may not change their own role / tier / balance ------
-- /api/me already whitelists editable fields, but the direct PostgREST
-- path must be blocked at the column-grant level too (defense in depth;
-- also closes SEC-L1 for credits_balance).
revoke update (role, tier, credits_balance) on public.profiles from authenticated;

-- 5. RPC: assign role/tier (super-admin only, audited, self-protected) -
create or replace function public.admin_set_user_role(
  p_target_user uuid,
  p_role        text default null,   -- null = leave unchanged
  p_tier        text default null    -- null = leave unchanged
) returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_target public.profiles;
  v_row    public.profiles;
begin
  if not public.is_caller_super_admin() then
    raise exception 'forbidden: super admin only' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_target_user;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  -- Self-protection: a super-admin cannot demote themselves (lock-out
  -- guard) and cannot strip another super-admin's role here (deliberate
  -- super-admin changes are out of this MVP's scope / two-person later).
  if v_target.id = auth.uid() and p_role is not null and p_role <> 'superadmin' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;
  if v_target.role = 'superadmin' and v_target.id <> auth.uid()
     and p_role is not null and p_role <> 'superadmin' then
    raise exception 'cannot_demote_other_superadmin' using errcode = 'P0001';
  end if;

  update public.profiles
     set role = coalesce(p_role, role),
         tier = coalesce(p_tier, tier)
   where id = p_target_user
   returning * into v_row;

  insert into public.audit_logs
    (user_id, target_user_id, action, resource_type, resource_id, details)
  values
    (auth.uid(), p_target_user, 'user.role_changed', 'user', p_target_user::text,
     jsonb_build_object(
       'old_role', v_target.role, 'new_role', v_row.role,
       'old_tier', v_target.tier, 'new_tier', v_row.tier));

  return v_row;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

-- =====================================================================
-- DONE
-- =====================================================================
