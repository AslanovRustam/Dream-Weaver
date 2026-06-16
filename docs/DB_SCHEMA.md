# Схема БД — Dream Weaver Studio

> AI-генератор **баннеров**. БД — Supabase Postgres. Аутентификация в `auth.users` (Supabase Auth), здесь только прикладные таблицы, RLS, функции и триггеры.
>
> Источник истины — миграции `supabase/migrations/0001`…`0005`. Все прикладные таблицы живут в схеме `public` и имеют **включённый RLS** (`enable row level security`), то есть действует принцип **deny-by-default**: без подходящей policy строка не видна и не изменяема. `service_role`-ключ (серверный) RLS обходит.

---

## Список миграций

| Файл | Что делает |
|------|-----------|
| `0001_init.sql` | Базовая схема: `profiles`, `pricing_coefficients`, `credit_transactions`, `generations`; хелперы `is_super_admin`/`is_caller_super_admin`/`tg_set_updated_at`, триггер автосоздания профиля `handle_new_user`; RPC `admin_grant_credits`, `spend_credits`; RLS и грэнты. |
| `0002_history_feature.sql` | Фича истории: таблицы `generation_cards`, `app_settings`, `audit_logs`, `system_logs`; расширение `generations` (карточка, FTP, upload_status); полнотекстовый поиск (`pg_trgm`, tsvector + триггер); RPC `touch_card_activity`, `soft_delete_card`, `restore_card`, `admin_set_setting`, `cleanup_expired_logs`, `hard_delete_card`; RLS и грэнты. |
| `0003_fix_service_role_check.sql` | Багфикс: в `cleanup_expired_logs`/`hard_delete_card` проверка `current_user <> 'service_role'` всегда отклоняла вызов (под `SECURITY DEFINER` `current_user` = владелец функции). Заменено на `session_user`. |
| `0004_use_auth_role.sql` | Тот же багфикс доведён до конца: `session_user` на Supabase резолвится в `authenticator`, а не в роль из JWT. Заменено на `auth.role()` (для серверных вызовов возвращает строку `'service_role'`). |
| `0005_rbac_foundation.sql` | Фундамент RBAC: колонки `profiles.role` + `profiles.tier` (TEXT, без CHECK); сидинг существующих супер-админов по email; `is_super_admin` теперь учитывает `role='superadmin'` (мост к SEC-M1); `revoke update (role, tier, credits_balance)` у `authenticated` (defense-in-depth, закрывает SEC-L1); RPC `admin_set_user_role` (superadmin-only, self-protect, audit). |

---

## Таблицы

### `profiles` — профиль пользователя + баланс + RBAC-роль/tier
`0001_init.sql:46`, расширена в `0005_rbac_foundation.sql:15`. Строка создаётся автоматически триггером `on_auth_user_created` при появлении `auth.users` (`0001_init.sql:90`).

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | uuid PK → `auth.users(id)` ON DELETE CASCADE | Тот же id, что и в Supabase Auth. |
| `email` | text NOT NULL | Email (дублируется из `auth.users` для индекса/поиска). |
| `first_name` | text NOT NULL default `''` | Имя (из OAuth `given_name`/метаданных). |
| `last_name` | text NOT NULL default `''` | Фамилия (из OAuth `family_name`). |
| `nickname` | text NOT NULL default `''` | Никнейм. |
| `phone` | text NOT NULL default `''` | Телефон. |
| `contact` | text NOT NULL default `''` | Доп. канал связи (telegram и т.п.). |
| `credits_balance` | numeric(20,4) NOT NULL default `0` | Баланс кредитов. Меняется только через RPC (`spend_credits`/`admin_grant_credits`); прямой UPDATE у `authenticated` отозван (`0005:65`). |
| `role` | text NOT NULL default `'user'` | **Staff-роль** (capability-ось): `user`/`tester`/`support`/`moderator`/`admin`/`superadmin`. Без CHECK — валидируется в коде (`rbac.ts`) и в RPC. Индекс `profiles_role_idx` (partial `role <> 'user'`). |
| `tier` | text NOT NULL default `'regular'` | **Биллинг-tier** (entitlement-ось): `regular`/`pro`/`corporate`. Индекс `profiles_tier_idx` (partial `tier <> 'regular'`). |
| `created_at` | timestamptz NOT NULL default `now()` | Создан. |
| `updated_at` | timestamptz NOT NULL default `now()` | Обновлён (триггер `profiles_updated_at`). |

