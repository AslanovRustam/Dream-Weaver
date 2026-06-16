# ADMIN — админ-панель и личный кабинет

> Dream Weaver Studio — AI-генератор **баннеров**.
> Документ описывает, **что реально умеет** админка и кабинет **сегодня** (по коду), как
> это гейтится и чего пока нет. Пути от корня `ban_gen_web/`, ссылки в формате `файл:строка`.
> Бэклог по доработкам — `PLAN.md` §6.

---

## 1. Точки входа

| Маршрут | Файл | Доступ | Назначение |
|---|---|---|---|
| `/admin` | `src/routes/admin.tsx:37` | super-admin | Панель из 5 вкладок |
| `/account` | `src/routes/account.tsx:18` | любой аутентифицированный | Личный кабинет |

Ссылка «Админка» в шапке кабинета показывается только при `is_super_admin` (`account.tsx:86`).
Из админки есть кнопки «К генерации» и «Кабинет» (`admin.tsx:178-185`).

---

## 2. Как гейтится доступ

Два слоя — клиентский (косметика) и серверный (настоящая стена).

**Клиент (только прячет UI).** `/admin` при монтировании дёргает `GET /api/me` и смотрит
`is_super_admin`; при `false` рисует заглушку «доступно только супер-админам»
(`admin.tsx:142-167`). Это **не** защита — комментарий в коде честно говорит: «the API will
refuse anything sensitive with 403 regardless» (`admin.tsx:7-8`).

**Сервер (авторитетно).** Каждый чувствительный хендлер вызывает
`requireSuperAdmin(request)` (`src/lib/auth-server.ts:83`), который:
1. извлекает Bearer-токен и валидирует его через `admin.auth.getUser(token)` —
   payload JWT не доверяется вслепую (`auth-server.ts:61-77`);
2. проверяет email против allow-list `SUPER_ADMIN_EMAILS` (`auth-server.ts:23-33`);
3. кидает `AuthError(403)` для не-админов.

**Bootstrap супер-админа — два пути (см. `auth-server.ts`):**
- email-allow-list `SUPER_ADMIN_EMAILS` — хардкод-список (`auth-server.ts:23`). Помечен как
  TEMP на время переезда на личный Supabase; в нём временно личный gmail (PLAN `SEC-L4`).
- роль `superadmin` в `profiles.role` — через новый RBAC-слой (см. §5). `getUserRole`
  возвращает `superadmin/corporate` для email из bootstrap, даже если колонок `role/tier`
  ещё нет (`auth-server.ts:122-144`).

> Важно: вкладки **Пользователи / Истории / Тарифы(PUT) / Настройки(PUT) / Логи** сейчас
> гейтятся **именно `requireSuperAdmin`** (email-allow-list), а **не** гранулярными
> capability из `rbac.ts`. `requireCapability` уже есть, но в этих маршрутах ещё не
> используется — это следующий шаг (PLAN `ADM-RBAC-1`).

---

## 3. Вкладки админки

`admin.tsx:188-211` — пять вкладок: Пользователи / Истории / Тарифы / Настройки / Логи.

### 3.1 Пользователи (`UsersTab`, `admin.tsx:228`)
- Поиск по email / имени / фамилии / нику, debounce 300 мс (`admin.tsx:237-240`).
- Таблица: email, имя, ник, контакт (или телефон), баланс кредитов (`admin.tsx:305-324`).
- Кнопка «Кредиты» открывает диалог изменения баланса (`CreditDialog`, `admin.tsx:342`).
- Грант/снятие: поле `delta` (положительное — выдать, отрицательное — снять) + необязательный
  комментарий; шлёт `POST /api/admin/credits` (`admin.tsx:404-417`).

**API:**
| Эндпоинт | Файл | Доступ | Поведение |
|---|---|---|---|
| `GET /api/admin/users` | `src/routes/api/admin/users.ts:12` | super-admin | `ilike` по email/имени/фамилии/нику; `limit` 1..200 (деф. 50); пагинация range/offset; спецсимволы `%_` экранируются (`users.ts:32`) |
| `POST /api/admin/credits` | `src/routes/api/admin/credits.ts:23` | super-admin | Атомарная правка баланса |

