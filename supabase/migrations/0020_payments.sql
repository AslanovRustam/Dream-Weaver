-- 0020 — оплата пакетов кредитов (крипта сейчас, карты позже — тот же контур).
--
-- payments: одна строка на попытку оплаты. Создаёт её сервер (service_role)
-- перед выставлением счёта у провайдера; статус двигает только webhook провайдера.
-- credit_payment(): начисляет кредиты РОВНО ОДИН РАЗ — повторный webhook, ретрай
-- провайдера или гонка двух запросов ничего не удвоят (строка блокируется FOR UPDATE,
-- credited_at — признак «уже начислено»).

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  provider            text not null,                       -- 'nowpayments' | …
  package_id          text not null,
  credits             numeric(20,4) not null check (credits > 0),
  amount_usd          numeric(12,2) not null check (amount_usd > 0),
  -- created | pending | partially_paid | paid | failed | expired | refunded
  status              text not null default 'created',
  provider_status     text,
  provider_invoice_id text,
  provider_payment_id text,
  invoice_url         text,
  pay_currency        text,
  meta                jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  credited_at         timestamptz
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create unique index if not exists payments_provider_invoice_uidx
  on public.payments (provider, provider_invoice_id) where provider_invoice_id is not null;

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (auth.uid() = user_id);

-- Писать в payments может только сервер.
revoke insert, update, delete on public.payments from anon, authenticated;

create or replace function public.credit_payment(
  p_payment_id          uuid,
  p_provider_payment_id text  default null,
  p_meta                jsonb default '{}'::jsonb
) returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v     public.payments%rowtype;
  v_bal numeric;
begin
  select * into v from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  -- Уже начислено — тот же баланс, без второго начисления.
  if v.credited_at is not null then
    select credits_balance into v_bal from public.profiles where id = v.user_id;
    return v_bal;
  end if;

  update public.profiles
     set credits_balance = credits_balance + v.credits
   where id = v.user_id
   returning credits_balance into v_bal;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.credit_transactions (user_id, delta, reason, meta)
  values (
    v.user_id, v.credits, 'purchase',
    jsonb_build_object('payment_id', v.id, 'provider', v.provider, 'package', v.package_id, 'amount_usd', v.amount_usd)
      || coalesce(p_meta, '{}'::jsonb)
  );

  update public.payments
     set status = 'paid',
         credited_at = now(),
         updated_at = now(),
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
   where id = v.id;

  return v_bal;
end;
$$;

revoke all on function public.credit_payment(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_payment(uuid, text, jsonb) to service_role;
