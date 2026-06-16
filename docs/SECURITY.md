# SECURITY — модель угроз и текущая поза

> Dream Weaver Studio — AI-генератор **баннеров**.
> Документ суммирует текущую безопасность и **риск-реестр из параноидального аудита**
> (2 агента + ручная верификация crown jewels: auth, RLS, SSRF, биллинг, rate-limit).
> Источник findings — `PLAN.md` §1; здесь — сводка, **сверенная с кодом**. Пути от корня
> `ban_gen_web/`, evidence в формате `файл:строка`.
> **Статус:** обсуждение/бэклог — правки по коду только после отмашки владельца.

---

## 1. Принципы

- **Zero-trust на входе.** Bearer-токен валидируется через `auth.getUser` на стороне Supabase —
  payload JWT не доверяется вслепую (`src/lib/auth-server.ts:5-7, 61-77`).
- **Defense-in-depth.** Доступ режется на нескольких рубежах: API-граница
  (`requireSuperAdmin`/`requireUser`/`requireCapability`) + RLS в БД + `SECURITY DEFINER`-RPC,
  которые сами перепроверяют права. Клиентские проверки — только UX, не защита (`admin.tsx:7-8`).
- **Least privilege.** RBAC-матрица минимальна по умолчанию (`src/lib/rbac.ts:60-82`);
  service-role-клиент используется точечно и осознанно.
- **Аудируемость.** Чувствительные действия пишут `audit_logs` (гранты кредитов, смена настроек,
  просмотр чужой истории, смена роли).
- **«Прятать всё» (цель, не текущее состояние).** Публичные ресурсы и детали ошибок должны быть
  закрыты — часть этого ещё в бэклоге (`SEC-H3`, `SEC-M6`).

---

## 2. Что КРЕПКО (verified по коду)

| Область | Почему крепко | Evidence |
|---|---|---|
| Аутентификация | Токен проверяется через `admin.auth.getUser(token)`; payload не доверяется; нет dev-bypass | `auth-server.ts:61-77` |
| Гейт админки (сервер) | `requireSuperAdmin` на всех чувствительных хендлерах; 401 без токена, 403 не-админу | `auth-server.ts:83-89`; `users.ts:14`, `logs.ts:32`, `history.ts:40`, `credits.ts:25`, `pricing.ts:45`, `settings.ts:106`, `role.ts:25` |
| Списание кредитов | Атомарный путь `spend_credits`, RLS, аудит `credit_transactions`, self-grant заблокирован (PLAN §2) | PLAN §2 |
| Гранты кредитов | RPC от имени юзера (не service_role) → проверка email-claim в БД; `SECURITY DEFINER` даёт ровно нужные права; cap `|delta|` | `credits.ts:44-58, 36-41` |
| Настройки/роли | Запись только через `SECURITY DEFINER`-RPC с перепроверкой super-admin и self-protection в БД | `settings.ts:136-149`, `role.ts:52-67` |
| Валидация настроек | Per-key валидаторы до записи, «fail fast» (неизвестный ключ/невалид → 400) | `settings.ts:26-39, 121-134` |
| Аудит чувствительного чтения | Просмотр чужой истории логируется (`admin.viewed_user_history`) | `history.ts:16-33, 57, 69-73` |
| Поиск пользователей | Экранирование `%_` в `ilike` (защита от LIKE-инъекции) | `users.ts:32` |
| Нет dev-bypass | Нет «волшебного» обхода авторизации/флага debug в auth-слое | `auth-server.ts` (весь файл) |

> Эти свойства — фундамент. Они **не** закрывают находки ниже: SSRF, rate-limit, порядок
> биллинга и утечка ресурсов лежат в других местах кода.

---

## 3. Риск-реестр (аудит)

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low/QA. Все позиции — статус ☐ (to do),
если не указано иное. Evidence сверены с кодом.

### 🔴 Critical

