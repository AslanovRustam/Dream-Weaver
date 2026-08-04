# Перенос БД на новый аккаунт Supabase — инструкция

Ветка: **ui-updates**. Старый проект недоступен, поэтому восстанавливаем из
репозитория (схема) + CSV-экспортов (данные). Пользователи `auth.users`
восстановлению не подлежат — см. раздел «Пользователи».

## Три слоя и их судьба

| Слой | Источник | Действие |
|---|---|---|
| Схема Dream Weaver (8 таблиц + RLS + RPC) | `supabase/MIGRATE_TO_PERSONAL.sql` | прогнать в SQL Editor |
| 4 «чужие» таблицы (estimations/chat/benchmarks) | `supabase/extra_tables.sql` | прогнать в SQL Editor |
| Данные | `Table-SQL/*.csv` | импорт по категориям (ниже) |
| Пользователи (`auth.users`, пароли) | — | **не восстановимы**, регистрация заново |

## Готовые файлы (я сделал)
- `supabase/MIGRATE_TO_PERSONAL.sql` — полная схема Dream Weaver (уже была).
- `supabase/extra_tables.sql` — CREATE TABLE для estimations, estimations_history, market_benchmarks, chat_sessions.
- `supabase/import_config_data.sql` — `\copy` импорт таблиц без привязки к юзерам.
- `scripts/remap-user-ids.mjs` — ремаппинг `user_id` (только для сценария «полное восстановление»).

---

## Что делаете ВЫ в Supabase (по шагам)

> В ссылках `/project/_/` автоматически подставляет выбранный проект.

### Шаг 1. Создать новый проект
→ https://supabase.com/dashboard/new
Выберите организацию, регион (ближе к пользователям — EU), задайте пароль БД (запомните — понадобится для `psql`).

### Шаг 2. Забрать ключи
→ https://supabase.com/dashboard/project/_/settings/api
Скопируйте: **Project URL**, **anon public**, **service_role** (секретный).

### Шаг 3. Накатить схему
→ https://supabase.com/dashboard/project/_/sql/new
1. Откройте локальный `supabase/MIGRATE_TO_PERSONAL.sql`, скопируйте **весь** → вставьте в SQL Editor → **Run**.
2. Новый query → вставьте **весь** `supabase/extra_tables.sql` → **Run**.
Оба идемпотентны. После этого созданы все таблицы, RLS, RPC, триггеры; `app_settings` и `pricing_coefficients` уже засеяны.

### Шаг 4. Импорт данных без пользователей
Эти таблицы (`market_benchmarks`, `estimations`, `estimations_history`, `chat_sessions`) не ссылаются на юзеров — заливаются сразу.

**Вариант A (просто, в браузере):** Table Editor → таблица → кнопка **Insert → Import data from CSV** → выбрать соответствующий `*_rows.csv`.
→ https://supabase.com/dashboard/project/_/editor

**Вариант B (надёжнее для больших файлов, через psql):**
Строку подключения возьмите тут → https://supabase.com/dashboard/project/_/settings/database (Connection string → `psql`).
```bash
psql "postgresql://postgres:ВАШ_ПАРОЛЬ@ХОСТ:5432/postgres" -f supabase/import_config_data.sql
```
(при необходимости поправьте пути к CSV внутри файла).

### Шаг 5. Пользователи — выберите сценарий

#### Сценарий 1 — Чистый старт (рекомендую)
- Пользователи регистрируются заново (Google/email) на новом проекте.
- Триггер `on_auth_user_created` автоматически создаёт им `profiles` с балансом 0.
- **Супер-админы** — по email в функции `is_super_admin()` (`kela@`, `skobelev@`, `skobelev.victor.v@gmail.com`, `aslanov@clickable.agency`). Как только эти почты входят — они админы. UUID не важен. (Список продублирован в `src/lib/auth-server.ts` — держите синхронно.)
- **Балансы**: админ начисляет заново через админку (значения — из `profiles_rows.csv`, колонка `credits_balance`).
- История/генерации стартуют пустыми. **Данные profiles/generations/... НЕ импортируем.**

#### Сценарий 2 — Полное восстановление истории (трудозатратно)
Только если реально нужна старая история карточек/генераций.
1. Сначала пусть все нужные пользователи **зарегистрируются** (Шаг 7 сначала, потом сюда).
2. Соберите новые UUID: → https://supabase.com/dashboard/project/_/auth/users (или `select id,email from profiles`). Составьте `user-id-map.json`:
   ```json
   { "aslanov@clickable.agency": "НОВЫЙ-UUID", "skobelev@clickable.agency": "НОВЫЙ-UUID" }
   ```
