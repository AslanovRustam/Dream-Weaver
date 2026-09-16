-- 0010_billing_refund_ratelimit_roles.sql
--
-- Phase 1 of the security remediation (see plan 2026-09-16). Four independent
-- pieces, all idempotent:
--   1. refund_credits()      — counterpart of spend_credits for the flat-price
--                              generators (charge → provider → refund on fail).
--   2. rate_limits table +   — shared fixed-window counter so rate limiting
--      rate_limit_hit()        survives restarts and multiple Node instances
--                              (the in-process Map in request-guard.ts alone
--                              resets on every deploy).
--   3. admin_set_user_role() — /api/admin/role has called this RPC since RBAC
--                              landed but it never existed, so the only way a
--                              role ever changed was the self-update hole
--                              closed by 0009 (or manual SQL).
--   4. revoke insert/delete  — ledger tables have no insert/delete RLS
--                              policies (writes go through SECURITY DEFINER
--                              RPCs and service_role); drop the default table
--                              grants too so a future permissive policy can't
--                              quietly re-open them.
--
-- Apply after 0009.

-- ---------------------------------------------------------------------
-- 1. refund_credits — service_role only, positive amount, audited
-- ---------------------------------------------------------------------
create or replace function public.refund_credits(
  p_user   uuid,
  p_amount numeric,
  p_meta   jsonb default '{}'::jsonb
) returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_balance numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.profiles
     set credits_balance = credits_balance + p_amount
   where id = p_user
   returning credits_balance into v_new_balance;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.credit_transactions (user_id, delta, reason, meta)
  values (p_user, p_amount, 'refund', coalesce(p_meta, '{}'::jsonb));

  return v_new_balance;
end;
$$;

revoke all on function public.refund_credits(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, numeric, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 2. Shared rate limiter
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null,
  primary key (bucket, key)
);
-- RLS on with NO policies: only service_role (which bypasses RLS) touches it.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(
  p_bucket    text,
  p_key       text,
  p_limit     integer,
  p_window_ms integer
) returns table (allowed boolean, retry_after_sec integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_win interval    := make_interval(secs => p_window_ms / 1000.0);
  r     public.rate_limits;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;

  insert into public.rate_limits as rl (bucket, key, window_start, count)
  values (p_bucket, p_key, v_now, 1)
  on conflict (bucket, key) do update
    set count        = case when rl.window_start + v_win <= v_now then 1 else rl.count + 1 end,
        window_start = case when rl.window_start + v_win <= v_now then v_now else rl.window_start end
  returning * into r;

  allowed := r.count <= p_limit;
  retry_after_sec := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (r.window_start + v_win - v_now))))::integer
  end;
  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

-- Housekeeping helper for the retention cron: windows older than a day are
-- dead weight (every window in use is at most minutes long).
create or replace function public.rate_limits_prune()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare v_n integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.rate_limits_prune() from public, anon, authenticated;
grant execute on function public.rate_limits_prune() to service_role;

-- ---------------------------------------------------------------------
-- 3. admin_set_user_role — super-admin (by JWT email) only
-- ---------------------------------------------------------------------
-- Role/tier lists mirror ROLES / TIERS in src/lib/rbac.ts — keep in sync.
create or replace function public.admin_set_user_role(
  p_target_user uuid,
  p_role        text default null,
  p_tier        text default null
) returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_row   public.profiles;
  v_email text;
begin
  if not public.is_caller_super_admin() then
    raise exception 'forbidden: super admin only' using errcode = '42501';
  end if;
  if p_role is not null
     and p_role not in ('user', 'tester', 'support', 'moderator', 'admin', 'superadmin') then
    raise exception 'invalid_role';
  end if;
  if p_tier is not null and p_tier not in ('regular', 'pro', 'corporate') then
    raise exception 'invalid_tier';
  end if;
  if p_target_user = auth.uid() and p_role is not null then
    raise exception 'cannot_change_own_role';
  end if;

  select email into v_email from public.profiles where id = p_target_user;
  if v_email is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  -- superadmin stays bound to the email allow-list; the column alone never
  -- grants it (see getUserRole in auth-server.ts and migration 0009).
  if p_role = 'superadmin' and not public.is_super_admin(v_email) then
    raise exception 'cannot_grant_superadmin_outside_allowlist';
  end if;

  update public.profiles
     set role = coalesce(p_role, role),
         tier = coalesce(p_tier, tier)
   where id = p_target_user
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Ledger tables: no direct insert/delete from client roles
-- ---------------------------------------------------------------------
revoke insert, delete on public.generations         from anon, authenticated;
revoke insert, delete on public.generation_cards    from anon, authenticated;
revoke insert, delete on public.credit_transactions from anon, authenticated;