Индексы: `profiles_email_idx (lower(email))`, `profiles_role_idx`, `profiles_tier_idx`.

### `pricing_coefficients` — коэффициенты ценообразования (редактируются в админке)
`0001_init.sql:100`. Формула: `credits = tokens * coefficient`. Дефолт `0.001` держит баланс в «человеческих» числах. Сидируются дефолты для `gpt-image-2`, `gemini-nano` (low/medium/high) и `gpt-4o-mini`/`standard` (добавлен в `0002:230` под AI-нейминг и vision-pre-pass).

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | bigserial PK | — |
| `model` | text NOT NULL | Модель (`gpt-image-2` / `gemini-nano` / `gpt-4o-mini`). |
| `quality` | text NOT NULL | Качество (`low`/`medium`/`high`/`standard`). |
| `coefficient` | numeric(20,8) NOT NULL default `0.001` | Множитель токены→кредиты. |
| `updated_at` | timestamptz NOT NULL default `now()` | Триггер `pricing_coefficients_updated_at`. |
| `updated_by` | uuid → `auth.users(id)` | Кто менял. |

Уникальность: `unique(model, quality)`.

### `credit_transactions` — леджер всех изменений баланса
`0001_init.sql:129`. Пишется **только** через `SECURITY DEFINER` RPC (`spend_credits`, `admin_grant_credits`) — INSERT-policy намеренно отсутствует.

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | bigserial PK | — |
| `user_id` | uuid NOT NULL → `auth.users(id)` ON DELETE CASCADE | Владелец баланса. |
| `delta` | numeric(20,4) NOT NULL | Изменение: «+» = начисление, «−» = списание. |
| `reason` | text NOT NULL | `admin_grant` / `generation` / `admin_adjust` / `refund`. |
| `meta` | jsonb NOT NULL default `{}` | Произвольный контекст. |
| `admin_id` | uuid → `auth.users(id)` | Кто начислил (для admin-операций). |
| `created_at` | timestamptz NOT NULL default `now()` | — |

Индекс: `credit_transactions_user_idx (user_id, created_at desc)`.

### `generations` — лог одного вызова генерации (токены, стоимость, изображение, FTP)
`0001_init.sql:145`, расширена в `0002_history_feature.sql:150`. Одна карточка истории (`generation_cards`) = один мастер + N ресайзов; каждый ресайз/мастер — строка `generations`.

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | bigserial PK | — |
| `user_id` | uuid NOT NULL → `auth.users(id)` ON DELETE CASCADE | Владелец. |
| `model`, `quality` | text NOT NULL | Модель и качество. |
| `tokens_input_text` / `tokens_input_image` / `tokens_output` / `total_tokens` | integer NOT NULL default `0` | Разбивка токенов. |
| `cost_usd` | numeric(20,6) NOT NULL default `0` | Стоимость в USD. |
| `cost_credits` | numeric(20,4) NOT NULL default `0` | Стоимость в кредитах. |
| `meta` | jsonb NOT NULL default `{}` | Контекст. |
| `created_at` | timestamptz NOT NULL default `now()` | — |
| `card_id` | uuid → `generation_cards(id)` ON DELETE CASCADE | Карточка истории (NULL для legacy). |
| `is_master` | boolean NOT NULL default `false` | Это мастер-изображение карточки. |
| `public_id` | uuid NOT NULL default `gen_random_uuid()` | Публичный id (для ссылок/URL). |
| `image_url` | text | URL изображения. |
| `ftp_path` | text | Путь на FTP. |
| `filename` | text | Имя файла. |
| `width` / `height` | integer | Размеры. |
| `upload_status` | text NOT NULL default `'legacy'` | `legacy`/`pending`/`success`/`failed`. |
| `upload_attempts` | integer NOT NULL default `0` | Счётчик попыток FTP. |
| `next_retry_at` | timestamptz | Когда повторить FTP-аплоад. |
| `last_error` | text | Последняя ошибка аплоада. |
| `deleted_at` | timestamptz | Soft-delete. |