| ID | Угроза | Evidence | Риск |
|---|---|---|---|
| **SEC-C1** | **SSRF** — сервер тянет URL пользователя без проверки | `src/routes/api/fetch-master.ts:29`, `src/routes/api/generate-image.ts:744`, `src/routes/api/extract-master.ts` (через OpenAI) | Чтение cloud-metadata `169.254.169.254`, internal-скан, DoS. `fetch-master` ещё и **возвращает тело наружу** → полный read-oracle |
| **SEC-C2** | **Живой FTP-пароль закоммичен** в git-tracked `HANDOVER.md:50` | значение == `.env` (`FTP_PASS`), лежит в истории коммитов | Утечка всем с доступом к репо/форку. Удаление файла из новых коммитов историю **не** чистит → нужна ротация + чистка истории |

### 🟠 High

| ID | Угроза | Evidence | Риск |
|---|---|---|---|
| **SEC-H1** | **Нет rate-limit / concurrency-cap** нигде | `src/start.ts` (единственный middleware — error-handler) | Абьюз/DoS на `generate-image`, `resize-tile`, `extract-master`, `fetch-master`, `bulk-zip`; нет per-user/per-IP лимитов |
| **SEC-H2** | **Списание ПОСЛЕ генерации**; префлайт только `>0`; картинка отдаётся при `billingError` | `generate-image.ts:711 / :1774 / :1876` | Бесплатная генерация при нулевом/недостаточном балансе; нет hold/estimate до вызова провайдера |
| **SEC-H3** | **Публичные баннеры по угадываемому URL без auth** | `src/lib/ftp/storage.ts:79`, `FTP_BASE_URL`; путь = `{userIdShort=8 hex}/{YYYY-MM}/..._{random}` где random = `randomBytes(4)` = 32 бита (`storage.ts:38-39, 55-57`) | Доступ к чужим баннерам перебором; стабильный `userIdShort` в пути; рандом-суффикс слабоват (нужно ≥128 бит, прокси с проверкой владельца или подписанные URL) |
| **SEC-H4** | **Нет лимита размера** base64-полей и bulk-zip (~500 МБ в heap) | `generate-image.ts:1320`, `storage.ts:107`, `src/routes/api/history/bulk-zip.ts:196` | OOM/DoS; нет cap байт на dataURL-поле и суммарно; bulk-zip не стримится |
| **SEC-H5** | **Прод-секреты открытым текстом в `.env`** (вкл. всемогущий `SUPABASE_SERVICE_ROLE_KEY`) | `.env` в каталоге репо | Считать засвеченными → ротация; хранить в secret-store платформы (`wrangler secret put`), не в `.env` |

### 🟡 Medium

| ID | Угроза | Evidence | Риск |
|---|---|---|---|
| **SEC-M1** | **Дрейф списка super-admin** (TS ≠ SQL) | TS=4 (`auth-server.ts:23`), SQL=2 (`supabase/migrations/0001_init.sql:19`), лишние 2 — только в `MIGRATE_TO_PERSONAL.sql` (нет в `0005`) | При пересборке БД из `migrations/` админ-власть расщепляется; нужен единый источник (`profiles.role`) + тест паритета TS↔SQL |
| **SEC-M2** | **IDOR через `touch_card_activity`** | RPC без проверки владельца (`0002_history_feature.sql:239`); resize-ветка цепляет `generations` к клиентскому `card_id` через service-role (обход RLS) | Привязка генераций к чужой карточке; нужен ownership-guard в RPC и до insert |
| **SEC-M3** | **Смена пароля без реаутентификации** | `src/routes/api/auth/change-password.ts:25-43` (только `requireUser`, без текущего пароля) | Не IDOR (только себе), но угон сессии/токена → полный захват аккаунта; нужен текущий пароль / reauth-nonce |
| **SEC-M4** | `hard_delete_card` / `cleanup_expired_logs` корректны только при применённом `0004` | широкий `authenticated`-grant, держится на body-чеке | Проверить, что `0004` в прод; сузить EXECUTE-grants |
| **SEC-M5** | **Недосписание** | `Math.max(totalTokens,1)*coefficient`, коэффициенты-заглушки `0.001`, модель/качество выбирает клиент (`generate-image.ts:1763`, `0001_init.sql:117`) | 0 токенов = минимум (а не максимум); клиент влияет на цену; нужен серверный price-floor + реальные коэффициенты |
| **SEC-M6** | Утечка деталей клиенту + логгер без редакции секретов + `ftp_path` в ответах | `generate-image.ts:1530`, `fetch-master.ts:40`, `src/lib/logger.ts` | Раскрытие внутренностей; нужен generic-ошибки клиенту, recursive key-scrubber (authorization/apikey/token/password/secret), убрать `ftp_path` не-админам |
| **SEC-M7** | Retention не удаляет файлы надёжно | строка БД сносится даже при сбое FTP-delete; clone-card делит один `ftp_path` (`src/lib/history/retentionWorker.ts`, `clone-card.ts:16`) | Осиротевшие файлы на FTP / удаление общего файла; не удалять строку при сбое FTP, ref-count `ftp_path` |
| **SEC-M8** | Контент-сейфти денлист обходится | `extract-master.ts:127`; пропускается, если `master_details` пришёл напрямую в `generate-image` | Обход модерации; скраб юзер-текста и `master_details` на сервере независимо от источника (см. PLAN `PROMPT-1`) |

