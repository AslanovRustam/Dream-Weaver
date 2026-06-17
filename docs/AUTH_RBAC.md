# Аутентификация и RBAC — Dream Weaver Studio

> AI-генератор **баннеров** на TanStack Start + React 19 + TS (Node), бэкенд — Supabase (Auth + Postgres + RLS).
>
> Главный принцип: **клиентские гейты косметические, реальная стена — на сервере.** Любая чувствительная операция проходит через серверный обработчик в `src/routes/api/**`, который верифицирует токен через Supabase и проверяет права. UI лишь прячет то, что всё равно вернёт 401/403.
>
> **Статус:** RBAC **полностью провязан** (миграция `0005` применена, PR #1): две оси `role`+`tier`, capability-матрица, `requireCapability` на **всех** `/api/admin/*`, назначение ролей через `POST /api/admin/role` + UI-диалог в админке. Остаётся бэклог-полировка (матрица в БД, реаутентификация) — см. §3.

---

## 1. Аутентификация (Supabase Auth)

### Провайдеры входа
Все три заводятся на странице `/login` (`src/routes/login.tsx`):

| Способ | Как | Код |
|--------|-----|-----|
| **Google OAuth** | `signInWithOAuth({ provider: "google", … prompt: "select_account" })` — форсит выбор аккаунта Google каждый раз (мульти-аккаунты). После успеха Supabase редиректит на `/`. | `login.tsx:121` |
| **Email + пароль (вход)** | `signInWithPassword({ email, password })`, затем переход на `/`. | `login.tsx:163` |
| **Email + пароль (регистрация)** | `signUp({ email, password, emailRedirectTo: "/" })`. Если включён «Confirm email» — сессии нет, шлётся письмо; иначе сразу логин. Новые аккаунты создаются с балансом 0 (кредиты выдаёт админ). | `login.tsx:230` |

Профиль (`profiles`) для нового пользователя создаётся автоматически триггером БД `on_auth_user_created` → `handle_new_user()` (`supabase/migrations/0001_init.sql:90`), а не клиентом.

### Хранение сессии (клиент)
Браузерный Supabase-клиент — синглтон `getBrowserClient()` (`src/lib/supabase/browser.ts`): публичный anon-ключ, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `flowType: "pkce"`. Сессия (JWT) живёт в localStorage и автоматически рефрешится.

### Клиентский «AuthGate» = косметика
Глобального компонента `AuthGate` нет; роль гейта выполняет связка **`AuthProvider` + `useAuth()` + редирект в каждом защищённом роуте**:
- `AuthProvider` (`src/lib/auth-context.tsx`) подписывается на `onAuthStateChange`, держит `session`, отдаёт `useAuth()` → `{ session, user, loading, isAuthenticated, signOut }`. Подключён в корне (`src/routes/__root.tsx`).
- Защищённые страницы при `!isAuthenticated` редиректят на `/login` и показывают «Загрузка…», пока `loading` (например `src/routes/index.tsx`).
- Админка делает «дешёвую» предпроверку: дёргает `/api/me`, смотрит `is_super_admin`, и при `false` рисует заглушку — **но в самом коде написано: «The real wall is server-side, this only avoids showing a broken page to non-admins»** (`src/routes/admin.tsx:143-152`). То есть клиент только прячет UI; данные он всё равно не получит без серверной авторизации.

### Серверная верификация токена (реальная стена)
Конвенция: фронт шлёт access-token в `Authorization: Bearer <jwt>` на защищённые API-вызовы. Сервер **никогда не доверяет payload JWT вслепую** — он валидирует токен онлайн через Supabase.

Ядро — `src/lib/auth-server.ts`:
- `extractBearer(request)` — достаёт токен из заголовка (`auth-server.ts:50`).
- **`requireUser(request)`** — извлекает токен и вызывает `admin.auth.getUser(token)` (через service-role клиент). При отсутствии/невалидности → `AuthError(401)`. Возвращает `{ id, email, isSuperAdmin, accessToken }` (`auth-server.ts:61`). Это и есть «verify via `auth.getUser`, not local decode».
- `authErrorResponse(err)` — маппит `AuthError` в JSON-Response с нужным статусом (`auth-server.ts:95`).

Серверные Supabase-клиенты:
- `getAdminClient()` (`src/lib/supabase/admin.ts`) — **service_role** ключ, **обходит RLS**. Только сервер. Используется для `getUser`, чтения профиля, admin-операций.
- `getUserClient(accessToken)` (`src/lib/supabase/user-client.ts`) — anon-ключ + заголовок `Authorization: Bearer`, **уважает RLS** (операции «как пользователь»). Нужен, когда RPC должна видеть `auth.jwt()`/`auth.uid()` вызывающего (у service_role нет email-claim).

### Смена и сброс пароля
| Поток | Эндпойнт / экран | Поведение |
|-------|------------------|-----------|
| **Смена (залогинен)** | `POST /api/auth/change-password` | `requireUser` → валидация (8–128 симв.) → `admin.auth.admin.updateUserById(user.id, { password })`. Для Google-only аккаунта просто привязывает пароль. ⚠ Без реаутентификации (SEC-M3, см. бэклог). `src/routes/api/auth/change-password.ts`. |
| **Запрос сброса** | `POST /api/auth/forgot-password` | `resetPasswordForEmail(email, { redirectTo })`. Ответ **всегда одинаков** (`GENERIC_OK`) — защита от перебора аккаунтов. Вызывается из инлайн-формы «Забыли?» на `/login`. `src/routes/api/auth/forgot-password.ts`. |
| **Установка нового пароля** | экран `/reset-password` | Recovery-токен из URL-хэша подхватывает `detectSessionInUrl` браузерного клиента → временная сессия → `updateUser({ password })`. Без сессии — нудж обратно на `/login`. `src/routes/reset-password.tsx`. |

---

## 2. RBAC — две ортогональные оси (role + tier)

Добавлен миграцией `0005_rbac_foundation.sql` (**применена** к текущему Supabase). Источник истины матрицы прав — **код** `src/lib/rbac.ts` (план — вынести в БД, см. ниже ADM-RBAC-2).

Две оси заведены намеренно (`rbac.ts:12-15`):
- **`role`** — STAFF-capability: что ты можешь как сотрудник/команда.
- **`tier`** — BILLING-entitlement: приоритет/квоты (драйвер очереди QUEUE-1). «Корпоративный клиент» — это **tier**, а не роль.

Один человек может быть `role="support"` и одновременно `tier="corporate"`.

### Роли и tiers
```
ROLES  = user · tester · support · moderator · admin · superadmin   (rbac.ts:17)
TIERS  = regular · pro · corporate                                  (rbac.ts:27)
DEFAULT_ROLE = user        DEFAULT_TIER = regular                   (rbac.ts:30-31)
ROLE_RANK: user=0 · tester=1 · support=2 · moderator=3 · admin=4 · superadmin=5   (rbac.ts:34)
```
В БД хранятся как TEXT-колонки `profiles.role` / `profiles.tier` (без CHECK — набор часто меняется, валидация в коде + RPC; `0005:15-21`).

### Матрица capabilities (role → что может)
Capabilities (`rbac.ts:45-59`) и их раздача (`ROLE_CAPABILITIES`, `rbac.ts:63-82`). `superadmin` особо-кейсится в `can()` как «всё» (`rbac.ts:98-101`), поэтому ему принадлежат **все** capability, включая `roles.assign`.

| Capability | user | tester | support | moderator | admin | superadmin |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| `users.view` | | | ✓ | ✓ | ✓ | ✓ |
| `users.edit` | | | | | ✓ | ✓ |
| `users.ban` | | | | ✓ | ✓ | ✓ |
| `credits.grant` | | | ✓ | | ✓ | ✓ |
| `roles.assign` | | | | | | ✓ |
| `settings.edit` | | | | | ✓ | ✓ |
| `pricing.edit` | | | | | ✓ | ✓ |
| `keys.manage` | | | | | ✓ | ✓ |
| `logs.view` | | | ✓ | ✓ | ✓ | ✓ |
| `history.view_any` | | | ✓ | ✓ | ✓ | ✓ |
| `impersonate` | | | | | ✓ | ✓ |
| `stats.view` | | | ✓ | ✓ | ✓ | ✓ |

> `user` и `tester` не имеют ни одной staff-capability (`tester` — пока пустой, задел). Матрица намеренно минимальна и будет докручиваться.

### Серверные хелперы RBAC (`src/lib/auth-server.ts`)
- **`getUserRole(userId, email)`** — читает `profiles.role/tier` через admin-клиент, нормализует (`normalizeRole`/`normalizeTier`). **Defensive fallback:** если колонок ещё нет (миграция `0005` не применена) или чтение упало — откатывается на bootstrap по email (super-admin → `role=superadmin, tier=corporate`), иначе `user/regular`. Ничего не ломается до применения миграции. `auth-server.ts:122-144`.
- **`requireUser(request)`** — базовая аутентификация (см. выше); возвращает в т.ч. `isSuperAdmin` (по email-bootstrap). `auth-server.ts:61-77`.
- **`requireSuperAdmin(request)`** — `requireUser` + проверка `isSuperAdminEmail`; не-админ → `AuthError(403)`. Legacy-хелпер email-allowlist; **в admin-роутах больше не используется** (их перевели на `requireCapability`). `auth-server.ts:83-89`.
- **`requireCapability(request, cap)`** — `requireUser` → `getUserRole` → `can(role, cap)`. Супер-админ (по роли **или** email-bootstrap) держит любую capability неявно. Иначе `AuthError(403)`. Возвращает `AuthedUserWithRole` (`…+ { role, tier }`). `auth-server.ts:151-161`.
- `can(role, cap)` (`rbac.ts:98`), `isRole`/`isTier`/`normalizeRole`/`normalizeTier` (`rbac.ts:84-95`) — валидация входных строк (используются и в `/api/admin/role`).

### Гейт всех admin-эндпойнтов = `requireCapability`
Каждый `/api/admin/*`-хендлер требует **конкретную** capability (а не общий «супер-админ»-флаг) — least-privilege по-настоящему:

| Эндпойнт | Capability | Evidence |
|----------|------------|----------|
| `GET /api/admin/users` (поиск) | `users.view` | `users.ts:14` |
| `POST /api/admin/credits` (гранты) | `credits.grant` | `credits.ts:25` |
| `GET /api/admin/history` (чужая история) | `history.view_any` | `history.ts:40` |
| `* /api/admin/settings` (правка настроек) | `settings.edit` | `settings.ts:106` |
| `* /api/admin/pricing` (правка тарифов) | `pricing.edit` | `pricing.ts:45` |
| `GET /api/admin/logs` (логи) | `logs.view` | `logs.ts:32` |
| `POST /api/admin/role` (роль/tier) | `roles.assign` | `role.ts:25` |

> `roles.assign` есть только у `superadmin` (`rbac.ts:81` + special-case `can()`), поэтому эффективно `/api/admin/role` доступен лишь супер-админу — но теперь это выражено **через capability**, единообразно с остальными роутами (а не отдельным `requireSuperAdmin`).

### Назначение роли/tier
Маршрут: **`POST /api/admin/role`** `{ user_id, role?, tier? }` (`src/routes/api/admin/role.ts`).
1. **`requireCapability(request, "roles.assign")`** — гейт по capability (де-факто супер-админ) (`role.ts:25`).
2. Валидация: непустой `user_id`; хотя бы одно из `role`/`tier`; `isRole`/`isTier` (иначе 400) (`role.ts:34-47`).
3. Вызов **через user-scoped клиент** (`getUserClient(caller.accessToken)`), чтобы у RPC был email/role-claim вызывающего (у service_role его нет): `userScoped.rpc("admin_set_user_role", { p_target_user, p_role, p_tier })` (`role.ts:52-57`).
4. RPC **`admin_set_user_role`** (`SECURITY DEFINER`, `0005_rbac_foundation.sql:68-116`) повторно проверяет всё на уровне БД:
   - `is_caller_super_admin()` (иначе `42501` → 403);
   - **self-protect:** нельзя разжаловать себя (`cannot_demote_self`) и нельзя снять роль у другого `superadmin` (`cannot_demote_other_superadmin`) → 409;
   - пишет **audit** в `audit_logs` (`action='user.role_changed'`, old/new role+tier).
5. Маппинг ошибок RPC в статусы: `user_not_found`→404, `forbidden`→403, `cannot_*`→409, иначе 500 (`role.ts:58-67`).

> Требует применённой миграции `0005` (она **применена**) — без неё RPC отсутствует и эндпойнт вернёт 500 (`role.ts:7-8`).

### UI назначения ролей (админка) — провязано
Админка (`src/routes/admin.tsx`) уже умеет назначать роль/tier, не только редактировать:
- В таблице пользователей — колонка **роль · тариф** (`admin.tsx:321-322`), данные из `/api/admin/users` (поля `role`/`tier`, `admin.tsx:52-53`).
- Клик по пользователю открывает **`RoleDialog`** (`admin.tsx:459-572`): селекты роли и тарифа, кнопка активна только при изменении (`dirty = roleChanged || tierChanged`, `:480-482`), **confirm-summary с diff** «роль: A → B», «тариф: A → B» (`:526-535`).
- Submit шлёт `POST /api/admin/role` только изменённые поля (`role`/`tier` = `undefined`, если не менялись) (`admin.tsx:554-561`). Сервер всё равно энфорсит (confirm — это UX).

### Bootstrap супер-админов по email
Аварийный механизм «не залочиться до раздачи ролей». Хардкод-список email:
- **TS:** `SUPER_ADMIN_EMAILS` (`auth-server.ts:23-28`) → `isSuperAdminEmail()` (`auth-server.ts:30-33`) — питает `requireUser().isSuperAdmin` и fallback `getUserRole`.
- **SQL:** тот же список в `is_super_admin(p_email)` (`0005:41-57`): «email в списке **ИЛИ** `profiles.role='superadmin'`». То есть после `0005` супер-админство даёт и роль в БД, и email-fallback.

Текущий список (4 email; 2 личных gmail добавлены временно на переезд на личный Supabase, см. TODO `auth-server.ts:21-22`): `kela@clickable.agency`, `skobelev@clickable.agency`, `skobelev.victor.v@gmail.com`, `aslanov@clickable.agency`. Этих же пользователей `0005` сидирует с `role='superadmin'` (`0005:27-35`).

### Защита от прямого PostgREST-пути
Помимо проверок в коде, `0005:65` делает `revoke update (role, tier, credits_balance) on public.profiles from authenticated` — пользователь не может поднять себе роль/tier/баланс даже прямым UPDATE в обход API (defense-in-depth; параллельно закрывает SEC-L1 по балансу). `/api/me` дополнительно whitelistит редактируемые поля (`first_name`/`last_name`/`nickname`/`phone`/`contact`) и не отдаёт правку баланса (`src/routes/api/me.ts:19-25, 35-44`).

---

## 3. Заметки / бэклог (PLAN.md)

- ✅ **RBAC провязан полностью** (PR #1): миграция `0005` применена; `rbac.ts`; `requireCapability` во **всех** admin-роутах; `POST /api/admin/role` (RPC `admin_set_user_role`) + `RoleDialog` в админке (назначение role/tier с confirm-summary). `is_super_admin` учитывает `profiles.role` (мостит SEC-M1).
- ⚠ **Матрица прав сейчас живёт в коде** (`rbac.ts`). План — **вынести в БД-таблицу (ADM-RBAC-2)** без изменения API: вызовы продолжат идти через `can()` / `requireCapability()` (`rbac.ts:7-10`). Тогда «настроить, что может категория юзеров» — без релиза.
- **SEC-M1 (дрейф super-admin):** список email задублирован в TS и SQL; `0005` навёл мост (роль в БД как первичный признак), но **единый источник ещё не достигнут** — финал в ADM-RBAC-1/ADM-USER-2 + тест паритета TS↔SQL.
- **SEC-M3:** смена пароля без реаутентификации (`change-password.ts`) — угон сессии ведёт к полному захвату; план — требовать текущий пароль / reauth-nonce (CAB-SEC-2).
- **Гость-инвайты** (ADM-GUEST-1) — scoped-ссылка, привязанная к пригласившему, НЕ роль. Бэклог.
