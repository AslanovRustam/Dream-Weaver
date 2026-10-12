-- 0017_user_integrations.sql
--
-- Ключи клиентов от их внешних сервисов: токены рекламных кабинетов (Meta,
-- Google, TikTok) и ключ почтового сервиса (SendGrid, Mailgun, SMTP).
--
-- Раньше они лежали в localStorage открытым текстом: любая XSS на сайте
-- уносила токен вместе с доступом к чужому рекламному бюджету. Теперь —
-- только на сервере и только зашифрованными.
--
-- secret — AES-256-GCM от JSON с секретами, формат «v1:<base64 iv|tag|ct>».
--   Ключ шифрования (INTEGRATIONS_KEK) живёт в окружении сервера, в базе его
--   нет: утечка таблицы или бэкапа не раскрывает ни одного токена.
-- public — то, что не секрет и нужно интерфейсу: ID кабинета, провайдер
--   почты, адрес отправителя, последние 4 символа ключа для маски.
--
-- RLS включён БЕЗ политик: ни anon, ни authenticated не читают и не пишут
-- таблицу напрямую — только сервер (service role) после проверки владельца
-- в /api/integrations. Даже шифротекст клиенту не отдаём.

create table if not exists public.user_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta', 'google', 'tiktok', 'esp')),
  secret text not null check (secret like 'v1:%'),
  public jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_integrations enable row level security;

-- Политик нет намеренно (см. шапку). На случай, если кто-то добавит общую
-- политику по ошибке, — снимаем возможные старые.
drop policy if exists user_integrations_own on public.user_integrations;

revoke all on public.user_integrations from anon, authenticated;