### ⚪ Low / QA

| ID | Угроза | Evidence | Статус/риск |
|---|---|---|---|
| **SEC-L1** | `credits_balance` защищён лишь тонким RLS with-check | `0001_init.sql:257` | Нет column-REVOKE/триггера; нужен `revoke update(credits_balance,email,id)` + guard-триггер |
| **SEC-L2** | Мёртвый `auth instanceof Response` | `fetch-master.ts:13` | Неавторизованный получает 500-HTML вместо 401; фикс — try/catch → `authErrorResponse` |
| **SEC-L3** | `app_settings` / `pricing` читает любой авторизованный | `settings.ts:84-88`, `pricing.ts:21-24` | ⏸ by design; следить, что кладём в settings |
| **SEC-L4** | «Временный» личный gmail в super-admin | `auth-server.ts:21-28` | Снять по плану возврата на корп-проект |
| **QA-1** | **Тестов нет вообще** (ни фреймворка, ни файлов) | — | Нечем ловить регрессии authz/IDOR/SSRF/billing; нужен тест-каркас (vitest+playwright) |
| **QA-2** | Нет схемной валидации входа | везде `as Body`, `zod` в зависимостях есть, но в роутах не применён | Нужен zod-слой per route (закрывает часть H4/SSRF/недосписания) |

---

## 4. Срочное (PLAN §3)

1. Ротация **FTP-пароля** + чистка истории (`SEC-C2`) и **SSRF-гард** (`SEC-C1`).
2. Ротация `SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / CRON-секрета
   + переезд в secret-store (`SEC-H5`).

> ⚠️ Все секреты из `.env` в каталоге репо следует считать **засвеченными** до ротации.

---

## 5. Связанные планы

- Полный security-бэклог и evidence — `PLAN.md` §1.
- Срочные действия — `PLAN.md` §3.
- Защита промптов от инъекций (закрывает `SEC-M8`) — `PLAN.md` §4 `PROMPT-1`.
- Серверная валидация полей (закрывает часть `SEC-H2`/`QA-2`) — `PLAN.md` §4 `VALID-1`.
- Очередь/пул ключей с шифрованием at-rest и троттлингом (закрывает `SEC-H1`, часть `SEC-H5`)
  — `PLAN.md` §4 `QUEUE-1`.
- RBAC в БД вместо хардкода (закрывает `SEC-M1`) — `PLAN.md` §6.3 `ADM-RBAC-1`.
- Реаутентификация при смене пароля (`SEC-M3`) — `PLAN.md` §6.1 `CAB-SEC-2`.

> **Примечание о посте.** Аутентификация, RLS deny-by-default и атомарный биллинг — крепкие.
> Главные открытые риски — **SSRF (SEC-C1)** и **секрет в гите (SEC-C2)**; до их закрытия
> систему нельзя считать готовой к недоверенной нагрузке.
