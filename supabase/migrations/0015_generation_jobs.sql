-- 0015_generation_jobs.sql
--
-- Серверная очередь генераций.
--
-- Пакетная сборка лендинга (фон, персонажи, иконки) жила в открытой вкладке:
-- браузер сам вызывал роуты по одному и складывал результат в состояние
-- страницы. Закрыли вкладку — начатые генерации доходили до конца на сервере
-- и списывали кредиты, но картинку забрать было некому, а шаги, ещё стоявшие
-- в очереди, не стартовали вовсе.
--
-- Теперь каждый шаг — строка здесь. Исполняет их сервер (после ответа клиенту,
-- через after()), результат — ссылка на FTP — остаётся в строке, и вернувшийся
-- человек получает всё, что успело сделаться.
--
-- Пишет сюда только сервер (service role). Пользователь читает свои строки —
-- этого достаточно, чтобы клиент мог следить за прогрессом.

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Шаги одной сборки: по нему клиент спрашивает прогресс и его же помнит,
  -- чтобы подхватить сборку после перезагрузки.
  batch_id uuid not null,
  step_key text not null,
  label text not null,
  -- Какой роут исполняет шаг. Сервер принимает только роуты из своего списка,
  -- поле здесь — запись того, что уже проверено.
  route text not null,
  -- Тело запроса к роуту. Нужно, чтобы досборку после сбоя мог начать любой
  -- следующий запрос, а не только тот, что создал сборку.
  body jsonb not null default '{}'::jsonb,
  credits integer not null default 0 check (credits >= 0),
  -- Блокирующие шаги (фон) идут первыми и по одному.
  blocking boolean not null default false,
  position integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error', 'cancelled')),
  -- { url, ftp_path, card_id? } — картинка уже на FTP, в базе только ссылка.
  result jsonb,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists generation_jobs_batch_idx on public.generation_jobs (batch_id, position);
create index if not exists generation_jobs_user_status_idx on public.generation_jobs (user_id, status);
create index if not exists generation_jobs_created_idx on public.generation_jobs (created_at);

alter table public.generation_jobs enable row level security;

drop policy if exists generation_jobs_select_own on public.generation_jobs;
create policy generation_jobs_select_own on public.generation_jobs
  for select using (auth.uid() = user_id);

-- Supabase по умолчанию раздаёт authenticated права на всю таблицу. Вставлять
-- и менять шаги клиенту нельзя: иначе он сам выставит себе status = 'done' с
-- чужой ссылкой или поменяет route на что угодно.
revoke insert, update, delete on public.generation_jobs from anon, authenticated;