**Списание кредитов — детали (`credits.ts`):**
- `delta` обязателен, ненулевой, `|delta| ≤ 10_000_000` (`credits.ts:36-41`).
- Уход в минус **разрешён** админу (clawback) — это отдельный путь от пользовательского
  списания (`credits.ts:6-8`).
- RPC `admin_grant_credits` вызывается **от имени пользователя** (`getUserClient(accessToken)`),
  а не через service_role: функция проверяет `auth.jwt()->>'email'` против allow-list, а у
  service_role нет email-claim. `SECURITY DEFINER` даёт функции права обновить `profiles` и
  записать аудит в `credit_transactions` (`credits.ts:44-58`).
- В meta пишется `note` (cap 500) и `admin_email` (`credits.ts:54-57`).

### 3.2 Истории (`UserHistoriesTab`, `admin.tsx:1377`)
**Чисто read-only просмотр** карточек любого пользователя — никакого редактирования/удаления
(деструктив остаётся на собственной `/history` юзера, `admin.tsx:1335-1341`).
- Слева — поиск+выбор пользователя (тот же `GET /api/admin/users`), справа — сетка карточек.
- Переключатель «Активные / Корзина» (`bucket=active|trash`, `admin.tsx:1528-1549`).
- Клик по карточке → диалог с мастером и ресайзами (`AdminCardDetailDialog`, `admin.tsx:1613`).

**API:** `GET /api/admin/history` (`src/routes/api/admin/history.ts:38`), super-admin.
- Через service-role (RLS обходится осознанно), фильтрация по произвольному `user_id`
  (`history.ts:5-6`).
- Режимы: список карточек (`listHistoryCards`) и деталь карточки по `card_id` (`getHistoryCard`).
- **Каждый просмотр пишется в `audit_logs`** с `action = admin.viewed_user_history` — чтобы
  отвечать «кто на кого смотрел» (`history.ts:16-33, 57, 69-73`).

### 3.3 Тарифы (`PricingTab`, `admin.tsx:437`)
- Коэффициенты тарификации per (`model`, `quality`); группировка по модели, порядок
  `low/medium/high` (`admin.tsx:461-472`).
- Формула: `credits = total_tokens × coefficient`; меняется **без редеплоя** (`admin.tsx:478-481`).
- Сохранение — один `PUT` всем набором (`admin.tsx:525-533`).

**API:** `GET/PUT /api/admin/pricing` (`src/routes/api/admin/pricing.ts:18`).
- `GET` — для **любого аутентифицированного** (UI хочет показать «эта генерация ~ N кредитов»,
  `pricing.ts:21-24`). `PUT` — только super-admin (`pricing.ts:45`).
- Валидация `PUT`: ≤50 строк; `quality ∈ {low,medium,high}`; `coefficient` конечный, `0..1000`
  (`pricing.ts:56-85`). Upsert по `onConflict: "model,quality"`, пишется `updated_by/updated_at`.

> Текущие коэффициенты — заглушки `0.001` (PLAN §2, `SEC-M5`): дают «пристойные целые»
> кредиты, но это не реальная цена.

### 3.4 Настройки (`SettingsTab`, `admin.tsx:553`)
12 ключей `app_settings`, сгруппированы по 5 секциям (`SETTING_SPECS`, `admin.tsx:84-133`).
Каждое изменение пишется в `audit_logs` (`admin.tsx:626-628`). UI считает «грязные» поля и
показывает «Сохранить (N)» + «отменить» — единственное место с dirty-diff (PLAN `ADM-CONFIRM-1`).

| Ключ | Группа | Тип | Заметка |
|---|---|---|---|
| `retention_cards_months` | Сроки хранения | number 1..120 | срок жизни карточек |
| `retention_logs_days` | Сроки хранения | number 1..3650 | срок жизни `system_logs` |
| `retention_audit_days` | Сроки хранения | number/never | `-1` = никогда не чистить |
| `card_delete_grace_hours` | Сроки хранения | number 1..720 | окно восстановления удалённой карточки |
| `ftp_retry_max_attempts` | FTP / ретраи | number 1..10000 | макс. попыток FTP-аплоада |
| `ftp_retry_max_hours` | FTP / ретраи | number 1..720 | дедлайн FTP-ретраев |
| `crash_recovery_interval_minutes` | FTP / ретраи | number 1..1440 | **требует рестарт сервера** |
| `resize_format` | Формат вывода | enum `png/jpg90/jpg95` | master всегда PNG |
| `bulk_zip_max_cards` | Лимиты | number 1..200 | макс. карточек в bulk-ZIP |
| `history_page_size` | Лимиты | number 1..100 | размер страницы истории |
| `ai_naming_enabled` | AI-имена | boolean | AI-имена карточек |
| `ai_naming_model` | AI-имена | string 1..60 | модель для AI-имён |

