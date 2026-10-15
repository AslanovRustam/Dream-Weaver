-- 0018_creative_projects.sql
--
-- История лендингов и плейблов.
--
-- «Мои проекты» знали только баннеры (generation_cards — карточки картинок с
-- ресайзами на FTP). Лендинг или плейбл после закрытия вкладки было не открыть:
-- черновик жил в localStorage одного браузера, а история показывала заглушку.
--
-- Проект — черновик редактора целиком (тот же объект, что редактор держит в
-- localStorage, вместе с картинками в base64): история открывает редактор
-- ровно в том состоянии, в каком его скачали. Сохраняется при скачивании.
--
-- kind — какой редактор открывать:
--   landing-wheel | landing-slot | landing-crash | landing-match — механики,
--   landing-scene — лендинг на премиум-сцене, playable — плейбл.
-- scene — какая сцена (для landing-scene и playable).
-- id выдаёт клиент («prj_…»): черновик редактора помнит его и при следующем
-- скачивании обновляет ту же запись, а не плодит копии.
--
-- Удаление — мягкое (deleted_at), как у баннеров: корзина и «Восстановить».

create table if not exists public.creative_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  kind text not null check (kind in ('landing-wheel', 'landing-slot', 'landing-crash', 'landing-match', 'landing-scene', 'playable')),
  scene text not null default '',
  name text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists creative_projects_user_updated_idx
  on public.creative_projects (user_id, updated_at desc);

alter table public.creative_projects enable row level security;

-- Пишет сервер (service role) после проверки владельца. Политика — на случай
-- прямого доступа из клиента: только свои строки.
drop policy if exists creative_projects_own on public.creative_projects;
create policy creative_projects_own on public.creative_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
