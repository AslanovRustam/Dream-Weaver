-- 0021 — задания на ИИ-клип раздела «Видеореклама».
--
-- Одна строка — один клип xAI Grok Imagine Video по баннеру. Создаёт её сервер
-- (service_role) до списания кредитов; статус двигает только сервер:
--   pending → saving → done   (клип забран к себе на FTP)
--   pending → failed          (кредиты возвращены, refunded_at)
-- Переходы — условным UPDATE … WHERE status = …: два одновременных опроса не
-- заберут клип дважды и не вернут кредиты дважды.

create table if not exists public.video_ad_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  card_id             uuid references public.generation_cards(id) on delete set null,
  title               text not null default '',
  image_url           text not null,
  prompt              text not null,
  model               text not null,
  quality             text not null,                        -- fast | max
  seconds             int not null check (seconds between 1 and 15),
  credits             numeric(20,4) not null check (credits >= 0),
  recipe              jsonb not null default '{}'::jsonb,    -- форматы, концовка, длина
  status              text not null default 'pending',       -- pending | saving | done | failed
  provider_request_id text,
  video_url           text,
  ftp_path            text,
  error               text,
  refunded_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists video_ad_jobs_user_idx on public.video_ad_jobs (user_id, created_at desc);

alter table public.video_ad_jobs enable row level security;

drop policy if exists video_ad_jobs_select_own on public.video_ad_jobs;
create policy video_ad_jobs_select_own on public.video_ad_jobs
  for select to authenticated using (auth.uid() = user_id);

-- Писать может только сервер.
revoke insert, update, delete on public.video_ad_jobs from anon, authenticated;