**API:** `GET/PUT /api/admin/settings` (`src/routes/api/admin/settings.ts:83`).
- `GET` — любому аутентифицированному (клиент зеркалит лимиты, напр. `bulk_zip_max_cards`,
  `settings.ts:84-88`). `PUT` — super-admin.
- Валидация per-key **до** записи: неизвестный ключ → 400; невалидное значение → 400;
  «fail fast, не применяем половину» (`settings.ts:26-39, 121-134`).
- Запись — через `admin_set_setting` (`SECURITY DEFINER`) от имени пользователя (тот же приём,
  что и `credits`): по строке на ключ, каждая пишет аудит (`settings.ts:136-149`).
- Часть параметров (интервал воркера, формат ресайзов) применяется только после
  рестарта/следующей генерации (`admin.tsx:627-628`).

### 3.5 Логи (`LogsTab`, `admin.tsx:788`)
Три под-вкладки (`admin.tsx:790-794`):

| Под-вкладка | Источник | Что показывает | Фильтры |
|---|---|---|---|
| **Система** (`SystemLogsView`) | `system_logs` | техника: errors, FTP, retention, auth и т.д. | level (`error/warn/info/debug`), category (`ftp/image-gen/auth/cron/api/admin`), поиск по `message` (ILIKE) |
| **Аудит** (`AuditLogsView`) | `audit_logs` | действия пользователей/админов | `action` (напр. `card.deleted`, `admin.viewed_user_history`) |
| **Токены** (`TokensLogsView`) | `system_logs` (срез) | расход токенов и кредитов по каждой генерации | тип события (Мастер/Ресайз/Vision/AI-нейминг) |

- Раскрываемые строки: система показывает `context/error_stack/user_id/request_id/duration_ms`;
  аудит — `user_id/target_user_id/details/ip_address/user_agent` (`admin.tsx:948-962, 1059-1073`).
- «Токены» — не отдельная таблица, а срез `system_logs` по `category ∈ {image-gen, ai-naming}`
  и фиксированному набору `message` (`logs.ts:48-77`). Считает суммы токенов и кредитов по
  загруженной странице (`admin.tsx:1157-1158`).
- Пагинация — «Загрузить ещё» (offset/limit, лимит 50 на запрос, max 200, `logs.ts:25, 39-43`).

**API:** `GET /api/admin/logs?kind=system|audit|tokens` (`src/routes/api/admin/logs.ts:30`),
super-admin. Общие параметры: `since` (ISO), `offset`, `limit`.

---

## 4. Личный кабинет `/account`

`src/routes/account.tsx`. Требует аутентификации (иначе редирект на `/login`, `account.tsx:45-48`).
Данные тянет из `GET /api/me` (`account.tsx:52`). Раскладка: слева профиль, справа баланс +
смена пароля + выход.

| Блок | Компонент | Что делает |
|---|---|---|
| Профиль | `ProfileCard` (`account.tsx:126`) | Имя, фамилия, ник, телефон, контакт. Email **read-only** (привязан к аккаунту, `account.tsx:141`). Сохранение — `PATCH /api/me` |
| Баланс | `BalanceCard` (`account.tsx:246`) | Read-only баланс кредитов. Подпись «Кредиты выдаёт администратор. Пополнение придёт позже» (`account.tsx:257-259`) |
| Смена пароля | `PasswordCard` (`account.tsx:265`) | Новый пароль min 8 + повтор; `POST /api/auth/change-password`; после успеха `refreshSession()`. Для Google-входа просто добавляет пароль (`account.tsx:275, 283-298`) |
| Выход | кнопка в шапке (`account.tsx:91-100`) | `signOut()` → `/login` |

**Смена пароля (`src/routes/api/auth/change-password.ts`):** `requireUser` (только себе),
длина 8..128, обновление через `admin.auth.admin.updateUserById` (`change-password.ts:25-43`).
⚠️ **Без реаутентификации / текущего пароля** — см. PLAN `SEC-M3` / `CAB-SEC-2`.

