-- 0016_email_drafts.sql
--
-- Черновики писем в базе.
--
-- Черновики жили только в localStorage: сменил браузер или почистил данные
-- сайта — писем нет. К тому же сохранённое письмо нельзя было открыть снова:
-- генератор каждый раз стартовал с чистого листа, а черновики видел только
-- кабинет рассылок.
--
-- id черновика — строка, которую выдаёт клиент («draft_…»): так черновики,
-- созданные до этой миграции, переезжают в базу под своими же id и ссылки на
-- них не ломаются. Уникальна пара (пользователь, id).
--
-- data — черновик целиком, вместе с картинками в base64: редактор работает с
-- ними через канвас (склейка лого с баннером), а FTP не отдаёт CORS. Размер
-- одного черновика ограничен на сервере.

create table if not exists public.email_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null default '',
  subject text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists email_drafts_user_updated_idx
  on public.email_drafts (user_id, updated_at desc);

alter table public.email_drafts enable row level security;

-- Пишет сюда сервер (service role) после проверки владельца. Политики — на
-- случай прямого доступа из клиента: только свои строки.
drop policy if exists email_drafts_own on public.email_drafts;
create policy email_drafts_own on public.email_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
