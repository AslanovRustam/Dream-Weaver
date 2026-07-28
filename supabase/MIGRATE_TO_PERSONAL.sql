-- =====================================================================
-- Dream Weaver Studio — ПОЛНАЯ СХЕМА ОДНИМ ФАЙЛОМ
-- Для временного переезда на личный Supabase-аккаунт (12.06.2026,
-- пока корпоративный проект hpimiriqpenhnjfferqa на паузе).
-- = миграции 0001 + 0002 + 0003 + 0004 подряд + TEMP-патч админа в конце.
-- Запускать в НОВОМ пустом проекте: Dashboard -> SQL Editor -> Run.
-- Идемпотентен, можно запускать повторно.
-- =====================================================================

-- ======================= [0001_init.sql] =======================
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

-- ======================= [0002_history_feature.sql] =======================
-- =====================================================================
-- Dream Weaver Studio — history feature migration
-- Adds: generation_cards (history), FTP fields on generations,
--       app_settings (admin-editable), audit_logs, system_logs,
--       gpt-4o-mini pricing row, RLS, triggers, RPCs.
-- Safe to run on a database that already has 0001_init.sql applied.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Required extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;       -- gen_random_uuid()
create extension if not exists pg_trgm;        -- trigram search fallback

-- ---------------------------------------------------------------------
-- app_settings — admin-editable runtime configuration
-- Single source of truth for all tunables; the API reads from here.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text not null default '',
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

-- Seed defaults. INSERT-only on conflict so re-running the migration
-- never clobbers admin edits.
insert into public.app_settings (key, value, description) values
  ('retention_cards_months',        '12'::jsonb,
   'Срок жизни карточек истории в месяцах. По истечении удаляются мастер и все ресайзы.'),
  ('retention_logs_days',           '90'::jsonb,
   'Срок жизни system_logs в днях. Cron чистит более старые.'),
  ('retention_audit_days',          '-1'::jsonb,
   'Срок жизни audit_logs в днях. -1 = никогда не чистить (для compliance).'),
  ('card_delete_grace_hours',       '24'::jsonb,
   'Окно для восстановления карточки после удаления юзером (часы).'),
  ('ftp_retry_max_attempts',        '100'::jsonb,
   'Максимум попыток FTP-аплоада перед пометкой failed.'),
  ('ftp_retry_max_hours',           '72'::jsonb,
   'Жёсткий лимит времени на ретраи FTP. По истечении - failed.'),
  ('crash_recovery_interval_minutes', '2'::jsonb,
   'Интервал scheduler-а который добивает pending FTP-аплоады после крашей.'),
  ('resize_format',                 '"png"'::jsonb,
   'Формат для ресайзов: png | jpg90 | jpg95. Master всегда PNG.'),
  ('bulk_zip_max_cards',            '20'::jsonb,
   'Максимум карточек в одном bulk-ZIP скачивании.'),
  ('history_page_size',             '20'::jsonb,
   'Размер страницы (infinite scroll batch).'),
  ('ai_naming_enabled',             'true'::jsonb,
   'Включить ли AI-генерацию названий карточек через gpt-4o-mini.'),
  ('ai_naming_model',               '"gpt-4o-mini"'::jsonb,
   'Модель для генерации названий и vision-pre-pass.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- generation_cards — единица истории: один мастер + N ресайзов
-- ---------------------------------------------------------------------
create table if not exists public.generation_cards (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null default 'Без названия',
  preset_id           text not null default '',
  form_snapshot       jsonb not null default '{}'::jsonb,    -- стрипанная форма (без base64)
  inspired_by_card_id uuid references public.generation_cards(id) on delete set null,
  is_favorite         boolean not null default false,
  created_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '12 months'),
  deleted_at          timestamptz,                            -- soft-delete (grace period)
  hard_delete_after   timestamptz,                            -- now() + grace_hours при soft-delete
  search_tsv          tsvector                                -- maintained by trigger
);

