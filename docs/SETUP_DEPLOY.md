# SETUP & DEPLOY — локальный запуск, сборка, миграции, деплой

> Dream Weaver Studio — AI-генератор **баннеров**.
> Переменные окружения — **только названия** (значения держим в секретах, не в доках/гите).
> Пути от корня `ban_gen_web/`. Список env сверен по `process.env.` / `import.meta.env` в коде.

---

## 1. Переменные окружения

### 1.1 Серверные (`process.env.*`)

Загружаются из `.env` (фоллбэк — `.dev.vars`) в `process.env` **до** старта Vite/TanStack
(`vite.config.ts:17-43`). На проде должны лежать в secret-store платформы, **не** в `.env` в
репозитории (см. SECURITY `SEC-H5`).

| Переменная | Где используется | Назначение |
|---|---|---|
| `SUPABASE_URL` | `src/lib/supabase/admin.ts:11`, `src/lib/supabase/user-client.ts:7` | URL проекта Supabase (сервер) |
| `SUPABASE_ANON_KEY` | `src/lib/supabase/user-client.ts:8` | anon-ключ для user-scoped клиента (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts:12` | **service_role** — обходит RLS; строго server-only, secret-store |
| `OPENAI_API_KEY` | `generate-image.ts:718`, `extract-master.ts:186`, `src/lib/history/aiNaming.ts:103` | OpenAI (генерация изображений, vision, AI-имена) |
| `OPENROUTER_API_KEY` | `generate-image.ts:1412` | OpenRouter (часть генерации) |
| `FTP_HOST` | `src/lib/ftp/uploader.ts:23` | FTP-хост хранилища баннеров |
| `FTP_USER` | `src/lib/ftp/uploader.ts:24` | FTP-пользователь |
| `FTP_PASS` | `src/lib/ftp/uploader.ts:25` | FTP-пароль (см. SECURITY `SEC-C2` — был засвечен, ротация) |
| `FTP_PORT` | `src/lib/ftp/uploader.ts:31` | FTP-порт |
| `FTP_SECURE` | `src/lib/ftp/uploader.ts:34` | флаг TLS для FTP |
| `FTP_BASE_PATH` | `src/lib/ftp/storage.ts:27` | базовый путь на FTP (обязателен) |
| `FTP_BASE_URL` | `src/lib/ftp/storage.ts:33` | базовый публичный HTTPS-URL баннеров (обязателен) |

### 1.2 Клиентские (`import.meta.env.VITE_*`)

Инжектятся Vite на сборке; попадают в браузерный бандл (публичные по определению).

| Переменная | Где используется | Назначение |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase/browser.ts:9` | URL Supabase для браузерного клиента |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase/browser.ts:10` | anon-ключ для браузерного клиента |

> По конвенции `vite.config.ts:14-16`: `VITE_*` живут в `.env.local` (нативно читается Vite),
> серверные — в `.env` / `.dev.vars`.

### 1.3 `CRON_SECRET` — открытый вопрос

`CRON_SECRET` указан в задаче как ожидаемая переменная, **но в коде он не найден**: grep по
`process.env.CRON_SECRET` (и по `CRON_SECRET` в целом по репозиторию) — **0 совпадений**.
PLAN §3 при этом упоминает «ротацию CRON» в списке секретов. Трактовать как **TODO/несоответствие**:
либо cron-эндпоинт ещё не защищён секретом, либо переменная названа иначе. Перед заведением
в secret-store — уточнить фактическое имя и место проверки.

---

## 2. Локальный запуск

Окружение: **Node 22 LTS** (через nvm-windows). `bun` в системе **не установлен** — несмотря на
то что часть тулинга TanStack/Lovable может упоминать bun, использовать **npm/node**.

> `.nvmrc` с версией `22` пока **не закоммичен** (PLAN §7 — TODO внести файл).

```powershell
# 1. зависимости
npm install

# 2. dev-сервер (вариант А — через npm-скрипт)
npm run dev

# 2b. dev-сервер (вариант Б — напрямую, если нужен явный бинарь vite)
node node_modules/vite/bin/vite.js dev
```

- Скрипт `dev` = `vite dev` (`package.json:7`).
- Хост/порт/strictPort задаёт пресет `@lovable.dev/vite-tanstack-config` (sandbox-детект,
  `vite.config.ts:1-6`) — локально приложение поднимается на **http://localhost:8080**.

Перед запуском создать `.env` (серверные) и `.env.local` (`VITE_*`) с переменными из §1.

---

## 3. Сборка

```powershell
npm run build        # vite build (прод)
npm run build:dev    # vite build --mode development
npm run preview      # предпросмотр собранного
```

`package.json:8-11`. Полезное: `npm run lint` (eslint), `npm run format` (prettier).

---

## 4. Миграции Supabase

SQL-миграции лежат в `supabase/migrations/`:

| Файл | Содержание |
|---|---|
| `0001_init.sql` | базовая схема, профили, биллинг, super-admin (SQL-список) |
| `0002_history_feature.sql` | история карточек, RPC `touch_card_activity` |
| `0003_fix_service_role_check.sql` | фикс проверки service-role |
| `0004_use_auth_role.sql` | переход на `auth.role`; нужен для `hard_delete_card`/`cleanup_expired_logs` |
| `0005_rbac_foundation.sql` | RBAC: `profiles.role/tier`, RPC `admin_set_user_role` |

**Применение:** через Supabase **Dashboard → SQL** или Supabase **CLI** (`supabase db push`).

⚠️ Открытые вопросы по миграциям (PLAN §0):
- **`0005` не подтверждена как применённая** на 2026-06-16. Проверить: Dashboard → SQL
  `select role, tier from profiles limit 1;` или дёрнуть `POST /api/admin/role` (если RPC нет —
  вернёт 500). Текущий проект Supabase: `aafplhguibgciyjsxtpn`. До применения `0005` эндпоинт
  `/api/admin/role` не работает, а RBAC держится на email-bootstrap (`auth-server.ts:122-144`).
- **Мусорный файл** `supabase/migrations/0005_rbac_foundation.zip` лежит рядом с `.sql` —
  в `migrations/` должны быть только `.sql`; мешает `supabase db push`. Снести после подтверждения
  (PLAN §0).
- `0004` должна быть в проде, иначе `SEC-M4` (широкие grant'ы держатся на body-чеке).

---

## 5. Деплой — РАЗНОБОЙ (открытый вопрос)

Целевой рантайм **не зафиксирован** — в проекте есть признаки разных таргетов. Это **открытый
вопрос инфраструктуры** (PLAN §7: «Зафиксировать рантайм: Cloudflare (wrangler) vs Netlify vs
node-server — в коде разнобой»).

| Признак | Что найдено | Вывод |
|---|---|---|
| **Cloudflare / wrangler** | `wrangler.jsonc` (`name: dream-weaver-studio`, `compatibility_flags: ["nodejs_compat"]`, `main: @tanstack/react-start/server-entry`); `npm run deploy` = `vite build && wrangler deploy` (`package.json:12`); `wrangler` в devDeps; `@cloudflare/vite-plugin` | Cloudflare Workers — наиболее «оснащённый» путь по конфигам |
| **Netlify** | в коде/конфигах **нет** `netlify.toml`, `_redirects`, `_headers`. Единственное упоминание Netlify — в `PLAN.md` (как один из вариантов open question) | Реальной конфигурации Netlify нет — только как опция в плане |
| **Node-server** | отдельного `server.js`/`Procfile` в репозитории **нет** (только бандл TanStack в `node_modules`) | Самостоятельного node-рантайма не настроено |

**Текущая практика по коду:** деплой = `npm run deploy` → Cloudflare через `wrangler deploy`
(`package.json:12`, `wrangler.jsonc`). Прежде чем зафиксировать это как единственный путь —
**подтвердить с владельцем** (PLAN §7), т.к. план держит Netlify/node как нерешённые альтернативы.

Если остаётся Cloudflare — секреты заводить через `wrangler secret put <NAME>` (а не `.env`),
см. SECURITY `SEC-H5`.

---

## 6. Чек-лист перед прод-деплоем

- [ ] Все секреты §1 — в secret-store платформы, не в `.env` репо (`SEC-H5`).
- [ ] FTP-пароль и API-ключи **ротированы** (считаются засвеченными, `SEC-C2`/`SEC-H5`).
- [ ] Миграция `0005` применена и подтверждена; `0004` в проде; `.zip`-мусор удалён.
- [ ] Зафиксирован рантайм деплоя (Cloudflare vs Netlify vs node) — §5.
- [ ] Прояснён статус `CRON_SECRET` (имя/место проверки) — §1.3.