3. Прогоните ремаппинг (я подготовил скрипт):
   ```bash
   node scripts/remap-user-ids.mjs --map user-id-map.json \
     --dir "D:/projects/clickable/Скобелєв Віктор/Table-SQL"
   ```
   Он создаст `Table-SQL/remapped/*_remapped.csv` с новыми UUID (строки без маппинга отбрасываются).
4. Залейте через `psql` в порядке FK. **profiles не импортируем напрямую** (триггер уже создал строки) — восстанавливаем только баланс через temp-таблицу:
   ```sql
   -- баланс из старых профилей
   create temp table _p (id uuid, credits_balance numeric);
   \copy _p (id, credits_balance) FROM 'D:/.../remapped/profiles_remapped.csv' WITH (FORMAT csv, HEADER true, FORCE_NULL (credits_balance))
   -- ^ если колонок больше — сделайте temp со всеми колонками профиля и выберите нужные
   update public.profiles p set credits_balance = _p.credits_balance from _p where p.id = _p.id;

   -- история (FK-порядок)
   \copy public.generation_cards    FROM 'D:/.../remapped/generation_cards_remapped.csv'    WITH (FORMAT csv, HEADER true)
   \copy public.generations         FROM 'D:/.../remapped/generations_remapped.csv'         WITH (FORMAT csv, HEADER true)
   \copy public.credit_transactions FROM 'D:/.../remapped/credit_transactions_remapped.csv' WITH (FORMAT csv, HEADER true)
   \copy public.audit_logs          FROM 'D:/.../remapped/audit_logs_remapped.csv'          WITH (FORMAT csv, HEADER true)
   \copy public.system_logs         FROM 'D:/.../remapped/system_logs_remapped.csv'         WITH (FORMAT csv, HEADER true)
   -- сброс bigserial у generations/credit_transactions/system_logs:
   select setval(pg_get_serial_sequence('public.generations','id'),         coalesce((select max(id) from public.generations),1));
   select setval(pg_get_serial_sequence('public.credit_transactions','id'), coalesce((select max(id) from public.credit_transactions),1));
   select setval(pg_get_serial_sequence('public.system_logs','id'),         coalesce((select max(id) from public.system_logs),1));
   ```
   Примечания: `\copy` как `postgres` **обходит RLS**; триггер `search_tsv` на карточках пересоберёт индекс сам; `image_url`/`ftp_path` в generations указывают на старый FTP — картинки живы, только пока доступен тот хост.

### Шаг 6. Переключить приложение (ветка ui-updates)
Обновите env локально и на Vercel, затем redeploy.
- Локально: `.env` (серверные) и `.env.local` (клиентские `NEXT_PUBLIC_*`).
- Vercel: → Project → Settings → Environment Variables.
```
SUPABASE_URL                    = <Project URL>
SUPABASE_ANON_KEY               = <anon>
SUPABASE_SERVICE_ROLE_KEY       = <service_role>
NEXT_PUBLIC_SUPABASE_URL        = <Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY   = <anon>
```
(могу вписать сам в `.env`/`.env.local`, когда пришлёте ключи.)

### Шаг 7. Настроить Auth в новом проекте
- **Google OAuth**: → https://supabase.com/dashboard/project/_/auth/providers → Google → включить, вставить Client ID/Secret (из Google Cloud Console; там же в Authorized redirect URIs должен быть `https://<новый-проект>.supabase.co/auth/v1/callback`).
- **URL Configuration**: → https://supabase.com/dashboard/project/_/auth/url-configuration
  - **Site URL** = продакшен-домен.
  - **Redirect URLs** — добавьте Vercel-превью с вайлдкардом (иначе логин будет кидать не туда):
    ```
    https://dream-weaver-git-ui-updates-rustams-projects-6781ebeb.vercel.app/**
    https://dream-weaver-*-rustams-projects-6781ebeb.vercel.app/**
    http://localhost:3000/**
    ```
- **Email templates** (сброс пароля и подтверждение): → https://supabase.com/dashboard/project/_/auth/templates

### Шаг 8. Проверка
Вход → генерация → `/history` → `/admin` (под супер-админ-почтой) → `/billing`.

---

## Важные предупреждения
- **service_role ключ — секретный**, только в серверные env, никогда в `NEXT_PUBLIC_*`.
- Типы в `extra_tables.sql` выведены из CSV — если у вас есть оригинальный DDL тех таблиц, используйте его.
- Ротация: старые ключи из `HANDOVER.md`/`.env` считать скомпрометированными.
- Google OAuth `redirectTo` уже берёт `window.location.origin` в коде — важно только прописать Redirect URLs в Supabase (Шаг 7).
