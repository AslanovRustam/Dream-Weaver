# Аутентификация и RBAC — Dream Weaver Studio

> AI-генератор **баннеров** на TanStack Start + React 19 + TS (Node), бэкенд — Supabase (Auth + Postgres + RLS).
>
> Главный принцип: **клиентские гейты косметические, реальная стена — на сервере.** Любая чувствительная операция проходит через серверный обработчик в `src/routes/api/**`, который верифицирует токен через Supabase и проверяет права. UI лишь прячет то, что всё равно вернёт 401/403.

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
- `AuthProvider` (`src/lib/auth-context.tsx`) подписывается на `onAuthStateChange`, держит `session`, отдаёт `useAuth()` → `{ session, user, loading, isAuthenticated, signOut }`. Подключён в корне (`src/routes/__root.tsx:139`).
- Защищённые страницы при `!isAuthenticated` редиректят на `/login` и показывают «Загрузка…», пока `loading` (например `src/routes/index.tsx:27`).
- Админка делает «дешёвую» предпроверку: дёргает `/api/me`, смотрит `is_super_admin`, и при `false` рисует заглушку — **но в самом коде написано: «The real wall is server-side, this only avoids showing a broken page to non-admins»** (`src/routes/admin.tsx:140`). То есть клиент только прячет UI; данные он всё равно не получит без серверной авторизации.

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
| **Смена (залогинен)** | `POST /api/auth/change-password` | `requireUser` → валидация (8–128 симв.) → `admin.auth.admin.updateUserById(user.id, { password })`. Для Google-only аккаунта просто привязывает пароль. ⚠ Без реаутентификации (SEC-M3, см. бэклог). `src/routes/api/auth/change-password.ts:23`. |
| **Запрос сброса** | `POST /api/auth/forgot-password` | `resetPasswordForEmail(email, { redirectTo })`. Ответ **всегда одинаков** (`GENERIC_OK`) — защита от перебора аккаунтов. Вызывается из инлайн-формы «Забыли?» на `/login`. `src/routes/api/auth/forgot-password.ts:15`. |
| **Установка нового пароля** | экран `/reset-password` | Recovery-токен из URL-хэша подхватывает `detectSessionInUrl` браузерного клиента → временная сессия → `updateUser({ password })`. Без сессии — нудж обратно на `/login`. `src/routes/reset-password.tsx`. |

---

## 2. RBAC — две ортогональные оси (role + tier)

Добавлен миграцией `0005_rbac_foundation.sql`. Источник истины матрицы прав — **код** `src/lib/rbac.ts` (план — вынести в БД, см. ниже ADM-RBAC-2).

Две оси заведены намеренно (`rbac.ts:12`):
- **`role`** — STAFF-capability: что ты можешь как сотрудник/команда.
- **`tier`** — BILLING-entitlement: приоритет/квоты (драйвер очереди QUEUE-1). «Корпоративный клиент» — это **tier**, а не роль.

Один человек может быть `role="support"` и одновременно `tier="corporate"`.

### Роли и tiers
```
ROLES  = user · tester · support · moderator · admin · superadmin   (rbac.ts:17)
TIERS  = regular · pro · corporate                                  (rbac.ts:27)
DEFAULT_ROLE = user        DEFAULT_TIER = regular
ROLE_RANK: user=0 · tester=1 · support=2 · moderator=3 · admin=4 · superadmin=5   (rbac.ts:34)
```
В БД хранятся как TEXT-колонки `profiles.role` / `profiles.tier` (без CHECK — набор часто меняется, валидация в коде + RPC).

### Матрица capabilities (role → что может)
Capabilities (`rbac.ts:45`) и их раздача (`ROLE_CAPABILITIES`, `rbac.ts:63`). `superadmin` особо-кейсится в `can()` как «всё» (`rbac.ts:99`), поэтому ему принадлежат **все** capability, включая `roles.assign`.

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
- **`getUserRole(userId, email)`** — читает `profiles.role/tier` через admin-клиент, нормализует (`normalizeRole`/`normalizeTier`). **Defensive fallback:** если колонок ещё нет (миграция `0005` не применена) или чтение упало — откатывается на bootstrap по email (super-admin → `role=superadmin, tier=corporate`), иначе `user/regular`. Ничего не ломается до применения миграции. `auth-server.ts:122`.
- **`requireUser(request)`** — базовая аутентификация (см. выше); возвращает в т.ч. `isSuperAdmin` (по email-bootstrap).
- **`requireSuperAdmin(request)`** — `requireUser` + проверка `isSuperAdminEmail`; не-админ → `AuthError(403)`. Используется на «полностью-админских» эндпойнтах. `auth-server.ts:83`.
- **`requireCapability(request, cap)`** — `requireUser` → `getUserRole` → `can(role, cap)`. Супер-админ (по роли **или** email-bootstrap) держит любую capability неявно. Иначе `AuthError(403)`. Возвращает `AuthedUserWithRole` (`…+ { role, tier }`). `auth-server.ts:151`.
- `can(role, cap)` (`rbac.ts:98`), `isRole`/`isTier`/`normalizeRole`/`normalizeTier` — валидация входных строк (используются и в `/api/admin/role`).