Индексы: `generations_user_idx`, `generations_card_idx`, `generations_card_master_idx`, `generations_pending_upload_idx` (partial `upload_status='pending'`), `generations_public_id_idx`.

### `generation_cards` — единица истории (один мастер + N ресайзов)
`0002_history_feature.sql:64`. Поле `search_tsv` поддерживается триггером (russian + simple словари, см. `cards_build_search_tsv`).

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | uuid PK default `gen_random_uuid()` | — |
| `user_id` | uuid NOT NULL → `auth.users(id)` ON DELETE CASCADE | Владелец. |
| `name` | text NOT NULL default `'Без названия'` | Название (может генерироваться AI). |
| `preset_id` | text NOT NULL default `''` | Пресет. |
| `form_snapshot` | jsonb NOT NULL default `{}` | Снимок формы (без base64). |
| `inspired_by_card_id` | uuid → `generation_cards(id)` ON DELETE SET NULL | «Вдохновлено» другой карточкой. |
| `is_favorite` | boolean NOT NULL default `false` | Избранное. |
| `created_at` | timestamptz NOT NULL default `now()` | — |
| `last_activity_at` | timestamptz NOT NULL default `now()` | Последняя активность (bump через `touch_card_activity`). |
| `expires_at` | timestamptz NOT NULL default `now()+12mo` | Когда карточка истекает (TTL из `retention_cards_months`). |
| `deleted_at` | timestamptz | Soft-delete (корзина/grace). |
| `hard_delete_after` | timestamptz | `now()+grace_hours` при soft-delete. |
| `search_tsv` | tsvector | Полнотекстовый индекс (GIN `cards_search_idx`). |

Индексы: `cards_user_activity_idx`, `cards_user_favorites_idx`, `cards_expires_idx`, `cards_hard_delete_idx`, `cards_inspired_by_idx`, `cards_search_idx (gin)` — все partial по `deleted_at`/`is_favorite`.

### `app_settings` — рантайм-конфиг (редактируется админом)
`0002_history_feature.sql:19`. Единый источник тюнаблов, API читает отсюда. Сидируется набором ключей (retention, FTP-ретраи, форматы, лимиты, AI-нейминг). Запись — только через `admin_set_setting`.

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `key` | text PK | Ключ настройки. |
| `value` | jsonb NOT NULL | Значение. |
| `description` | text NOT NULL default `''` | Описание (для админки). |
| `updated_by` | uuid → `auth.users(id)` | Кто менял. |
| `updated_at` | timestamptz NOT NULL default `now()` | Триггер `app_settings_updated_at`. |

Сидируемые ключи (значения по умолчанию): `retention_cards_months=12`, `retention_logs_days=90`, `retention_audit_days=-1` (никогда), `card_delete_grace_hours=24`, `ftp_retry_max_attempts=100`, `ftp_retry_max_hours=72`, `crash_recovery_interval_minutes=2`, `resize_format="png"`, `bulk_zip_max_cards=20`, `history_page_size=20`, `ai_naming_enabled=true`, `ai_naming_model="gpt-4o-mini"`.

