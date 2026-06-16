# Dream Weaver Studio

AI-генератор **рекламных баннеров** для агентства Clickable. Пользователь выбирает пресет
(Широкий угол / Слот / Событие / Спорт), заполняет короткую форму — и получает мастер-баннер,
а затем пакет ресайзов под все нужные площадки (Stories, YouTube, посты, веб-баннеры, плашки)
одним кликом. Готовое скачивается ZIP-ом, вся история хранится в личной галерее.

> Это генератор **баннеров**. Любые упоминания «схемы вышивки» / cross-stitch в старых заметках —
> мусор от прежнего шаблона, к этому продукту отношения не имеют.

---

## Для кого

- **Дизайнеры / маркетологи Clickable** — основные пользователи: генерируют и скачивают баннеры.
- **Админы (super-admin)** — управляют пользователями, кредитами, ценами и смотрят логи в `/admin`.
- **Разработчики** — этот набор доков описывает архитектуру, БД, потоки и инфраструктуру.

---

## Tech stack

| Слой | Технологии |
| --- | --- |
| Фреймворк | [TanStack Start](https://tanstack.com/start) (file-based routing) + TanStack Router/Query |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/Radix UI, lucide-react, sonner |
| Сборка | Vite 7, обёртка `@lovable.dev/vite-tanstack-config` |
| Рантайм | Node 22 (через nvm-windows) |
| БД / Auth | Supabase (Postgres + Auth + RLS) |
| Хранилище картинок | FTP-сервер (`basic-ftp`), публичные HTTPS-URL |
| Генерация изображений | OpenAI `gpt-image-2` (direct) и OpenRouter / Google Gemini (`google/gemini-3.1-flash-image-preview`) |
| Vision / текст | OpenAI `gpt-4o-mini` — OCR-предпроход по мастеру + AI-нейминг карточек |
| Клиентский ресайз | canvas + `smartcrop`, `jszip` для ZIP |

Точные версии — в [`package.json`](../package.json).

---

## Как запустить локально

### Предусловия

- **Node 22** (рекомендуется nvm-windows). `bun` в окружении **не установлен** — все команды гоните через `npm`/`node`.
- Доступ к проекту Supabase, к FTP-хранилищу, ключи OpenAI и OpenRouter.

### Установка и запуск

```bash
npm install
npm run dev        # = vite dev
```

Дев-сервер слушает **http://localhost:8080** (порт/хост задаёт обёртка `@lovable.dev/vite-tanstack-config`,
см. [`vite.config.ts`](../vite.config.ts)). Если в окружении нет `bun`, можно запускать
напрямую: `node node_modules/vite/bin/vite.js dev`.

Скрипты из `package.json`:

| Команда | Что делает |
| --- | --- |
| `npm run dev` | дев-сервер (Vite, SSR) |
| `npm run build` | продакшн-сборка |
| `npm run build:dev` | сборка в режиме development |
| `npm run preview` | предпросмотр собранного |
| `npm run deploy` | `vite build && wrangler deploy` (см. оговорку про деплой в [ARCHITECTURE.md](./ARCHITECTURE.md)) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

### Переменные окружения

Секреты в репозиторий **не коммитятся**. Ниже — только **имена** переменных (значения берите из секрет-стора / у владельца проекта).

