-- =====================================================================
-- Dream Weaver Studio — initial schema
-- Users, profiles, credit balances, pricing coefficients, audit logs.
-- Auth is provided by Supabase Auth (auth.users). This file only adds
-- application tables, RLS, helper functions and triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Hard-coded super-admin emails. Keep this function as the single
-- source of truth; any admin policy and any admin RPC consults it.
create or replace function public.is_super_admin(p_email text)
returns boolean
language sql
stable
as $$
  select lower(coalesce(p_email, '')) in (
    'kela@clickable.agency',
    'skobelev@clickable.agency'
  );
$$;

-- Convenience: check the currently-authenticated caller.
create or replace function public.is_caller_super_admin()
returns boolean
language sql
stable
as $$
  select public.is_super_admin((auth.jwt() ->> 'email'));
$$;

-- updated_at auto-touch
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  first_name      text not null default '',
  last_name       text not null default '',
  nickname        text not null default '',
  phone           text not null default '',
  contact         text not null default '',          -- telegram / extra contact channel
  credits_balance numeric(20,4) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Auto-create a profile row for every new auth.users row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, nickname)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name',
             new.raw_user_meta_data ->> 'given_name',
             ''),
    coalesce(new.raw_user_meta_data ->> 'last_name',
             new.raw_user_meta_data ->> 'family_name',
             ''),
    coalesce(new.raw_user_meta_data ->> 'nickname', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- pricing_coefficients
-- Editable from the admin panel. credits = tokens * coefficient
-- (the small default 0.001 keeps balances in human-sized integers).
-- ---------------------------------------------------------------------
create table if not exists public.pricing_coefficients (
  id          bigserial primary key,
  model       text not null,        -- 'gpt-image-2' | 'gemini-nano' | ...
  quality     text not null,        -- 'low' | 'medium' | 'high'
  coefficient numeric(20,8) not null default 0.001,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  unique(model, quality)
);

drop trigger if exists pricing_coefficients_updated_at on public.pricing_coefficients;
create trigger pricing_coefficients_updated_at
  before update on public.pricing_coefficients
  for each row execute function public.tg_set_updated_at();

-- Seed defaults so generate-image has something to multiply by even
-- before an admin touches the panel.
insert into public.pricing_coefficients (model, quality, coefficient) values
  ('gpt-image-2',  'low',    0.001),
  ('gpt-image-2',  'medium', 0.001),
  ('gpt-image-2',  'high',   0.001),
  ('gemini-nano',  'low',    0.001),
  ('gemini-nano',  'medium', 0.001),
  ('gemini-nano',  'high',   0.001)
on conflict (model, quality) do nothing;

-- ---------------------------------------------------------------------
-- credit_transactions — audit log of every balance change
-- ---------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      numeric(20,4) not null,        -- positive = grant, negative = spend
  reason     text not null,                  -- 'admin_grant' | 'generation' | 'admin_adjust' | 'refund'
  meta       jsonb not null default '{}'::jsonb,
  admin_id   uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_idx
  on public.credit_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- generations — per-call usage log (input/output tokens, model, cost)
-- ---------------------------------------------------------------------
create table if not exists public.generations (
  id                   bigserial primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  model                text not null,
  quality              text not null,
  tokens_input_text    integer not null default 0,
  tokens_input_image   integer not null default 0,
  tokens_output        integer not null default 0,
  total_tokens         integer not null default 0,
  cost_usd             numeric(20,6) not null default 0,
  cost_credits         numeric(20,4) not null default 0,
  meta                 jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists generations_user_idx
  on public.generations (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RPC: admin grants/adjusts credits (callable by super admin only)
-- Atomic: updates profile balance + writes audit row.
-- ---------------------------------------------------------------------
create or replace function public.admin_grant_credits(
  p_target_user uuid,
  p_delta       numeric,
  p_reason      text default 'admin_grant',
  p_meta        jsonb  default '{}'::jsonb
) returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_balance numeric;
begin
  if not public.is_caller_super_admin() then
    raise exception 'forbidden: super admin only' using errcode = '42501';
  end if;
  if p_delta = 0 then
    raise exception 'delta must be non-zero';
  end if;

  update public.profiles
     set credits_balance = credits_balance + p_delta
   where id = p_target_user
   returning credits_balance into v_new_balance;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.credit_transactions (user_id, delta, reason, meta, admin_id)
   values (p_target_user, p_delta, coalesce(p_reason, 'admin_grant'),
           coalesce(p_meta, '{}'::jsonb), auth.uid());

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: spend credits from the server (called by generate-image with
-- service_role). Atomic, never lets the balance go below zero.
-- ---------------------------------------------------------------------
create or replace function public.spend_credits(
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
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;
  if p_amount = 0 then
    select credits_balance into v_new_balance from public.profiles where id = p_user;
    return v_new_balance;
  end if;

  update public.profiles
     set credits_balance = credits_balance - p_amount
   where id = p_user and credits_balance >= p_amount
   returning credits_balance into v_new_balance;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (user_id, delta, reason, meta)
   values (p_user, -p_amount, 'generation', coalesce(p_meta, '{}'::jsonb));

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.pricing_coefficients  enable row level security;
alter table public.credit_transactions   enable row level security;
alter table public.generations           enable row level security;

-- profiles: user sees and updates own row; super admin sees and updates all.
drop policy if exists profiles_select_self  on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_self  on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_self  on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and credits_balance = (select credits_balance from public.profiles where id = auth.uid()));
create policy profiles_select_admin on public.profiles
  for select using (public.is_caller_super_admin());
create policy profiles_update_admin on public.profiles
  for update using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());

-- pricing: any authenticated user can read (frontend may want to show
-- "this generation will cost X"); only super admin writes.
drop policy if exists pricing_select_auth   on public.pricing_coefficients;
drop policy if exists pricing_modify_admin  on public.pricing_coefficients;

create policy pricing_select_auth on public.pricing_coefficients
  for select using (auth.role() = 'authenticated');
create policy pricing_modify_admin on public.pricing_coefficients
  for all using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());

-- credit_transactions: user reads own; super admin reads all.
-- Writes happen only via SECURITY DEFINER RPCs (no INSERT policy on purpose).
drop policy if exists ct_select_self  on public.credit_transactions;
drop policy if exists ct_select_admin on public.credit_transactions;

create policy ct_select_self  on public.credit_transactions
  for select using (auth.uid() = user_id);
create policy ct_select_admin on public.credit_transactions
  for select using (public.is_caller_super_admin());

-- generations: user reads own; super admin reads all.
drop policy if exists gen_select_self  on public.generations;
drop policy if exists gen_select_admin on public.generations;

create policy gen_select_self  on public.generations
  for select using (auth.uid() = user_id);
create policy gen_select_admin on public.generations
  for select using (public.is_caller_super_admin());

-- ---------------------------------------------------------------------
-- Grants for the anon/authenticated/service_role API roles
-- (Supabase grants the basics by default; we just make intent explicit.)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.pricing_coefficients to authenticated;
grant select on public.profiles              to authenticated;
grant select on public.credit_transactions   to authenticated;
grant select on public.generations           to authenticated;

grant execute on function public.admin_grant_credits(uuid, numeric, text, jsonb) to authenticated;
grant execute on function public.spend_credits(uuid, numeric, jsonb)             to service_role;
grant execute on function public.is_super_admin(text)                            to authenticated, anon;
grant execute on function public.is_caller_super_admin()                         to authenticated;
