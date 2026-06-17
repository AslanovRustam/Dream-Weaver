# ADMIN — админ-панель и личный кабинет

> Dream Weaver Studio — AI-генератор **баннеров**.
> Документ описывает, **что реально умеет** админка и кабинет **сегодня** (по коду), как
> это гейтится и чего пока нет. Пути от корня `ban_gen_web/`, ссылки в формате `файл:строка`.
> Бэклог по доработкам — `PLAN.md` §6.

---

## 1. Точки входа

| Маршрут | Файл | Доступ | Назначение |
|---|---|---|---|
| `/admin` | `src/routes/admin.tsx:38` | super-admin (косметика) + per-capability на API | Панель из 5 вкладок |
| `/account` | `src/routes/account.tsx:18` | любой аутентифицированный | Личный кабинет |

Ссылка «Админка» в шапке кабинета показывается только при `is_super_admin` (`account.tsx:86`).
Из админки есть кнопки «К генерации» и «Кабинет» (`admin.tsx:182-188`).

---

## 2. Как гейтится доступ

Два слоя — клиентский (косметика) и серверный (настоящая стена).

**Клиент (только прячет UI).** `/admin` при монтировании дёргает `GET /api/me` и смотрит
`is_super_admin`; при `false` рисует заглушку «доступно только супер-админам»
(`admin.tsx:145-170`). Это **не** защита — комментарий в коде честно говорит: «the API will
refuse anything sensitive with 403 regardless» (`admin.tsx:7-8`).

> Важно: `is_super_admin` из `/api/me` — это **email-bootstrap**, а НЕ роль. `/api/me`
> отдаёт `is_super_admin: user.isSuperAdmin` (`me.ts:67`), а `isSuperAdmin` приходит из
> `isSuperAdminEmail(email)` в `requireUser` (`auth-server.ts:74`) — он смотрит только
> на allow-list email, не на `profiles.role`. Поэтому штатный сотрудник с ролью
> `admin` в БД, но **не** в email-списке, увидит заглушку клиента, хотя его
> точечные capability-вызовы API при этом пройдут (см. ниже). Косметику клиента
> на роли пока не перевели.

**Сервер (авторитетно).** Здесь два механизма, оба в `src/lib/auth-server.ts`:

1. `requireSuperAdmin(request)` (`auth-server.ts:83`) — старый «всё-или-ничего» по email:
   валидирует Bearer-токен через `admin.auth.getUser(token)` (payload JWT не доверяется
   вслепую, `:66`), проверяет email против allow-list `SUPER_ADMIN_EMAILS` (`:30-33`),
   кидает `AuthError(403)` для не-админов.
2. `requireCapability(request, cap)` (`auth-server.ts:151`) — **новый гранулярный гейт**.
   Резолвит роль/тариф вызывающего через `getUserRole` (читает `profiles.role/tier`,
   `:122`) и проверяет `can(role, cap)` из `rbac.ts`. Супер-админ (по email-bootstrap
   **или** по роли `superadmin`) держит все capability неявно (`:157`, `can()` в `rbac.ts:99`).

> **Все маршруты `/api/admin/*` теперь гейтятся именно `requireCapability(...)`** — по одной
> capability на ручку, **не** общим `requireSuperAdmin`. Маппинг (см. §3):
> | Ручка | Capability | Строка |
> |---|---|---|
> | `GET /api/admin/users` | `users.view` | `users.ts:14` |
> | `POST /api/admin/credits` | `credits.grant` | `credits.ts:25` |
> | `GET/PUT /api/admin/pricing` (PUT) | `pricing.edit` | `pricing.ts:45` |
> | `GET/PUT /api/admin/settings` (PUT) | `settings.edit` | `settings.ts:106` |
> | `GET /api/admin/logs` | `logs.view` | `logs.ts:32` |
> | `GET /api/admin/history` | `history.view_any` | `history.ts:40` |
> | `POST /api/admin/role` | `roles.assign` | `role.ts:25` |
>
> GET-ручки `pricing`/`settings` остаются на `requireUser` (любой аутентифицированный, см. §3.3/§3.4).

**Bootstrap супер-админа — два пути (см. `auth-server.ts`):**
- email-allow-list `SUPER_ADMIN_EMAILS` — хардкод-список (`auth-server.ts:23`). Помечен как
  TEMP на время переезда на личный Supabase; в нём временно личный gmail (PLAN `SEC-L4`).