create index if not exists cards_user_activity_idx
  on public.generation_cards (user_id, last_activity_at desc)
  where deleted_at is null;

create index if not exists cards_user_favorites_idx
  on public.generation_cards (user_id, is_favorite, last_activity_at desc)
  where deleted_at is null and is_favorite = true;

create index if not exists cards_expires_idx
  on public.generation_cards (expires_at)
  where deleted_at is null;

create index if not exists cards_hard_delete_idx
  on public.generation_cards (hard_delete_after)
  where deleted_at is not null;

create index if not exists cards_inspired_by_idx
  on public.generation_cards (inspired_by_card_id)
  where inspired_by_card_id is not null;

create index if not exists cards_search_idx
  on public.generation_cards using gin (search_tsv);

-- Tsvector builder — миксует russian + simple словари
-- (russian — стемминг, simple — нечувствителен к языку, fallback)
create or replace function public.cards_build_search_tsv(
  p_name          text,
  p_preset        text,
  p_form_snapshot jsonb
) returns tsvector
language plpgsql
immutable
as $$
declare
  v_texts text;
begin
  -- Вытаскиваем все строковые значения из form_snapshot и склеиваем
  select string_agg(value::text, ' ')
    into v_texts
  from jsonb_each_text(coalesce(p_form_snapshot, '{}'::jsonb))
   where value is not null and length(value) > 0 and length(value) < 1000;

  return
    setweight(to_tsvector('russian', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('simple',  coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(v_texts, '')), 'B') ||
    setweight(to_tsvector('simple',  coalesce(v_texts, '')), 'B') ||
    setweight(to_tsvector('simple',  coalesce(p_preset, '')), 'C');
end;
$$;

create or replace function public.tg_cards_search_tsv()
returns trigger language plpgsql as $$
begin
  new.search_tsv := public.cards_build_search_tsv(
    new.name, new.preset_id, new.form_snapshot
  );
  return new;
end;
$$;

drop trigger if exists cards_search_tsv_trigger on public.generation_cards;
create trigger cards_search_tsv_trigger
  before insert or update of name, preset_id, form_snapshot
  on public.generation_cards
  for each row execute function public.tg_cards_search_tsv();

-- ---------------------------------------------------------------------
-- generations — расширяем существующую таблицу
-- ---------------------------------------------------------------------
alter table public.generations
  add column if not exists card_id          uuid references public.generation_cards(id) on delete cascade,
  add column if not exists is_master        boolean not null default false,
  add column if not exists public_id        uuid not null default gen_random_uuid(),
  add column if not exists image_url        text,
  add column if not exists ftp_path         text,
  add column if not exists filename         text,
  add column if not exists width            integer,
  add column if not exists height           integer,
  add column if not exists upload_status    text not null default 'legacy',
                                            -- 'legacy' | 'pending' | 'success' | 'failed'
  add column if not exists upload_attempts  integer not null default 0,
  add column if not exists next_retry_at    timestamptz,
  add column if not exists last_error       text,
  add column if not exists deleted_at       timestamptz;

create index if not exists generations_card_idx
  on public.generations (card_id)
  where card_id is not null and deleted_at is null;

create index if not exists generations_card_master_idx
  on public.generations (card_id, is_master)
  where card_id is not null and is_master = true;

create index if not exists generations_pending_upload_idx
  on public.generations (next_retry_at)
  where upload_status = 'pending';

create index if not exists generations_public_id_idx
  on public.generations (public_id);

-- ---------------------------------------------------------------------
-- audit_logs — security/admin/billing audit (long retention)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,    -- кто сделал
  target_user_id  uuid references auth.users(id) on delete set null,    -- над кем
  action          text not null,                                         -- 'card.deleted', 'admin.viewed_user_history', и т.д.
  resource_type   text,                                                  -- 'card', 'generation', 'user', 'settings'
  resource_id     text,
  details         jsonb not null default '{}'::jsonb,                    -- {old_value, new_value, reason, ...}
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_user_idx        on public.audit_logs (user_id, created_at desc);
create index if not exists audit_target_idx      on public.audit_logs (target_user_id, created_at desc);
create index if not exists audit_action_idx      on public.audit_logs (action, created_at desc);
create index if not exists audit_resource_idx    on public.audit_logs (resource_type, resource_id);
create index if not exists audit_created_idx     on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- system_logs — техлоги (errors, FTP attempts, cron runs)
-- ---------------------------------------------------------------------
create table if not exists public.system_logs (
  id           bigserial primary key,
  level        text not null,                  -- 'error' | 'warn' | 'info' | 'debug'
  category     text not null,                  -- 'ftp' | 'image-gen' | 'auth' | 'cron' | 'api' | 'admin'
  message      text not null,
  context      jsonb not null default '{}'::jsonb,
  user_id      uuid references auth.users(id) on delete set null,
  request_id   text,
  duration_ms  integer,
  error_stack  text,
  created_at   timestamptz not null default now()
);

create index if not exists logs_level_time_idx     on public.system_logs (level, created_at desc);
create index if not exists logs_category_time_idx  on public.system_logs (category, created_at desc);
create index if not exists logs_user_time_idx      on public.system_logs (user_id, created_at desc)
  where user_id is not null;
create index if not exists logs_request_idx        on public.system_logs (request_id)
  where request_id is not null;
create index if not exists logs_created_idx        on public.system_logs (created_at desc);

-- ---------------------------------------------------------------------
-- pricing: add gpt-4o-mini for AI naming + vision pre-pass billing
-- ---------------------------------------------------------------------
insert into public.pricing_coefficients (model, quality, coefficient) values
  ('gpt-4o-mini', 'standard', 0.001)
on conflict (model, quality) do nothing;

-- ---------------------------------------------------------------------
-- RPC: touch_card_activity — bump last_activity_at + reset expires_at
-- Called from generate-image after every successful generation tied to
-- a card. Reads retention_cards_months from app_settings.
-- ---------------------------------------------------------------------
create or replace function public.touch_card_activity(p_card_id uuid)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  v_months     integer;
  v_expires_at timestamptz;
begin
  select coalesce((value)::integer, 12)
    into v_months
    from public.app_settings
   where key = 'retention_cards_months';
  v_months := coalesce(v_months, 12);

  v_expires_at := now() + (v_months || ' months')::interval;

  update public.generation_cards
     set last_activity_at = now(),
         expires_at       = v_expires_at
   where id = p_card_id
     and deleted_at is null
   returning expires_at into v_expires_at;

  return v_expires_at;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: soft_delete_card — помечает удалённой и ставит hard_delete_after
-- Юзер или супер-админ. Окно восстановления — card_delete_grace_hours.
-- ---------------------------------------------------------------------
create or replace function public.soft_delete_card(p_card_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_grace_hours integer;
  v_card_user   uuid;
  v_caller      uuid := auth.uid();
begin
  select user_id into v_card_user
    from public.generation_cards
   where id = p_card_id and deleted_at is null;

  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;

  if v_card_user <> v_caller and not public.is_caller_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce((value)::integer, 24)
    into v_grace_hours
    from public.app_settings
   where key = 'card_delete_grace_hours';
  v_grace_hours := coalesce(v_grace_hours, 24);

  update public.generation_cards
     set deleted_at        = now(),
         hard_delete_after = now() + (v_grace_hours || ' hours')::interval
   where id = p_card_id;

  insert into public.audit_logs (user_id, target_user_id, action, resource_type, resource_id, details)
   values (v_caller, v_card_user, 'card.soft_deleted', 'card', p_card_id::text,
           jsonb_build_object('grace_hours', v_grace_hours));
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: restore_card — отмена soft-delete в течение grace
-- ---------------------------------------------------------------------
create or replace function public.restore_card(p_card_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_card_user uuid;
  v_caller    uuid := auth.uid();
  v_hard_at   timestamptz;
begin
  select user_id, hard_delete_after
    into v_card_user, v_hard_at
    from public.generation_cards
   where id = p_card_id and deleted_at is not null;

  if not found then
    raise exception 'card_not_found_or_not_deleted' using errcode = 'P0002';
  end if;

  if v_card_user <> v_caller and not public.is_caller_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_hard_at is not null and v_hard_at < now() then
    raise exception 'grace_period_expired' using errcode = 'P0001';
  end if;

  update public.generation_cards
     set deleted_at = null,
         hard_delete_after = null
   where id = p_card_id;

  insert into public.audit_logs (user_id, target_user_id, action, resource_type, resource_id)
   values (v_caller, v_card_user, 'card.restored', 'card', p_card_id::text);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: admin_set_setting — обновление настройки (super-admin only)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_setting(
  p_key   text,
  p_value jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old_value jsonb;
begin
  if not public.is_caller_super_admin() then
    raise exception 'forbidden: super admin only' using errcode = '42501';
  end if;

  select value into v_old_value
    from public.app_settings
   where key = p_key;

  if not found then
    raise exception 'unknown_setting_key' using errcode = 'P0002';
  end if;

  update public.app_settings
     set value = p_value,
         updated_by = auth.uid()
   where key = p_key;

  insert into public.audit_logs (user_id, action, resource_type, resource_id, details)
   values (auth.uid(), 'settings.updated', 'setting', p_key,
           jsonb_build_object('old_value', v_old_value, 'new_value', p_value));
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: cleanup_expired_data — вызывается cron-job каждые сутки
-- Возвращает счётчик удалённого. Сами FTP-файлы удаляет Node-крон
-- (он сначала читает что удалить, потом физически удаляет файлы,
--  потом дёргает hard_delete_card для каждой). Здесь — только
-- system_logs и audit_logs cleanup (БД-only).
-- ---------------------------------------------------------------------
create or replace function public.cleanup_expired_logs()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_logs_days  integer;
  v_audit_days integer;
  v_logs_del   bigint := 0;
  v_audit_del  bigint := 0;
begin
  if not public.is_caller_super_admin() and current_user <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce((value)::integer, 90) into v_logs_days
    from public.app_settings where key = 'retention_logs_days';
  select coalesce((value)::integer, -1) into v_audit_days
    from public.app_settings where key = 'retention_audit_days';

  if v_logs_days > 0 then
    delete from public.system_logs
     where created_at < now() - (v_logs_days || ' days')::interval;
    get diagnostics v_logs_del = row_count;
  end if;

  if v_audit_days > 0 then
    delete from public.audit_logs
     where created_at < now() - (v_audit_days || ' days')::interval;
    get diagnostics v_audit_del = row_count;
  end if;

  return jsonb_build_object(
    'system_logs_deleted', v_logs_del,
    'audit_logs_deleted',  v_audit_del,
    'ran_at',              now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: hard_delete_card — финальное удаление из БД (вызывается Node-кроном
-- после успешного удаления файлов с FTP). CASCADE удалит и generations.
-- ---------------------------------------------------------------------
create or replace function public.hard_delete_card(p_card_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;
  delete from public.generation_cards where id = p_card_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.generation_cards enable row level security;
alter table public.app_settings     enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.system_logs      enable row level security;

-- generation_cards: user видит свои НЕ-deleted, супер-админ — все
drop policy if exists cards_select_self           on public.generation_cards;
drop policy if exists cards_select_self_deleted   on public.generation_cards;
drop policy if exists cards_select_admin          on public.generation_cards;
drop policy if exists cards_update_self           on public.generation_cards;
drop policy if exists cards_update_admin          on public.generation_cards;

-- user видит свои живые + свои в корзине (grace period)
create policy cards_select_self on public.generation_cards
  for select using (auth.uid() = user_id);

create policy cards_select_admin on public.generation_cards
  for select using (public.is_caller_super_admin());

-- user может апдейтить ТОЛЬКО свои поля (name, is_favorite — через app)
create policy cards_update_self on public.generation_cards
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy cards_update_admin on public.generation_cards
  for update using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());

-- INSERT и DELETE — только через service_role (через сервер)

-- app_settings: все аутент могут читать (фронту нужно знать лимиты),
--               запись только через admin_set_setting RPC.
drop policy if exists settings_select_auth  on public.app_settings;
create policy settings_select_auth on public.app_settings
  for select using (auth.role() = 'authenticated');

-- audit_logs: super-admin читает все. Остальные не видят.
-- Запись — через RPC или service_role.
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs
  for select using (public.is_caller_super_admin());

-- system_logs: super-admin читает все. Запись — service_role.
drop policy if exists logs_select_admin on public.system_logs;
create policy logs_select_admin on public.system_logs
  for select using (public.is_caller_super_admin());

-- Расширяем generations: добавляем policy для super-admin на UPDATE
-- (сейчас в 0001 только SELECT). Нужно для апдейта upload_status и т.д.
-- от service_role. По умолчанию service_role bypass-ит RLS, но явная
-- policy не помешает.
drop policy if exists gen_update_admin on public.generations;
create policy gen_update_admin on public.generations
  for update using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select on public.generation_cards to authenticated;
grant update (name, is_favorite) on public.generation_cards to authenticated;
grant select on public.app_settings     to authenticated;
grant select on public.audit_logs       to authenticated;
grant select on public.system_logs      to authenticated;

grant execute on function public.touch_card_activity(uuid)        to service_role;
grant execute on function public.soft_delete_card(uuid)           to authenticated;
grant execute on function public.restore_card(uuid)               to authenticated;
grant execute on function public.admin_set_setting(text, jsonb)   to authenticated;
grant execute on function public.cleanup_expired_logs()           to service_role, authenticated;
grant execute on function public.hard_delete_card(uuid)           to service_role;

-- ---------------------------------------------------------------------
-- Маркировка существующих generations rows как legacy
-- (защита от того что они вдруг попадут в /history через ошибку фильтра)
-- ---------------------------------------------------------------------
update public.generations
   set upload_status = 'legacy'
 where upload_status is null
    or (card_id is null and upload_status not in ('pending', 'success', 'failed'));

-- ---------------------------------------------------------------------
-- DONE
-- =====================================================================

-- ======================= [0003_fix_service_role_check.sql] =======================
-- 0003_fix_service_role_check.sql
--
-- Bug: in 0002 the cleanup_expired_logs and hard_delete_card functions
-- used `current_user <> 'service_role'` to gate access. Inside a
-- SECURITY DEFINER function `current_user` returns the *owner* of the
-- function (typically supabase_admin), NOT the role of the caller —
-- so the check always rejected the call. The correct identifier is
-- `session_user`, which keeps the caller's role even under SECURITY
-- DEFINER.
--
-- This file is idempotent: it just rewrites the two functions.

create or replace function public.cleanup_expired_logs()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_logs_days  integer;
  v_audit_days integer;
  v_logs_del   bigint := 0;
  v_audit_del  bigint := 0;
begin
  if not public.is_caller_super_admin() and session_user <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce((value)::integer, 90) into v_logs_days
    from public.app_settings where key = 'retention_logs_days';
  select coalesce((value)::integer, -1) into v_audit_days
    from public.app_settings where key = 'retention_audit_days';

  if v_logs_days > 0 then
    delete from public.system_logs
     where created_at < now() - (v_logs_days || ' days')::interval;
    get diagnostics v_logs_del = row_count;
  end if;

  if v_audit_days > 0 then
    delete from public.audit_logs
     where created_at < now() - (v_audit_days || ' days')::interval;
    get diagnostics v_audit_del = row_count;
  end if;

  return jsonb_build_object(
    'system_logs_deleted', v_logs_del,
    'audit_logs_deleted',  v_audit_del,
    'ran_at',              now()
  );
end;
$$;

create or replace function public.hard_delete_card(p_card_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if session_user <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;
  delete from public.generation_cards where id = p_card_id;
end;
$$;

-- ======================= [0004_use_auth_role.sql] =======================
-- 0004_use_auth_role.sql
--
-- Follow-up to 0003: session_user inside a SECURITY DEFINER function on
-- Supabase resolves to `authenticator` (the role PostgREST connects as),
-- not the JWT role. The supported way to read the JWT role inside a
-- function is `auth.role()` — for service-role API calls it returns the
-- literal string 'service_role'.
--
-- Idempotent: just rewrites the two functions.

create or replace function public.cleanup_expired_logs()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_logs_days  integer;
  v_audit_days integer;
  v_logs_del   bigint := 0;
  v_audit_del  bigint := 0;
begin
  if not public.is_caller_super_admin() and auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce((value)::integer, 90) into v_logs_days
    from public.app_settings where key = 'retention_logs_days';
  select coalesce((value)::integer, -1) into v_audit_days
    from public.app_settings where key = 'retention_audit_days';

  if v_logs_days > 0 then
    delete from public.system_logs
     where created_at < now() - (v_logs_days || ' days')::interval;
    get diagnostics v_logs_del = row_count;
  end if;

  if v_audit_days > 0 then
    delete from public.audit_logs
     where created_at < now() - (v_audit_days || ' days')::interval;
    get diagnostics v_audit_del = row_count;
  end if;

  return jsonb_build_object(
    'system_logs_deleted', v_logs_del,
    'audit_logs_deleted',  v_audit_del,
    'ran_at',              now()
  );
end;
$$;

create or replace function public.hard_delete_card(p_card_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden: service_role only' using errcode = '42501';
  end if;
  delete from public.generation_cards where id = p_card_id;
end;
$$;

-- ======================= [TEMP-патч: личный админ] ====================
-- Пока нет доступа к корпоративной почте, супер-админом добавлен личный
-- gmail. УДАЛИТЬ этот блок (и правку в src/lib/auth-server.ts) при
-- возврате на корпоративный проект.
create or replace function public.is_super_admin(p_email text)
returns boolean
language sql
stable
as $$
  select lower(coalesce(p_email, '')) in (
    'kela@clickable.agency',
    'skobelev@clickable.agency',
    'skobelev.victor.v@gmail.com'
  );
$$;
-- ======================= [13.06.2026: +aslanov] =======================
-- aslanov@clickable.agency добавлен супер-админом (просмотр админки).
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
  );
$$;

-- ======================= [0005_templates.sql] =======================
-- Каталог шаблонов (вкладка админки «Шаблоны», /api/admin/templates).
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('banner', 'landing', 'playable', 'video')),
  category    text not null default '',
  name        text not null,
  description text not null default '',
  preview_url text,
  meta        jsonb not null default '{}'::jsonb,
  visible     boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists templates_section_idx on public.templates (section, sort_order);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.tg_set_updated_at();

alter table public.templates enable row level security;
drop policy if exists templates_select_visible on public.templates;
create policy templates_select_visible on public.templates
  for select using (visible = true);
drop policy if exists templates_select_admin on public.templates;
create policy templates_select_admin on public.templates
  for select using (public.is_caller_super_admin());
drop policy if exists templates_modify_admin on public.templates;
create policy templates_modify_admin on public.templates
  for all using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());
grant select on public.templates to anon, authenticated;
grant insert, update, delete on public.templates to authenticated;

-- ======================= [0006_rbac_role_tier.sql] =======================
-- RBAC: role + tier на profiles. Без них /api/admin/users падает с
-- "column profiles.role does not exist" и список юзеров пуст.
alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists tier text not null default 'regular';

update public.profiles
   set role = 'superadmin'
 where lower(email) in (
   'kela@clickable.agency',
   'skobelev@clickable.agency',
   'skobelev.victor.v@gmail.com',
   'aslanov@clickable.agency'
 )
   and role is distinct from 'superadmin';