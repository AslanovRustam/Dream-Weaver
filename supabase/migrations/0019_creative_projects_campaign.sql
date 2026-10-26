-- 0019_creative_projects_campaign.sql
--
-- Кампании в «Моих проектах».
--
-- Кампания («всё в одном»: лендинг, плейбл, баннер, письмо) сохраняется в
-- историю сразу, как только нарисовалась её графика. data — бриф кампании и
-- вся графика (то, что редактор держит в localStorage и IndexedDB); история
-- открывает кампанию ровно в этом виде. scene — сцена графики (для превью).
--
-- Меняется только список допустимых kind. Пока миграция не применена,
-- сервер на сохранение кампании отвечает 503, и клиент молча живёт как раньше.

alter table public.creative_projects drop constraint if exists creative_projects_kind_check;
alter table public.creative_projects add constraint creative_projects_kind_check
  check (kind in ('landing-wheel', 'landing-slot', 'landing-crash', 'landing-match', 'landing-scene', 'playable', 'campaign'));
