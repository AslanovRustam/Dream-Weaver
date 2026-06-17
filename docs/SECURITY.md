# SECURITY — модель угроз и текущая поза

> Dream Weaver Studio — AI-генератор **баннеров**.
> Документ суммирует текущую безопасность и **риск-реестр из параноидального аудита**
> (2 агента + ручная верификация crown jewels: auth, RLS, SSRF, биллинг, rate-limit).
> Источник findings — `PLAN.md` §1; здесь — сводка, **сверенная с кодом**. Пути от корня
> `ban_gen_web/`, evidence в формате `файл:строка`.
> **Статус:** часть критичных/высоких находок **закрыта в коде** (PR #1, ветка
> `feat/rbac-foundation`) — отмечено ✅/◐ ниже; остальные правки — после отмашки владельца.

---

## 1. Принципы

- **Zero-trust на входе.** Bearer-токен валидируется через `auth.getUser` на стороне Supabase —
  payload JWT не доверяется вслепую (`src/lib/auth-server.ts:5-7, 61-77`).
- **Defense-in-depth.** Доступ режется на нескольких рубежах: API-граница
  (`requireCapability`/`requireUser`/`requireSuperAdmin`) + RLS в БД + `SECURITY DEFINER`-RPC,
  которые сами перепроверяют права. Клиентские проверки — только UX, не защита (`admin.tsx:143-152`).
- **Least privilege.** RBAC-матрица минимальна по умолчанию (`src/lib/rbac.ts:63-82`);
  service-role-клиент используется точечно и осознанно.
- **Аудируемость.** Чувствительные действия пишут `audit_logs` (гранты кредитов, смена настроек,
  просмотр чужой истории, смена роли).
- **«Прятать всё» (цель, не текущее состояние).** Публичные ресурсы и часть деталей ошибок должны
  быть закрыты — это ещё в бэклоге (`SEC-H3`, остаток `SEC-M6`).

---

## 2. Что КРЕПКО (verified по коду)

| Область | Почему крепко | Evidence |
|---|---|---|
| Аутентификация | Токен проверяется через `admin.auth.getUser(token)`; payload не доверяется; нет dev-bypass | `auth-server.ts:61-77` |
| Гейт админки (сервер) | Каждый чувствительный хендлер за `requireCapability(...)`; 401 без токена, 403 без права | `users.ts:14`, `logs.ts:32`, `history.ts:40`, `credits.ts:25`, `pricing.ts:45`, `settings.ts:106`, `role.ts:25` |
| Списание кредитов | Атомарный путь `spend_credits`, RLS, аудит `credit_transactions`, self-grant заблокирован (PLAN §2) | PLAN §2 |
| Гранты кредитов | RPC от имени юзера (не service_role) → проверка email-claim в БД; `SECURITY DEFINER` даёт ровно нужные права; cap `|delta|` | `credits.ts:25, 44-58` |
| Настройки/роли | Запись только через `SECURITY DEFINER`-RPC с перепроверкой super-admin и self-protection в БД | `settings.ts:106`, `0005_rbac_foundation.sql:68-118` |
| Валидация настроек | Per-key валидаторы до записи, «fail fast» (неизвестный ключ/невалид → 400) | `settings.ts:26-39, 121-134` |
| Аудит чувствительного чтения | Просмотр чужой истории логируется (`admin.viewed_user_history`) | `history.ts:26, 40` |
| Поиск пользователей | Экранирование `%_` в `ilike` (защита от LIKE-инъекции) | `users.ts:32` |
| Нет dev-bypass | Нет «волшебного» обхода авторизации/флага debug в auth-слое | `auth-server.ts` (весь файл) |

> Эти свойства — фундамент. Раньше они **не** закрывали находки ниже; в этой итерации SSRF,
> rate-limit, порядок биллинга и часть IDOR/утечек **закрыты в коде** (см. ✅/◐), но остаются
> открытые риски (публичные URL, секреты, реаутентификация и т.д.).

---

## 3. Риск-реестр (аудит)

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low/QA.
Статус: ☐ to do · ◐ in progress · ✅ done. Evidence сверены с кодом.

