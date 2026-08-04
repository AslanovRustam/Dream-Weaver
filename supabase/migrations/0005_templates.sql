-- Templates catalogue.
--
-- Until now every template (banner presets, landing verticals, playable
-- mechanics, video scene types) lived as a hardcoded constant in the frontend,
-- so adding one for a campaign required a developer and a deploy. This table
-- moves them into data, which is what makes the admin "Шаблоны" tab useful:
-- a manager can prepare a template ahead of time (visible = false) and publish
-- it when the campaign starts.
--
-- The frontend constants stay as the built-in catalogue; rows here are the
-- editable layer on top of them.

create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('banner', 'landing', 'playable', 'video')),
  category    text not null default '',
  name        text not null,
  description text not null default '',
  preview_url text,
  -- Section-specific extras: mechanic for playable, scene type for video, etc.
  meta        jsonb not null default '{}'::jsonb,
  -- "Показывать на проде" — drafts stay invisible to customers.
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

-- Anyone (including guests browsing the product) may read PUBLISHED templates.
drop policy if exists templates_select_visible on public.templates;
create policy templates_select_visible on public.templates
  for select using (visible = true);

-- Staff additionally see drafts prepared ahead of a campaign.
drop policy if exists templates_select_admin on public.templates;
create policy templates_select_admin on public.templates
  for select using (public.is_caller_super_admin());

drop policy if exists templates_modify_admin on public.templates;
create policy templates_modify_admin on public.templates
  for all using (public.is_caller_super_admin())
  with check (public.is_caller_super_admin());

grant select on public.templates to anon, authenticated;
grant insert, update, delete on public.templates to authenticated;