- роль `superadmin` в `profiles.role` — через RBAC-слой (см. §5). `getUserRole`
  возвращает `superadmin/corporate` для email из bootstrap, даже если колонок `role/tier`
  ещё нет (`auth-server.ts:140-143`).

---

## 3. Вкладки админки

`admin.tsx:191-214` — пять вкладок: Пользователи / Истории / Тарифы / Настройки / Логи.

### 3.1 Пользователи (`UsersTab`, `admin.tsx:231`)
- Поиск по email / имени / фамилии / нику, debounce 300 мс (`admin.tsx:240-244`).
- Таблица: email, имя, ник, контакт (или телефон), **«Роль · Тариф»**, баланс кредитов
  (`admin.tsx:287-326`). Колонка «Роль · Тариф» рендерит `role` + ` · ` + `tier` из строки
  профиля (`admin.tsx:291`, `:320-323`).
- В строке две кнопки: **«Роль»** (открывает `RoleDialog`) и «Кредиты» (открывает
  `CreditDialog`) — `admin.tsx:327-336`.
- Грант/снятие: поле `delta` (положительное — выдать, отрицательное — снять) + необязательный
  комментарий; шлёт `POST /api/admin/credits` (`admin.tsx:432-439`).

**Назначение роли/тарифа — `RoleDialog` (`admin.tsx:459`):**
- Два `<select>`: «Роль (права)» из `ROLES` и «Тариф (приоритет генерации)» из `TIERS`
  (оба импортированы из `rbac.ts`, `admin.tsx:36`, `:494-521`).
- Диалог считает «грязные» поля (`roleChanged`/`tierChanged`/`dirty`, `:480-482`) и при
  изменении показывает **confirm-summary с диффом** «Будет применено: роль X → Y / тариф
  A → B» (`:523-539`). Кнопка «Применить» дизейблится, пока ничего не изменено (`:548`).
- Шлёт `POST /api/admin/role` **только с изменёнными полями** (`role: roleChanged ? role
  : undefined`, `:554-561`); по успеху перезагружает список.

**API:**
| Эндпоинт | Файл | Capability | Поведение |
|---|---|---|---|
| `GET /api/admin/users` | `src/routes/api/admin/users.ts:12` | `users.view` | `ilike` по email/имени/фамилии/нику; в выборку добавлены `role,tier` (`users.ts:24`); `limit` 1..200 (деф. 50); пагинация range/offset; спецсимволы `%_` экранируются (`users.ts:32`) |
| `POST /api/admin/credits` | `src/routes/api/admin/credits.ts:23` | `credits.grant` | Атомарная правка баланса |
| `POST /api/admin/role` | `src/routes/api/admin/role.ts:23` | `roles.assign` | Назначение роли и/или тарифа (см. §5) |

**Списание кредитов — детали (`credits.ts`):**
- `delta` обязателен, ненулевой, `|delta| ≤ 10_000_000` (`credits.ts:36-41`).
- Уход в минус **разрешён** админу (clawback) — это отдельный путь от пользовательского
  списания (`credits.ts:6-8`).
- RPC `admin_grant_credits` вызывается **от имени пользователя** (`getUserClient(accessToken)`),
  а не через service_role: функция проверяет `auth.jwt()->>'email'` против allow-list, а у
  service_role нет email-claim. `SECURITY DEFINER` даёт функции права обновить `profiles` и
  записать аудит в `credit_transactions` (`credits.ts:44-58`).
- В meta пишется `note` (cap 500) и `admin_email` (`credits.ts:54-57`).

### 3.2 Истории (`UserHistoriesTab`, `admin.tsx:1521`)
**Чисто read-only просмотр** карточек любого пользователя — никакого редактирования/удаления
(деструктив остаётся на собственной `/history` юзера, `admin.tsx:1479-1485`).
- Слева — поиск+выбор пользователя (тот же `GET /api/admin/users`), справа — сетка карточек.
- Переключатель «Активные / Корзина» (`bucket=active|trash`, `admin.tsx:1672-1693`).
- Клик по карточке → диалог с мастером и ресайзами (`AdminCardDetailDialog`, `admin.tsx:1757`).

**API:** `GET /api/admin/history` (`src/routes/api/admin/history.ts:38`), capability
`history.view_any` (`history.ts:40`).
- Через service-role (RLS обходится осознанно), фильтрация по произвольному `user_id`
  (`history.ts:5-6`).
- Режимы: список карточек (`listHistoryCards`) и деталь карточки по `card_id` (`getHistoryCard`).
- **Каждый просмотр пишется в `audit_logs`** с `action = admin.viewed_user_history` — чтобы
  отвечать «кто на кого смотрел» (`history.ts:16-33, 57, 69-73`).