### 🔴 Critical

| ID | Угроза | Статус | Evidence / как закрыто |
|---|---|---|---|
| **SEC-C1** | **SSRF** — сервер тянул URL пользователя без проверки (чтение cloud-metadata `169.254.169.254`, internal-скан, DoS; `fetch-master` ещё и **возвращал тело наружу** → read-oracle) | **✅ DONE** | Гард `src/lib/safe-fetch.ts`: origin-allowlist = origin `FTP_BASE_URL` (`allowedOrigin` :22-30, проверка `url.origin !== allowed` :84), только http(s) (:77-79), DNS-резолв + блок private/loopback/link-local/ULA/CGNAT/metadata/multicast (`isBlockedIp` :34-61), `redirect:"error"` (:106), `AbortSignal.timeout(15с)` (:107), cap 25 МБ (:16, :114, :118). Врезано: `fetch-master.ts:34`, `generate-image.ts:776`, `extract-master.ts:224`. Вживую: `169.254.169.254`/`localhost`/`127.0.0.1:22` → 400 blocked; реальный FTP-origin → 200 allow (PLAN §E2E) |
| **SEC-C2** | **Живой FTP-пароль закоммичен** в git-историю (`HANDOVER.md:50`, значение == `.env` `FTP_PASS`) | ☐ OPEN | Файл `HANDOVER.md` удалён из новых коммитов, но **история не очищена**. Решение владельца (PLAN §3): репо **приватный** → понижено; **перед деплоем сменить ВСЕ ключи** + (опц.) чистка истории BFG/filter-repo. До ротации — считать засвеченным |

### 🟠 High

| ID | Угроза | Статус | Evidence / как закрыто |
|---|---|---|---|
| **SEC-H1** | **Нет rate-limit / concurrency-cap** нигде → абьюз/DoS на тяжёлых эндпойнтах | **✅ DONE** | `src/lib/request-guard.ts`: in-memory fixed-window per-user лимитер (`checkRate` :18-40, `rateLimitResponse` → 429 + `Retry-After` :44-56, periodic sweep + `unref` :59-67). Лимиты: `generate-image` 30/мин (`generate-image.ts:709`), `resize-tile` 120/мин (`$cardId.resize-tile.ts:48`), `extract-master` 30/мин (`extract-master.ts:188`), `fetch-master` 30/мин (`fetch-master.ts:18`), `bulk-zip` 6/мин (`bulk-zip.ts:149`). **Остаток:** per-IP, concurrency-cap и shared-store для горизонтального масштаба → QUEUE-1 Ф3 (single-instance долг) |
| **SEC-H2** | **Списание ПОСЛЕ генерации**; префлайт только `>0`; картинка отдавалась при `billingError` (эксплойт «0.0001 кредита → безлимит») | **✅ DONE** | Префлайт `balanceBefore < MIN_BALANCE_TO_GENERATE` (floor `=1`, `generate-image.ts:21, 723-727`) → 402 до вызова провайдера. При `billingError` картинка **НЕ отдаётся** → 402; gen-строка с `billing_error` остаётся для аудита (`generate-image.ts:1901-1916`). **Остаток:** точный hold по оценке стоимости ДО провайдера → QUEUE-1; token-trust/коэффициенты-плейсхолдеры → **SEC-M5** |
| **SEC-H3** | **Публичные баннеры по угадываемому URL без auth** | ☐ OPEN | `src/lib/ftp/storage.ts`, `FTP_BASE_URL`; путь = `{userIdShort=8 hex}/{YYYY-MM}/..._{random}`, random = `randomBytes(4)` = 32 бита. Архитектурное: нужен authenticated-прокси с проверкой владельца или подписанные истекающие URL; рандом ≥128 бит; убрать стабильный `userIdShort` |
| **SEC-H4** | **Нет лимита размера** base64-полей и bulk-zip (~500 МБ в heap) → OOM/DoS | **◐ PARTIAL** | Cap 20 МБ на каждое входящее dataURL-поле (`MAX_DATAURL_BYTES`, `dataUrlByteLength` в `request-guard.ts:75-84`): `generate-image` (логотипы/скрин/`source_image`, :744-760 → 413) + `resize-tile` (:77 → 413). **Остаток:** суммарный cap на запрос + стриминг `bulk-zip` (всё ещё грузит до ~500 МБ в heap; пока прикрыт rate-limit 6/мин) |
| **SEC-H5** | **Прод-секреты открытым текстом в `.env`** (вкл. всемогущий `SUPABASE_SERVICE_ROLE_KEY`) | ☐ OPEN | Решение владельца (PLAN §3): репо приватный → понижено; считать засвеченными → **ротация ВСЕХ ключей ПЕРЕД деплоем** + secret-store платформы (`wrangler secret put`), не `.env` в каталоге репо |

