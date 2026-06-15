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
