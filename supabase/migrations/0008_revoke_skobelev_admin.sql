-- 0008_revoke_skobelev_admin.sql
--
-- Revokes super-admin status from skobelev's two emails
-- (skobelev@clickable.agency, skobelev.victor.v@gmail.com) — requested
-- 2026-09-14. Mirrors the code-side removal from
-- src/lib/auth-server.ts → SUPER_ADMIN_EMAILS.
--
-- This ONLY downgrades the role/admin-check. It does NOT delete the
-- account, its profile row, or any of its data — deleting an account
-- outright is a separate, deliberately-irreversible action and should
-- be done explicitly (Supabase dashboard → Authentication → Users →
-- Delete, which cascades profiles/generations/etc via FK), not bundled
-- into a role-revocation migration.
--
-- NOT YET APPLIED — like 0007, this is committed but needs
-- `supabase db push` (or running in the SQL Editor) to take effect.

create or replace function public.is_super_admin(p_email text)
returns boolean
language sql
stable
as $$
  select lower(coalesce(p_email, '')) in (
    'kela@clickable.agency',
    'aslanov@clickable.agency'
  );
$$;

update public.profiles
   set role = 'user'
 where lower(email) in (
   'skobelev@clickable.agency',
   'skobelev.victor.v@gmail.com'
 )
   and role = 'superadmin';