### `audit_logs` — аудит безопасности/админ/биллинг (долгое хранение)
`0002_history_feature.sql:184`. Пишется из RPC (`soft_delete_card`, `restore_card`, `admin_set_setting`, `admin_set_user_role`) и из `service_role`. По умолчанию **не чистится** (`retention_audit_days=-1`).

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | uuid PK default `gen_random_uuid()` | — |
| `user_id` | uuid → `auth.users(id)` ON DELETE SET NULL | Кто сделал. |
| `target_user_id` | uuid → `auth.users(id)` ON DELETE SET NULL | Над кем. |
| `action` | text NOT NULL | Напр. `card.soft_deleted`, `settings.updated`, `user.role_changed`. |
| `resource_type` | text | `card` / `generation` / `user` / `setting`. |
| `resource_id` | text | Id ресурса. |
| `details` | jsonb NOT NULL default `{}` | `{old_value, new_value, reason, …}`. |
| `ip_address` | inet | IP. |
| `user_agent` | text | UA. |
| `created_at` | timestamptz NOT NULL default `now()` | — |

Индексы: `audit_user_idx`, `audit_target_idx`, `audit_action_idx`, `audit_resource_idx`, `audit_created_idx`.

### `system_logs` — техлоги (ошибки, FTP, cron)
`0002_history_feature.sql:206`. Запись из `service_role`. Чистится кроном по `retention_logs_days` (дефолт 90 дней).

| Колонка | Тип | Назначение |
|---------|-----|-----------|
| `id` | bigserial PK | — |
| `level` | text NOT NULL | `error`/`warn`/`info`/`debug`. |
| `category` | text NOT NULL | `ftp`/`image-gen`/`auth`/`cron`/`api`/`admin`. |
| `message` | text NOT NULL | Сообщение. |
| `context` | jsonb NOT NULL default `{}` | Контекст. |
| `user_id` | uuid → `auth.users(id)` ON DELETE SET NULL | Связанный юзер. |
| `request_id` | text | Трассировка запроса. |
| `duration_ms` | integer | Длительность. |
| `error_stack` | text | Стек ошибки. |
| `created_at` | timestamptz NOT NULL default `now()` | — |

Индексы: `logs_level_time_idx`, `logs_category_time_idx`, `logs_user_time_idx`, `logs_request_idx`, `logs_created_idx`.

---

## RLS-политики (кто что может)

Везде **deny-by-default**: RLS включён, перечислены только разрешающие policy. `service_role` (серверный ключ) обходит RLS целиком — поэтому INSERT/DELETE, не имеющие policy, делаются с сервера.

| Таблица | Policy | Команда | Кому / условие |
|---------|--------|---------|----------------|
| `profiles` | `profiles_select_self` | SELECT | свой ряд (`auth.uid() = id`) |
| `profiles` | `profiles_select_admin` | SELECT | супер-админ (`is_caller_super_admin()`) — видит всех |
| `profiles` | `profiles_update_self` | UPDATE | свой ряд; **WITH CHECK** не даёт менять `credits_balance` (`0001:257`). Доп. защита: `revoke update (role, tier, credits_balance)` на уровне грэнтов (`0005:65`) |
| `profiles` | `profiles_update_admin` | UPDATE | супер-админ — апдейт любого ряда |
| `pricing_coefficients` | `pricing_select_auth` | SELECT | любой `authenticated` (фронту нужно показывать «во сколько обойдётся генерация») |
| `pricing_coefficients` | `pricing_modify_admin` | ALL | супер-админ (read+write) |
| `credit_transactions` | `ct_select_self` | SELECT | свои (`auth.uid() = user_id`) |
| `credit_transactions` | `ct_select_admin` | SELECT | супер-админ |
| | *(INSERT)* | — | **нет policy** — только через RPC `spend_credits`/`admin_grant_credits` |
| `generations` | `gen_select_self` | SELECT | свои |
| `generations` | `gen_select_admin` | SELECT | супер-админ |
| `generations` | `gen_update_admin` | UPDATE | супер-админ (нужно для апдейта `upload_status` и т.п.; обычно делается `service_role`) |
| | *(INSERT/DELETE)* | — | **нет policy** — через `service_role` |
| `generation_cards` | `cards_select_self` | SELECT | свои (включая лежащие в корзине/grace) |
| `generation_cards` | `cards_select_admin` | SELECT | супер-админ |
| `generation_cards` | `cards_update_self` | UPDATE | свои; грэнт ограничен колонками `update (name, is_favorite)` (`0002:513`) |
| `generation_cards` | `cards_update_admin` | UPDATE | супер-админ |
| | *(INSERT/DELETE)* | — | **нет policy** — только через `service_role` / RPC |
| `app_settings` | `settings_select_auth` | SELECT | любой `authenticated` (фронту нужны лимиты) |
| | *(write)* | — | только через RPC `admin_set_setting` |
| `audit_logs` | `audit_select_admin` | SELECT | супер-админ; остальные не видят ничего |
| | *(write)* | — | через RPC или `service_role` |
| `system_logs` | `logs_select_admin` | SELECT | супер-админ |
| | *(write)* | — | `service_role` |