### 🟡 Medium

| ID | Угроза | Статус | Evidence / как закрыто |
|---|---|---|---|
| **SEC-M1** | **Дрейф списка super-admin** (TS ≠ SQL) | ◐ MITIGATED | `0005` сделал **роль в БД первичным признаком**: `is_super_admin(p_email)` = «email в bootstrap-списке **ИЛИ** `profiles.role='superadmin'`» (`0005_rbac_foundation.sql:41-57`), super-admins засидены (`0005:27-35`). Мост наведён, но **единый источник ещё не достигнут** (email-список всё ещё задублирован TS↔SQL) — финал в ADM-RBAC-1/ADM-USER-2 + тест паритета |
| **SEC-M2** | **IDOR через resize-аттач** — generations цеплялись к клиентскому `card_id` через service-role (обход RLS) | **✅ DONE** (код-сайд) | `src/lib/history/cardWriter.ts`: resize-ветка проверяет `generation_cards.user_id == userId` ДО `touch_card_activity`/insert (`:254-296`); чужой `card_id` → не аттачится, не бампит карточку, логируется warn. Легитимный resize своей карточки не страдает (PLAN §E2E). **Остаток (defense-in-depth, миграция):** ownership-guard внутри самого RPC `touch_card_activity` |
| **SEC-M3** | **Смена пароля без реаутентификации** | ☐ OPEN | `src/routes/api/auth/change-password.ts` (только `requireUser`, без текущего пароля). Не IDOR (только себе), но угон сессии/токена → полный захват аккаунта; нужен текущий пароль / reauth-nonce (CAB-SEC-2) |
| **SEC-M4** | `hard_delete_card` / `cleanup_expired_logs` корректны только при применённом `0004` | ☐ OPEN | Широкий `authenticated`-grant, держится на body-чеке. Проверить, что `0004` в прод; сузить EXECUTE-grants |
| **SEC-M5** | **Недосписание** | ☐ OPEN | `Math.max(totalTokens,1)*coefficient`, коэффициенты-заглушки `0.001`, модель/качество выбирает клиент (`generate-image.ts`, `0001_init.sql:117`). 0 токенов = минимум (а не максимум); клиент влияет на цену; нужен серверный price-floor + реальные коэффициенты |
| **SEC-M6** | Утечка деталей клиенту + логгер без редакции секретов + `ftp_path` в ответах | **◐ PARTIAL** | `src/lib/logger.ts`: recursive secret-redaction — ключи `authorization/api[-_]key/secret/token/password/bearer/cookie/credential` маскируются (`redactSecrets` :72-84), секрет-образные строки/JWT/`sk-`/`sb_secret_`/bearer скрабятся в message+stack (`scrubSecretText` :61-68) для `system_logs` и audit `details`. `fetch-master` больше не светит внутренний `e.message` (`fetch-master.ts:42-43`). **Остаток:** провайдерский `detail` клиенту в `generate-image` (`:1905`)/`extract-master` — НЕ тронут (клиент парсит его для детекта content_filter; перевод на structured-codes — отдельная задача); `ftp_path` сделать admin-only в `getHistoryCard` |
| **SEC-M7** | Retention не удаляет файлы надёжно | ☐ OPEN | Строка БД сносится даже при сбое FTP-delete; clone-card делит один `ftp_path` (`retentionWorker.ts`, `clone-card.ts:16`). Не удалять строку при сбое FTP; ref-count `ftp_path` |
| **SEC-M8** | Контент-сейфти денлист обходится | ☐ OPEN | `extract-master.ts`; пропускается, если `master_details` пришёл напрямую в `generate-image`. Скраб юзер-текста и `master_details` на сервере независимо от источника (PLAN `PROMPT-1`) |