**`.env`** — серверные переменные (грузятся в `process.env` до старта Vite, см. `loadServerEnv()` в [`vite.config.ts`](../vite.config.ts)). Легаси-фолбэк — `.dev.vars`.

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENROUTER_API_KEY
FTP_HOST
FTP_PORT
FTP_USER
FTP_PASS
FTP_SECURE
FTP_BASE_PATH
FTP_BASE_URL
```

**`.env.local`** — клиентские (`VITE_*`) переменные, читаются Vite нативно и попадают в браузерный бандл:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

> Где они нужны в коде: Supabase server/admin/user-клиенты — `src/lib/supabase/*`; браузерный
> клиент — `src/lib/supabase/browser.ts`; FTP — `src/lib/ftp/*`; ключи провайдеров —
> `src/routes/api/generate-image.ts` и `src/routes/api/extract-master.ts`.

### Миграции БД

SQL-миграции лежат в [`supabase/migrations`](../supabase/migrations) (`0001`–`0005`). Применяются через
Supabase CLI (`supabase db push`) или Dashboard → SQL. Подробности — в `DB_SCHEMA.md`.

---

## Структура проекта

```
ban_gen_web/
├─ src/
│  ├─ router.tsx              # createRouter (TanStack) + QueryClient
│  ├─ start.ts                # createStart + SSR error-middleware
│  ├─ server.ts               # серверный entry: бутстрап фоновых воркеров + обёртка ошибок SSR
│  ├─ routeTree.gen.ts        # АВТОГЕН — карта роутов (не править руками)
│  ├─ styles.css              # тема (oklch, тёмная по умолчанию, accent-green), Tailwind v4
│  │
│  ├─ routes/                 # file-based маршруты (страницы + API)
│  │  ├─ __root.tsx           # корневой layout: Auth/Generation провайдеры, 404/Error
│  │  ├─ index.tsx            # главная — генератор (гард: гость → /login)
│  │  ├─ login.tsx            # вход (email/пароль + Google OAuth)
│  │  ├─ reset-password.tsx   # сброс пароля
│  │  ├─ account.tsx          # личный кабинет (профиль, баланс)
│  │  ├─ admin.tsx            # админ-панель (только super-admin)
│  │  ├─ history/             # галерея истории: index + $cardId
│  │  └─ api/                 # серверные API-роуты (см. ниже)
│  │     ├─ generate-image.ts # ⭐ ядро: промпт-билдеры + вызов провайдера + биллинг + история
│  │     ├─ extract-master.ts # vision OCR мастера (gpt-4o-mini)
│  │     ├─ fetch-master.ts   # URL → dataURL (обход CORS для canvas)
│  │     ├─ me.ts             # профиль + баланс текущего юзера
│  │     ├─ auth/             # change-password, forgot-password
│  │     ├─ history/          # CRUD карточек, resize-tile, bulk-zip, bulk-delete, restore, clone
│  │     └─ admin/            # users, credits, pricing, settings, logs, history, role
│  │
│  ├─ components/
│  │  ├─ ImageGenApp.tsx      # главный экран генератора (форма всех пресетов)
│  │  ├─ PresetSidebar.tsx    # каталог пресетов PRESETS + их prompt-шаблоны
│  │  ├─ AppHeader.tsx        # шапка: баланс, индикатор фоновых задач
│  │  ├─ ModelToggle.tsx / QualityPicker.tsx / AspectRatioPicker.tsx
│  │  ├─ resize/              # ResizeBatchPanel (выбор размеров) + ResizeResultsGrid (плитки)
│  │  └─ ui/                  # shadcn-компоненты (Radix-обёртки)
│  │
│  ├─ lib/
│  │  ├─ imageGen.ts          # клиентский API генерации + canvas-кроп/ресайз (smartcrop)
│  │  ├─ imageSizes.ts        # aspect ↔ пиксельный канвас для gpt-image-2
│  │  ├─ bannerSizes.ts       # каталог размеров по use-case + layout-шаблоны на группу
│  │  ├─ generation-context.tsx # глобальный стейт генерации + раннер батча (runMaster/runBatch)
│  │  ├─ api-client.ts        # fetch-обёртка с авто-инъекцией Bearer-токена
│  │  ├─ auth-context.tsx     # React-контекст сессии Supabase (useAuth)
│  │  ├─ auth-server.ts       # серверный auth: requireUser/requireSuperAdmin/requireCapability
│  │  ├─ rbac.ts              # роли, тиры, capability-матрица (источник истины RBAC)
│  │  ├─ supabase/            # admin (service-role) / user (RLS) / browser клиенты
│  │  ├─ ftp/                 # storage.ts (пути+URL) + uploader.ts (basic-ftp)
│  │  ├─ history/             # cardWriter, queries, aiNaming, uploadRetryWorker, retentionWorker
│  │  ├─ logger.ts            # logSystem / logAudit / newRequestId
│  │  └─ error-capture.ts / error-page.ts  # перехват и брендированная страница 500
│  │
│  └─ assets/                 # превью пресетов (jpg)
│
├─ supabase/migrations/       # SQL-миграции 0001–0005 (схема, RLS, RPC)
├─ scripts/                   # check-api-calls.ts, test-ftp.mjs
├─ vite.config.ts             # конфиг сборки + loadServerEnv()
├─ wrangler.jsonc             # конфиг Cloudflare Workers (см. оговорку про деплой)
├─ tsconfig.json              # TS (alias @/* → src/*)
└─ PLAN.md                    # живой бэклог + известные долги/риски
```

---

## Остальная документация

| Док | О чём |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Мастер-обзор A→Z: схема, карта роутов, рантайм, потоки данных, деплой, долги |
| DB_SCHEMA.md | Таблицы Supabase, RLS-политики, RPC, миграции |
| AUTH_RBAC.md | Аутентификация, роли/тиры, capability-матрица, super-admin |
| GENERATION_FLOW.md | Поток генерации: мастер → vision-предпроход → батч ресайза → плитки |
| STORAGE_FTP.md | FTP-хранилище: схема путей, фоновый аплоад, ретраи, retention |
| BILLING.md | Кредиты: `spend_credits`/`admin_grant_credits`, `pricing_coefficients`, токены×коэффициент |
| ADMIN.md | Админ-панель и `/api/admin/*` |
| SECURITY.md | Модель угроз, известные риски (свод по PLAN.md) |

> Часть доков из таблицы — план (см. список **DOC-SET** в [`PLAN.md`](../PLAN.md)). На текущий момент
> в `docs/` физически есть **README.md** и **ARCHITECTURE.md**; остальные создаются.