### 3.3 Тарифы (`PricingTab`, `admin.tsx:581`)
- Коэффициенты тарификации per (`model`, `quality`); группировка по модели, порядок
  `low/medium/high` (`admin.tsx:605-616`).
- Формула: `credits = total_tokens × coefficient`; меняется **без редеплоя** (`admin.tsx:622-625`).
- Сохранение — один `PUT` всем набором (`admin.tsx:669-677`).

**API:** `GET/PUT /api/admin/pricing` (`src/routes/api/admin/pricing.ts:18`).
- `GET` — для **любого аутентифицированного** (`requireUser`): UI хочет показать «эта генерация
  ~ N кредитов» (`pricing.ts:24-26`). `PUT` — capability `pricing.edit` (`pricing.ts:45`).
- Валидация `PUT`: ≤50 строк; `quality ∈ {low,medium,high}`; `coefficient` конечный, `0..1000`
  (`pricing.ts:56-85`). Upsert по `onConflict: "model,quality"`, пишется `updated_by/updated_at`.

> Текущие коэффициенты — заглушки `0.001` (PLAN §2, `SEC-M5`): дают «пристойные целые»
> кредиты, но это не реальная цена.

### 3.4 Настройки (`SettingsTab`, `admin.tsx:697`)
12 ключей `app_settings`, сгруппированы по 5 секциям (`SETTING_SPECS`, `admin.tsx:87-128`).
Каждое изменение пишется в `audit_logs` (`admin.tsx:770-771`). UI считает «грязные» поля и
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

**API:** `GET/PUT /api/admin/settings` (`src/routes/api/admin/settings.ts:80`).
- `GET` — любому аутентифицированному (`requireUser`): клиент зеркалит лимиты, напр.
  `bulk_zip_max_cards` (`settings.ts:85-88`). `PUT` — capability `settings.edit` (`settings.ts:106`).
- Валидация per-key **до** записи: неизвестный ключ → 400; невалидное значение → 400;
  «fail fast, не применяем половину» (`settings.ts:26-39, 123-134`).
- Запись — через `admin_set_setting` (`SECURITY DEFINER`) от имени пользователя (тот же приём,
  что и `credits`): по строке на ключ, каждая пишет аудит (`settings.ts:136-149`).
- Часть параметров (интервал воркера, формат ресайзов) применяется только после
  рестарта/следующей генерации (`admin.tsx:770-771`).

### 3.5 Логи (`LogsTab`, `admin.tsx:932`)
Три под-вкладки (`admin.tsx:934-938`):

| Под-вкладка | Источник | Что показывает | Фильтры |
|---|---|---|---|
| **Система** (`SystemLogsView`) | `system_logs` | техника: errors, FTP, retention, auth и т.д. | level (`error/warn/info/debug`), category (`ftp/image-gen/auth/cron/api/admin`), поиск по `message` (ILIKE) |
| **Аудит** (`AuditLogsView`) | `audit_logs` | действия пользователей/админов | `action` (напр. `card.deleted`, `admin.viewed_user_history`) |
| **Токены** (`TokensLogsView`) | `system_logs` (срез) | расход токенов и кредитов по каждой генерации | тип события (Мастер/Ресайз/Vision/AI-нейминг) |

- Раскрываемые строки: система показывает `context/error_stack/user_id/request_id/duration_ms`;
  аудит — `user_id/target_user_id/details/ip_address/user_agent` (`admin.tsx:1092-1106, 1203-1217`).
- «Токены» — не отдельная таблица, а срез `system_logs` по `category ∈ {image-gen, ai-naming}`
  и фиксированному набору `message` (`logs.ts:59-65`). Считает суммы токенов и кредитов по
  загруженной странице (`admin.tsx:1301-1302`).
- Пагинация — «Загрузить ещё» (offset/limit, лимит 50 на запрос, max 200, `logs.ts:39-43`).

**API:** `GET /api/admin/logs?kind=system|audit|tokens` (`src/routes/api/admin/logs.ts:30`),
capability `logs.view` (`logs.ts:32`). Общие параметры: `since` (ISO), `offset`, `limit`.

> Rate-limit на `/api/admin/*` **нет** — троттлинг (`src/lib/request-guard.ts`) навешан только
> на тяжёлые ручки генерации/ресайза (`generate-image`, `extract-master`, `fetch-master`,
> `resize-tile`, `bulk-zip`), см. `docs/GENERATION_FLOW.md`. Кросс-юзер-троттл и шаренный
> стор — QUEUE-1 Ф3.

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