> Прим.: «супер-админ» в policy = функция `is_caller_super_admin()`. После миграции `0005` она истинна, если у профиля `role='superadmin'` **или** email в bootstrap-списке (см. `is_super_admin` ниже). Это даёт RLS-уровню те же права, что и серверным проверкам.

---

## RPC-функции

Все «опасные» RPC помечены `SECURITY DEFINER set search_path = public` — выполняются с правами владельца функции (обходя RLS), но внутри сами проверяют вызывающего через `is_caller_super_admin()` / `auth.role()` / `auth.uid()`. Это позволяет писать в таблицы без INSERT-policy и держать привилегии в одном месте.

| RPC | Сигнатура | SECURITY DEFINER | Кто вызывает (grant) | Что делает |
|-----|-----------|:---:|----------------------|-----------|
| `is_super_admin` | `(p_email text) → boolean` | нет (`stable`) | `authenticated`, `anon` | Единый источник истины «супер-админ ли email». После `0005`: email в хардкод-списке **ИЛИ** `exists profiles where email=… and role='superadmin'`. Email-fallback = защита от само-локаута до раздачи ролей. `0001:14` → переопределена в `0005:41`. |
| `is_caller_super_admin` | `() → boolean` | нет (`stable`) | `authenticated` | Удобная обёртка: `is_super_admin(auth.jwt()->>'email')`. Используется во всех admin-policy и admin-RPC. `0001:26`. |
| `spend_credits` | `(p_user uuid, p_amount numeric, p_meta jsonb default '{}') → numeric` | **да** | `service_role` | Атомарное списание с сервера (из `generate-image`). Никогда не уводит баланс ниже нуля (UPDATE с `credits_balance >= p_amount`, иначе `insufficient_credits`/`P0001`). Пишет строку в `credit_transactions` (reason `generation`). Возвращает новый баланс. `0001:206`. |
| `admin_grant_credits` | `(p_target_user uuid, p_delta numeric, p_reason text default 'admin_grant', p_meta jsonb default '{}') → numeric` | **да** | `authenticated` (внутри — гейт супер-админа) | Начисление/корректировка баланса админом. Требует `is_caller_super_admin()` (иначе `42501`), `delta<>0`. Атомарно: UPDATE баланса + INSERT в `credit_transactions` с `admin_id=auth.uid()`. `0001:167`. |
| `admin_set_user_role` | `(p_target_user uuid, p_role text default null, p_tier text default null) → public.profiles` | **да** | `authenticated` (внутри — гейт супер-админа) | Назначение staff-роли и/или billing-tier (null = не менять). Требует `is_caller_super_admin()`. **Self-protect:** нельзя разжаловать себя (`cannot_demote_self`/`P0001`) и нельзя снять роль у другого супер-админа (`cannot_demote_other_superadmin`/`P0001`). Пишет `audit_logs` (`user.role_changed`, old/new role+tier). `0005:68`. |
| `touch_card_activity` | `(p_card_id uuid) → timestamptz` | **да** | `service_role` | Bump `last_activity_at=now()` и пересчёт `expires_at` по `retention_cards_months` для не-удалённой карточки. Возвращает новый `expires_at`. ⚠ Без проверки владельца (см. SEC-M2 в PLAN.md). `0002:239`. |
| `soft_delete_card` | `(p_card_id uuid) → void` | **да** | `authenticated` | Помечает карточку удалённой (`deleted_at=now()`) и ставит `hard_delete_after=now()+grace_hours` (`card_delete_grace_hours`). Разрешено владельцу или супер-админу (иначе `42501`). Пишет `audit_logs` (`card.soft_deleted`). `0002:271`. |
| `restore_card` | `(p_card_id uuid) → void` | **да** | `authenticated` | Отмена soft-delete в окне grace. Владелец или супер-админ; если `hard_delete_after < now()` → `grace_period_expired`/`P0001`. Пишет `audit_logs` (`card.restored`). `0002:313`. |
| `hard_delete_card` | `(p_card_id uuid) → void` | **да** | `service_role` | Финальное удаление из БД (CASCADE снесёт связанные `generations`). Вызывается Node-кроном **после** физического удаления файлов с FTP. Гейт: `auth.role() <> 'service_role'` → `42501` (исправлено в `0003`→`0004`; изначально `current_user`/`session_user` ломали проверку). `0002:437` → `0004:51`. |
| `admin_set_setting` | `(p_key text, p_value jsonb) → void` | **да** | `authenticated` (внутри — гейт супер-админа) | Обновление `app_settings`. Требует `is_caller_super_admin()`; неизвестный ключ → `unknown_setting_key`/`P0002`. Пишет `audit_logs` (`settings.updated`, old/new). `0002:353`. |
| `cleanup_expired_logs` | `() → jsonb` | **да** | `service_role`, `authenticated` (внутри — гейт) | Cron-чистка `system_logs` (по `retention_logs_days`) и `audit_logs` (по `retention_audit_days`, при `-1` не трогает). Гейт: `is_caller_super_admin()` **ИЛИ** `auth.role()='service_role'`. Возвращает счётчики удалённого + `ran_at`. ⚠ Удаляет только логи в БД; файлы на FTP чистит Node-крон. `0002:393` → `0004:11`. |

