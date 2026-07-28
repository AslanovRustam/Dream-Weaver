-- 0006_rbac_role_tier.sql
--
-- Adds the staff `role` + billing `tier` columns to profiles — the RBAC
-- feature the admin panel depends on (/api/admin/users selects role,tier;
-- /api/admin/role writes them; auth-server.getUserRole reads them).
--
-- These columns existed on the corporate DB via an ad-hoc ALTER that was
-- NEVER captured as a migration. On any fresh setup (personal Supabase from
-- MIGRATE_TO_PERSONAL.sql) they were therefore missing, which made
-- /api/admin/users fail with "column profiles.role does not exist" and the
-- admin Users list come up empty. This file closes that gap. Idempotent.

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists tier text not null default 'regular';

-- Bootstrap: make the stored role of known super-admins match the email
-- allow-list (runtime already treats these emails as superadmin via the
-- getUserRole email bootstrap; this just keeps the table consistent).
update public.profiles
   set role = 'superadmin'
 where lower(email) in (
   'kela@clickable.agency',
   'skobelev@clickable.agency',
   'skobelev.victor.v@gmail.com',
   'aslanov@clickable.agency'
 )
   and role is distinct from 'superadmin';