## 5. RBAC-слой

`src/lib/rbac.ts` — единый источник правды по ролям/правам. Две ортогональные оси (`rbac.ts:12-15`):
- **Роль (staff capability)** — `user · tester · support · moderator · admin · superadmin`
  (`rbac.ts:17-24`). Хранится в `profiles.role`.
- **Tier (billing entitlement)** — `regular · pro · corporate` (`rbac.ts:27`). Хранится в
  `profiles.tier`. «Корпоративный клиент» = tier, не роль. Драйвит приоритет очереди (PLAN `QUEUE-1`).

**Capabilities** (`rbac.ts:45-58`): `users.view/edit/ban`, `credits.grant`, `roles.assign`,
`settings.edit`, `pricing.edit`, `keys.manage`, `logs.view`, `history.view_any`, `impersonate`,
`stats.view`. Матрица `ROLE_CAPABILITIES` (`rbac.ts:63-82`); `superadmin` = всё (`:81`).
Проверка — `can(role, cap)` (`rbac.ts:98`); ранги для guard'ов «нельзя действовать на равного/выше»
— `ROLE_RANK` (`rbac.ts:34-41`).

Серверная обвязка в `auth-server.ts`: `getUserRole` (читает `profiles.role/tier`, с фоллбэком на
email-bootstrap до миграции, `:122`), `requireCapability(request, cap)` (`:151`). **Все
`/api/admin/*` уже переведены на `requireCapability`** (таблица в §2).

### `/api/admin/role`
`POST /api/admin/role { user_id, role?, tier? }` (`src/routes/api/admin/role.ts:23`), capability
**`roles.assign`** (`role.ts:25`).
- Меняет staff-роль и/или billing-tier; передавать только нужное поле (`role.ts:2-5`).
- Валидация: `user_id` обязателен; `role`/`tier` через `isRole`/`isTier`; хотя бы одно поле
  (`role.ts:34-47`).
- Вызывает аудируемый RPC `admin_set_user_role` от имени супер-админа (re-проверка super-admin +
  self-protection на уровне БД); маппинг ошибок: `user_not_found→404`, `forbidden→403`,
  `cannot_*→409` (`role.ts:52-67`).
- **Требует применённой миграции `0005_rbac_foundation.sql`** — иначе RPC отсутствует и
  эндпоинт вернёт 500 (`role.ts:7-8`).
- **UI назначения уже есть:** кнопка «Роль» в списке юзеров → `RoleDialog` с confirm-диффом
  (см. §3.1, `admin.tsx:459-576`).

---

## 6. Чего пока НЕТ (и где в плане)

| Не реализовано | Где описано |
|---|---|
| Бан / suspend / disable аккаунта (`users.ban` объявлен, но не задействован) | PLAN `ADM-USER-3` |
| Детальная карточка пользователя (usage-роллап, per-user леджер, сессии) | PLAN `ADM-USER-1`, `ADM-USER-6` |
| Дашборд-статистика (`admin_stats`, активные юзеры, error-rate, FTP-health) | PLAN `ADM-DASH-1` |
| Косметика клиента `/admin` на роли (`is_super_admin` всё ещё email-only, не учитывает `role`) | PLAN `SEC-M1` |
| Конфигурируемая матрица прав (capabilities как данные в БД) | PLAN `ADM-RBAC-2` |
| Confirm-with-summary на всех мутациях (есть в Настройках и в `RoleDialog`; гранты кредитов — без summary) | PLAN `ADM-CONFIRM-1`, `ADM-CREDIT-1` |
| Impersonation «смотреть как юзер» (`impersonate` объявлен, не задействован) | PLAN `ADM-USER-4` |
| Lifecycle: invite / reset-password / GDPR-delete; гость-инвайты | PLAN `ADM-USER-5`, `ADM-GUEST-1` |
| Пагинация/CSV-экспорт/bulk-гранты в списке юзеров (сейчас лимит 100 без offset-UI) | PLAN `ADM-USER-7` |
| Rate-limit на `/api/admin/*` (троттл пока только на ручках генерации) | PLAN `QUEUE-1` Ф3 |
| Кабинет: MFA/passkeys, реаутентификация, сессии, экспорт/удаление данных, история использования, top-up | PLAN §6.1 (`CAB-*`) |

Полный бэклог — `PLAN.md` §6 (кабинет/админка) и §1 (безопасность).