### Прочие триггерные функции (не RPC, для полноты)
- `tg_set_updated_at()` — авто-`updated_at` (`0001:35`); триггеры на `profiles`, `pricing_coefficients`, `app_settings`.
- `handle_new_user()` — `SECURITY DEFINER`, создаёт `profiles` для каждого нового `auth.users` (берёт имя/фамилию/ник из OAuth-метаданных), `on conflict do nothing` (`0001:67`).
- `cards_build_search_tsv()` / `tg_cards_search_tsv()` — собирают `search_tsv` карточки из `name`+`preset_id`+строк `form_snapshot` (словари russian+simple) (`0002:105`).

---

## Бэклог / связанные находки

Полный бэклог — `ban_gen_web/PLAN.md`. Релевантное для схемы:
- **SEC-M1 (дрейф super-admin):** хардкод-список email задублирован в TS (`auth-server.ts`) и SQL (`0001`/`0005`); при пересборке БД только из `migrations/` власть может «расщепиться». `0005` навёл мост (роль в БД), но полная развязка ещё в работе (см. ADM-RBAC-1/ADM-USER-2).
- **SEC-M2 (IDOR):** `touch_card_activity` не проверяет владельца `card_id`.
- **SEC-L1 (закрыт `0005`):** `credits_balance` теперь защищён column-REVOKE, а не только тонким RLS WITH CHECK.