### Назначение роли/tier
Маршрут: **`POST /api/admin/role`** `{ user_id, role?, tier? }` (`src/routes/api/admin/role.ts`).
1. `requireSuperAdmin(request)` — гейт **только для супер-админа** (`role.ts:25`).
2. Валидация: непустой `user_id`; хотя бы одно из `role`/`tier`; `isRole`/`isTier` (иначе 400).
3. Вызов **через user-scoped клиент** (`getUserClient(caller.accessToken)`), чтобы у RPC был email/role-claim вызывающего (у service_role его нет): `userScoped.rpc("admin_set_user_role", { p_target_user, p_role, p_tier })` (`role.ts:52`).
4. RPC **`admin_set_user_role`** (`SECURITY DEFINER`, `0005_rbac_foundation.sql:68`) повторно проверяет всё на уровне БД:
   - `is_caller_super_admin()` (иначе `42501` → 403);
   - **self-protect:** нельзя разжаловать себя (`cannot_demote_self`) и нельзя снять роль у другого `superadmin` (`cannot_demote_other_superadmin`) → 409;
   - пишет **audit** в `audit_logs` (`action='user.role_changed'`, old/new role+tier).
5. Маппинг ошибок RPC в статусы: `user_not_found`→404, `forbidden`→403, `cannot_*`→409, иначе 500 (`role.ts:58`).

> Требует применённой миграции `0005` — без неё RPC отсутствует и эндпойнт вернёт 500 (`role.ts:8`).

### Bootstrap супер-админов по email
Аварийный механизм «не залочиться до раздачи ролей». Хардкод-список email:
- **TS:** `SUPER_ADMIN_EMAILS` (`auth-server.ts:23`) → `isSuperAdminEmail()` (`auth-server.ts:30`) — питает `requireUser().isSuperAdmin` и fallback `getUserRole`.
- **SQL:** тот же список в `is_super_admin(p_email)` (`0005:46`): «email в списке **ИЛИ** `profiles.role='superadmin'`». То есть после `0005` супер-админство даёт и роль в БД, и email-fallback.

Текущий список (4 email; 2 личных gmail добавлены временно на переезд на личный Supabase, см. TODO `auth-server.ts:21`): `kela@clickable.agency`, `skobelev@clickable.agency`, `skobelev.victor.v@gmail.com`, `aslanov@clickable.agency`. Этих же пользователей `0005` сидирует с `role='superadmin'` (`0005:27`).

### Защита от прямого PostgREST-пути
Помимо проверок в коде, `0005:65` делает `revoke update (role, tier, credits_balance) on public.profiles from authenticated` — пользователь не может поднять себе роль/tier/баланс даже прямым UPDATE в обход API (defense-in-depth; параллельно закрывает SEC-L1 по балансу). `/api/me` дополнительно whitelistит редактируемые поля (`first_name`/`last_name`/`nickname`/`phone`/`contact`) и не отдаёт правку баланса (`src/routes/api/me.ts:19`).

---

## 3. Заметки / бэклог (PLAN.md)

- ⚠ **Матрица прав сейчас живёт в коде** (`rbac.ts`). План — **вынести в БД-таблицу (ADM-RBAC-2)** без изменения API: вызовы продолжат идти через `can()` / `requireCapability()` (`rbac.ts:7`).
- **SEC-M1 (дрейф super-admin):** список email задублирован в TS и SQL; при пересборке БД только из `migrations/` админ-власть может «расщепиться». `0005` навёл мост (роль в БД как первичный признак), но единый источник ещё не достигнут — см. ADM-RBAC-1 / ADM-USER-2.
- **SEC-M3:** смена пароля без реаутентификации (`change-password.ts`) — угон сессии ведёт к полному захвату; план — требовать текущий пароль / reauth-nonce.
- `/api/admin/role` сейчас гейтится `requireSuperAdmin` (а не `requireCapability("roles.assign")`), что согласуется с тем, что `roles.assign` есть только у `superadmin`; UI-назначение ролей — следующий шаг (ADM-RBAC-1).