### ⚪ Low / QA

| ID | Угроза | Статус | Риск / план |
|---|---|---|---|
| **SEC-L1** | `credits_balance` защищён лишь тонким RLS with-check (`0001_init.sql:257`) | ◐ MITIGATED | `0005:65` делает `revoke update (role, tier, credits_balance) on public.profiles from authenticated` — прямой PostgREST-UPDATE баланса закрыт. Остаток: guard-триггер по желанию |
| **SEC-L2** | Мёртвый `auth instanceof Response` (`fetch-master.ts:16`) | ☐ OPEN | `requireUser` бросает `AuthError`, а не возвращает Response → ветка недостижима; неавторизованный получит 500 вместо 401. Фикс — try/catch → `authErrorResponse` |
| **SEC-L3** | `app_settings` / `pricing` читает любой авторизованный | ⏸ by design | Следить, что кладём в settings |
| **SEC-L4** | «Временный» личный gmail в super-admin (`auth-server.ts:21-28`) | ☐ OPEN | Снять по плану возврата на корп-проект |
| **QA-1** | **Тестов нет вообще** (ни фреймворка, ни файлов) | ☐ OPEN | Нечем ловить регрессии authz/IDOR/SSRF/billing; нужен тест-каркас (vitest+playwright) — TEST-1 |
| **QA-2** | Нет схемной валидации входа (везде `as Body`, `zod` в зависимостях есть, но в роутах не применён) | ☐ OPEN | Нужен zod-слой per route (закрывает часть H4/SSRF/недосписания) — VALID-1 |

---

## 4. Срочное (PLAN §3)

1. **SSRF-гард (`SEC-C1`) — ✅ сделано.**
2. **Перед деплоем — ротация ВСЕХ ключей** (FTP, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
   `OPENROUTER_API_KEY`, anon, CRON-секрет) + переезд в secret-store (`SEC-C2`/`SEC-H5`).
   Репо приватный → git-история-чистка опциональна **после** ротации.

> ⚠️ Все секреты из `.env` в каталоге репо следует считать **засвеченными** до ротации.

---

## 5. Связанные планы

- Полный security-бэклог и evidence — `PLAN.md` §1.
- Срочные действия (deploy-чеклист) — `PLAN.md` §3.
- Защита промптов от инъекций (закрывает `SEC-M8`) — `PLAN.md` §4 `PROMPT-1`.
- Серверная валидация полей (закрывает часть `SEC-H2`/`QA-2`) — `PLAN.md` §4 `VALID-1`.
- Очередь/пул ключей с шифрованием at-rest, троттлингом и hold-биллингом (остаток `SEC-H1`,
  точный hold для `SEC-H2`, часть `SEC-H5`) — `PLAN.md` §4 `QUEUE-1`.
- Матрица прав в БД вместо хардкода (финал `SEC-M1`) — `PLAN.md` §6.3 `ADM-RBAC-2`.
- Реаутентификация при смене пароля (`SEC-M3`) — `PLAN.md` §6.1 `CAB-SEC-2`.

> **Примечание о посте.** Аутентификация, RLS deny-by-default и атомарный биллинг — крепкие.
> В этой итерации закрыты **SSRF (SEC-C1)**, **rate-limit (SEC-H1)** и **порядок биллинга
> (SEC-H2)**, а также код-сайд **IDOR (SEC-M2)** и редакция секретов в логах (SEC-M6 ◐).
> Главные открытые риски перед прод-деплоем — **секреты в гите/`.env` (SEC-C2/H5, ротация)**
> и **публичные URL баннеров (SEC-H3)**.