---

## 5. RBAC-слой (новый, фундамент)

`src/lib/rbac.ts` — единый источник правды по ролям/правам. Две ортогональные оси (`rbac.ts:12-15`):
- **Роль (staff capability)** — `user · tester · support · moderator · admin · superadmin`
  (`rbac.ts:17-24`). Хранится в `profiles.role`.
- **Tier (billing entitlement)** — `regular · pro · corporate` (`rbac.ts:27`). Хранится в
  `profiles.tier`. «Корпоративный клиент» = tier, не роль. Драйвит приоритет очереди (PLAN `QUEUE-1`).

**Capabilities** (`rbac.ts:45-58`): `users.view/edit/ban`, `credits.grant`, `roles.assign`,
`settings.edit`, `pricing.edit`, `keys.manage`, `logs.view`, `history.view_any`, `impersonate`,
`stats.view`. Матрица `ROLE_CAPABILITIES` (`rbac.ts:63-82`); `superadmin` = всё.
Проверка — `can(role, cap)` (`rbac.ts:98`); ранги для guard'ов «нельзя действовать на равного/выше»
— `ROLE_RANK` (`rbac.ts:34-41`).

Серверная обвязка в `auth-server.ts`: `getUserRole` (читает `profiles.role/tier`, с фоллбэком на
email-bootstrap до миграции, `:122`), `requireCapability(request, cap)` (`:151`).

### `/api/admin/role` (новый эндпоинт)
`POST /api/admin/role { user_id, role?, tier? }` (`src/routes/api/admin/role.ts:23`), **super-admin**.
- Меняет staff-роль и/или billing-tier; передавать только нужное поле (`role.ts:2-5`).
- Валидация: `user_id` обязателен; `role`/`tier` через `isRole`/`isTier`; хотя бы одно поле
  (`role.ts:34-47`).
- Вызывает аудируемый RPC `admin_set_user_role` от имени супер-админа (re-проверка super-admin +
  self-protection на уровне БД); маппинг ошибок: `user_not_found→404`, `forbidden→403`,
  `cannot_*→409` (`role.ts:52-67`).
- **Требует применённой миграции `0005_rbac_foundation.sql`** — иначе RPC отсутствует и
  эндпоинт вернёт 500 (`role.ts:7-8`). Статус миграции на 2026-06-16 — **не подтверждён** (PLAN §0).
- UI-назначения ролей в админке **ещё нет** — эндпоинт есть, кнопок нет (PLAN `ADM-RBAC-1`).

---

## 6. Чего пока НЕТ (и где в плане)

| Не реализовано | Где описано |
|---|---|
| Бан / suspend / disable аккаунта (`users.ban` объявлен, но не задействован) | PLAN `ADM-USER-3` |
| Детальная карточка пользователя (usage-роллап, per-user леджер, сессии) | PLAN `ADM-USER-1`, `ADM-USER-6` |
| Дашборд-статистика (`admin_stats`, активные юзеры, error-rate, FTP-health) | PLAN `ADM-DASH-1` |
| UI назначения ролей/тиров (эндпоинт `/api/admin/role` есть, экрана нет) | PLAN `ADM-RBAC-1` |
| Конфигурируемая матрица прав (capabilities как данные в БД) | PLAN `ADM-RBAC-2` |
| Confirm-with-summary на мутациях (сейчас dirty-diff только в Настройках; гранты без summary) | PLAN `ADM-CONFIRM-1`, `ADM-CREDIT-1` |
| Impersonation «смотреть как юзер» | PLAN `ADM-USER-4` |
| Lifecycle: invite / reset-password / GDPR-delete; гость-инвайты | PLAN `ADM-USER-5`, `ADM-GUEST-1` |
| Пагинация/CSV-экспорт/bulk-гранты в списке юзеров (сейчас лимит 100 без offset-UI) | PLAN `ADM-USER-7` |
| Кабинет: MFA/passkeys, реаутентификация, сессии, экспорт/удаление данных, история использования, top-up | PLAN §6.1 (`CAB-*`) |

Полный бэклог — `PLAN.md` §6 (кабинет/админка) и §1 (безопасность).
