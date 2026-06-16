# Dream Weaver Studio — Архитектура (A→Z)

Мастер-документ. Даёт цельную картину системы: что это, из чего собрано, как устроены роуты,
рантайм, потоки данных, тема/UI, деплой, рост и известные долги. Конкретику по подсистемам —
в соседних доках (см. [README.md](./README.md)).

> Генератор **рекламных баннеров**. Никакой вышивки/cross-stitch — это устаревшая формулировка из
> старого шаблона и к продукту отношения не имеет.

---

## 1. Что это и для кого

**Dream Weaver Studio** — внутренний веб-инструмент Clickable для генерации рекламных баннеров с
помощью ИИ. Пользователь:

1. логинится (email/пароль или Google);
2. выбирает **пресет** — Широкий угол / Слот / Событие / Спорт;
3. заполняет форму (тема, тексты заголовка/кнопки, бренд+лого, язык, спорт-поля и т.д.);
4. получает **мастер-баннер** в выбранной пропорции;
5. запускает **пакет ресайза** — выбирает целевые размеры по площадкам, система за один проход
   адаптирует мастер под каждую новую пропорцию;
6. скачивает результат (ZIP) и видит всё в личной **истории**.

Аудитория: дизайнеры/маркетологи (генерация), super-админы (управление через `/admin`),
разработчики (поддержка).

---

## 2. Tech stack

- **Фронт/фреймворк:** TanStack Start (file-based routing, SSR) + TanStack Router + TanStack Query,
  React 19, TypeScript.
- **UI:** Tailwind CSS v4, shadcn/Radix-компоненты (`src/components/ui/*`), lucide-react иконки,
  sonner-тосты. Тёмная тема по умолчанию (oklch, accent-green).
- **Сборка:** Vite 7 через обёртку `@lovable.dev/vite-tanstack-config` (она уже подключает
  `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, алиас `@`, инъекцию `VITE_*` и
  детект порта/хоста — **не** дублировать вручную, см. шапку `vite.config.ts`).
- **Рантайм:** Node 22.
- **Данные:** Supabase — Postgres + Auth + RLS. Серверный код ходит либо service-role клиентом
  (`src/lib/supabase/admin.ts`, обходит RLS), либо user-scoped клиентом по JWT
  (`src/lib/supabase/user-client.ts`, уважает RLS).
- **Картинки:** FTP-хранилище (`basic-ftp`), отдаются по публичным HTTPS-URL.
- **Провайдеры генерации:** OpenAI `gpt-image-2` (напрямую, `/v1/images/{generations,edits}`) и
  OpenRouter → Google Gemini (`/v1/chat/completions` с `modalities:["image","text"]`).
- **Vision/текст:** OpenAI `gpt-4o-mini` — OCR мастера и AI-нейминг карточек.

---

## 3. High-level схема

```
┌────────────┐   HTTPS (Bearer JWT)   ┌─────────────────────────────────────────┐
│  Браузер   │ ─────────────────────► │   TanStack Start (Node, SSR + API)       │
│ React 19   │                        │                                          │
│ canvas/zip │ ◄───────────────────── │  src/routes/*  (страницы)                │
│ smartcrop  │      HTML / JSON       │  src/routes/api/*  (серверные хендлеры)  │
└────────────┘                        │  src/server.ts → фоновые воркеры         │
      │                               └───────┬───────────┬───────────┬──────────┘
      │ public image URL                      │           │           │
      ▼                                       ▼           ▼           ▼
┌────────────┐                         ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ FTP-сервер │ ◄── upload (фоном) ──── │ Supabase │ │  OpenAI  │ │  OpenRouter  │
│ (картинки) │                         │ PG + RLS │ │gpt-image-2│ │ Gemini image │
└────────────┘                         │  + Auth  │ │gpt-4o-mini│ └──────────────┘
                                       └──────────┘ └──────────┘
```

Ключевые маршруты данных:

- **Auth.** Браузер держит сессию Supabase (PKCE, `persistSession`), `api-client.ts` подкладывает
  `Authorization: Bearer <access_token>` в каждый запрос. Сервер валидирует токен через
  `admin.auth.getUser(token)` (`requireUser`), **не** доверяя payload-у JWT вслепую.
- **Генерация.** Браузер → `POST /api/generate-image` → сервер строит промпт, дёргает OpenAI/OpenRouter,
  списывает кредиты, пишет историю и **возвращает картинку сразу**; аплоад на FTP идёт фоном.
- **Картинки наружу.** FTP-хранилище отдаёт файлы по предсказуемым публичным URL (см. долг **SEC-H3**
  в PLAN.md).

---

## 4. Карта роутов

File-based: каждый файл в `src/routes` — маршрут. Автогенерится в `routeTree.gen.ts` (руками не править).

### Страницы (UI)

| Путь | Файл | Назначение | Доступ |
| --- | --- | --- | --- |
| `/` | `routes/index.tsx` | Генератор баннеров (главный экран) | аутентиф. (гость → `/login`) |
| `/login` | `routes/login.tsx` | Вход: email/пароль + Google OAuth | публичный |
| `/reset-password` | `routes/reset-password.tsx` | Сброс пароля | публичный |
| `/account` | `routes/account.tsx` | Личный кабинет: профиль, баланс | аутентиф. |
| `/admin` | `routes/admin.tsx` | Админ-панель (вкладки Users/Pricing/…); UI скрыт для не-админов, доступ режет сервер | super-admin |
| `/history` | `routes/history/index.tsx` | Галерея истории (infinite scroll) | аутентиф. |
| `/history/$cardId` | `routes/history/$cardId.tsx` | Карточка: мастер + все ресайзы | аутентиф. |

Корневой layout — `routes/__root.tsx`: оборачивает приложение в `QueryClientProvider` →
`AuthProvider` → `GenerationProvider`, задаёт `<head>`, 404 и Error-компоненты.

### API-роуты (`src/routes/api/*`)

Каждый — TanStack `createFileRoute(...).server.handlers`. Авторизация — в начале хендлера через
`requireUser` / `requireSuperAdmin` / `requireCapability` (`src/lib/auth-server.ts`).

| Метод + путь | Файл | Назначение | Защита |
| --- | --- | --- | --- |
| POST `/api/generate-image` | `api/generate-image.ts` | Генерация мастера и i2i-ресайза: промпт-билдеры по пресету, вызов провайдера, биллинг, запись истории | `requireUser` + баланс > 0 |
| POST `/api/extract-master` | `api/extract-master.ts` | Vision-предпроход (gpt-4o-mini): OCR текстов + центральный объект мастера | `requireUser` |
| POST `/api/fetch-master` | `api/fetch-master.ts` | URL мастера → dataURL (обход CORS перед canvas-операциями) | `requireUser` |
| GET/PATCH `/api/me` | `api/me.ts` | Профиль + баланс текущего юзера; PATCH правит профиль (баланс — read-only) | `requireUser` |
| POST `/api/auth/change-password` | `api/auth/change-password.ts` | Смена пароля | `requireUser` |
| POST `/api/auth/forgot-password` | `api/auth/forgot-password.ts` | Запрос письма для сброса | публичный |
| GET/POST/… `/api/history` | `api/history/index.ts` | Список/операции с карточками истории | `requireUser` (RLS) |
| `/api/history/$cardId` | `api/history/$cardId.ts` | Чтение/изменение/удаление одной карточки | `requireUser` (RLS) |
| POST `/api/history/$cardId/resize-tile` | `api/history/$cardId.resize-tile.ts` | Сохранить готовую плитку ресайза (склеена на клиенте), без биллинга | `requireUser` (RLS) |
| POST `/api/history/bulk-zip` | `api/history/bulk-zip.ts` | ZIP по нескольким карточкам | `requireUser` |
| POST `/api/history/bulk-delete` | `api/history/bulk-delete.ts` | Массовое (soft) удаление | `requireUser` |
| POST `/api/history/restore` | `api/history/restore.ts` | Восстановление в grace-окне | `requireUser` |
| POST `/api/history/clone-card` | `api/history/clone-card.ts` | Клонировать карточку как новую | `requireUser` |
| GET `/api/history/upload-status` | `api/history/upload-status.ts` | Статус фоновых FTP-аплоадов | `requireUser` |
| GET `/api/admin/users` | `api/admin/users.ts` | Список/поиск профилей | `requireSuperAdmin` |
| POST `/api/admin/credits` | `api/admin/credits.ts` | Начислить/списать кредиты (с аудит-нотой) | `requireSuperAdmin` |
| GET/PUT `/api/admin/pricing` | `api/admin/pricing.ts` | Чтение/правка `pricing_coefficients` | чтение `requireUser`, запись `requireSuperAdmin` |
| GET/PUT `/api/admin/settings` | `api/admin/settings.ts` | Чтение/правка `app_settings` | чтение `requireUser`, запись `requireSuperAdmin` |
| GET `/api/admin/logs` | `api/admin/logs.ts` | Системные/аудит-логи | `requireSuperAdmin` |
| GET `/api/admin/history` | `api/admin/history.ts` | История любого юзера | `requireSuperAdmin` |
| POST `/api/admin/role` | `api/admin/role.ts` | Назначить роль/тир пользователю | `requireSuperAdmin` |

> Замечание по защите admin-эндпоинтов: сейчас они привязаны к `requireSuperAdmin`
> (email-allowlist + `profiles.role='superadmin'`). Гранулярный `requireCapability` уже есть в
> `auth-server.ts`/`rbac.ts`, но массово к роутам пока **не** подключён — это часть RBAC-фундамента
> (ветка `feat/rbac-foundation`, см. PLAN.md). Детали — в `AUTH_RBAC.md`.

---

## 5. Рантайм

- **Серверный entry — `src/server.ts`.** `vite.config.ts` перенаправляет бандл-entry TanStack Start
  на этот файл. Он: (а) импортирует `error-capture`; (б) **на старте процесса** поднимает два фоновых
  воркера; (в) оборачивает `fetch` сервера, нормализуя «проглоченные» h3 ошибки SSR в брендированную
  страницу 500 (`renderErrorPage`).
- **SSR-middleware — `src/start.ts`.** `createStart` с `requestMiddleware`, который ловит throw-ы в
  хендлерах и отдаёт 500-страницу (кроме объектов с `statusCode` — те пробрасываются как есть).
- **Фоновые воркеры (Node, `setInterval`, таймеры `unref`'нуты, идемпотентный старт):**

  | Воркер | Файл | Интервал | Что делает |
  | --- | --- | --- | --- |
  | Upload-retry | `lib/history/uploadRetryWorker.ts` | 2 мин | Добивает `pending` FTP-аплоады. Байты при первом фейле кладутся в temp-файл (`os.tmpdir()/dream-weaver-uploads`), переживают краш. Прогрессивный бэкофф, до 100 попыток / 72 ч, потом `failed`. |
  | Retention | `lib/history/retentionWorker.ts` | 6 ч | Hard-delete карточек с истёкшим `hard_delete_after`/`expires_at` (удаляет файлы с FTP → RPC `hard_delete_card`); чистит `system_logs`/`audit_logs` через RPC `cleanup_expired_logs`. |

- **Целевой preset рантайма — `node-server`.** FTP (`basic-ftp` требует реального `net.Socket`),
  фоновые `setInterval`-воркеры и запись temp-файлов на диск — это всё **Node-only** и предполагает
  долгоживущий Node-процесс. (Расхождение с конфигом Cloudflare — см. §8.)

---

## 6. Поток данных (мастер + ресайз)

Подробный разбор — в `GENERATION_FLOW.md`. Кратко:

### Мастер

1. `ImageGenApp` собирает `GeneratePayload` и зовёт `gen.runMaster()`
   (`lib/generation-context.tsx`) → `generateImage()` (`lib/imageGen.ts`) →
   `POST /api/generate-image`.
2. Сервер (`api/generate-image.ts`): проверяет токен и баланс (> 0), по `preset_id`/`template`
   строит промпт одним из билдеров — `slotPrompt` / `eventPrompt` / `sportPrompt` / `adaptPrompt`
   (последний переписывает шаблон под новый subject через `gpt-4o-mini`), затем добавляет
   супер-приоритетные блоки: **SUPERSEDING COMPOSITION RULE** (всё важное — в центральные 60%×60%),
   **TEXT FIDELITY** (рендерить пользовательские строки символ-в-символ), **MASTER COMPOSITION RULES**
   (safe-zone под будущий кроп).
3. Размер канваса берётся из `lib/imageSizes.ts` (`resolveCanvasSize`/`openAiSizeString`): для каждого
   aspect — валидный для gpt-image-2 размер (обе стороны /16, лимиты по краю/пикселям).
4. Вызов провайдера: `gpt` → OpenAI `/v1/images/generations` (t2i) или `/v1/images/edits` (если есть
   референсы); `nano` → OpenRouter chat-completions. Ответы парсятся под обе схемы.
5. **Биллинг:** `total_tokens × coefficient` (из `pricing_coefficients` по `(model, quality)`,
   дефолт `0.001`), списание атомарным RPC `spend_credits`.
6. **История:** `recordGenerationAndUpload` (`lib/history/cardWriter.ts`) создаёт карточку
   `generation_cards` (для мастера) + строку `generations`, кладёт `form_snapshot` (без base64),
   запускает фоновый аплоад на FTP и fire-and-forget AI-нейминг карточки.
7. Картинка возвращается клиенту немедленно (dataURL + `card_id`), не дожидаясь FTP.

### Ресайз (батч)

Раннер — `runBatch` в `lib/generation-context.tsx`:

1. Если мастер — это FTP/HTTP-URL (загружен из истории), он резолвится в dataURL через
   `POST /api/fetch-master` (FTP не отдаёт CORS, иначе canvas «протухнет»).
2. Выбранные размеры **группируются по пропорции (bucket)**. Размеры с пропорцией мастера —
   «бесплатные»: чистый client-side scale из мастера (`scale_from_master`). Остальные пропорции —
   «платные»: **одна i2i-генерация на bucket** (`scale_from_bucket`).
3. Если есть хоть один отличный от мастера bucket — один раз делается vision-предпроход
   `extractMasterDetails()` (`POST /api/extract-master`): OCR-тексты + имя центрального объекта.
   Эти факты вшиваются в i2i-промпт как **MASTER VISUAL FACTS** (приоритет 0.5).
4. Для каждого «платного» bucket: берётся самый крупный тайл как `target_w/target_h`, зовётся
   `generateImage({ source_image: master, target_w, target_h, master_details, group_id,
   skip_history_attach:true })`. На сервере это ветка i2i: мастер идёт **первым** референсом,
   промпт оборачивается кроп-aware-правилами (ABSOLUTE FIDELITY TO MASTER, STRICT CONTENT INVENTORY,
   re-stack под portrait/landscape, пиксельные safe-margins) + layout-шаблоном из
   `bannerSizes.ts` (`GROUP_TEMPLATES[group_id]`).
5. Результат bucket-генерации **scale'ится на клиенте** до точных пикселей каждого тайла
   (`resizeToExact`; в `imageGen.ts` есть и `cropAndResize` со smartcrop для кроп-сценариев).
   Каждая готовая плитка отправляется в `POST /api/history/$cardId/resize-tile` (без повторного
   биллинга — bucket уже оплачен один раз).
6. Фолбэки: i2i упал по content_filter → t2i тем же исходным промптом; всё упало → stretch-scale из
   мастера. Транзиентные ошибки (таймаут/обрыв/пустой ответ) ретраятся.

Итог: для N выбранных размеров платных генераций = число **уникальных** пропорций (минус пропорция
мастера). Остальное — бесплатный canvas-ресайз в браузере. Скачивание — ZIP (`jszip`).

---

## 7. Тёмная тема / UI

- **Дизайн-система — `src/styles.css`.** Tailwind v4 (`@import "tailwindcss"`, `@theme inline`).
  Все цвета в **oklch**. Семантические токены (`--background`, `--card`, `--panel`, `--primary`,
  `--accent-green`, `--ring`, `--destructive`, графики, sidebar) мапятся в Tailwind-утилиты
  (`bg-*`, `text-*`).
- **Тёмная по умолчанию.** `:root` уже задаёт тёмные значения (фон `oklch(0.16 0.005 260)`,
  текст почти белый). Фирменный акцент — **зелёный** `--accent-green: oklch(0.78 0.18 150)`,
  он же `--ring`; на нём кнопки действий (например «Сгенерировать пакет»). Есть и отдельный класс
  `.dark` с альтернативной палитрой.
- **Компоненты.** shadcn/Radix-обёртки в `src/components/ui/*` (accordion, dialog, drawer, select,
  tabs, table, tooltip, sonner и т.д.); `tw-animate-css` для анимаций; `class-variance-authority` +
  `tailwind-merge` (`cn()` в `lib/utils.ts`) для вариантов.
- Иконки — `lucide-react`. Тосты — `sonner`.

---

## 8. Деплой — открытый вопрос

В коде **расхождение**, которое нужно явно зафиксировать:

- **Конфиг указывает на Cloudflare Workers.** `wrangler.jsonc` (`name: "dream-weaver-studio"`,
  `main: "@tanstack/react-start/server-entry"`, `compatibility_flags:["nodejs_compat"]`,
  observability), а `package.json` имеет `deploy: "vite build && wrangler deploy"`.
- **Но значительная часть серверного кода — Node-only и на Workers в текущем виде не поедет:**
  - FTP через `basic-ftp` (`lib/ftp/uploader.ts`) явно требует реального Node `net.Socket` — в комментарии
    это прямо сказано;
  - фоновые воркеры на `setInterval` с долгоживущим процессом (`uploadRetryWorker`, `retentionWorker`);
  - запись/чтение temp-файлов на локальный диск (`os.tmpdir()`) для crash-recovery аплоадов;
  - `src/server.ts` материализует серверный entry и поднимает воркеры на бутстрапе процесса.
- **Дев-сервер** работает как обычный Node/Vite SSR на **localhost:8080**.

**Вывод / TODO:** реальная прод-цель **не подтверждена**. Варианты: (а) долгоживущий **node-server**
(Netlify Functions/контейнер/VPS) — совместим с FTP и воркерами; (б) Cloudflare Workers — потребует
вынести FTP и воркеры наружу (внешний аплоадер/кронжоба) и убрать локальный диск. До решения считать
это **открытым вопросом**; `wrangler.jsonc` присутствует, но его пригодность для текущего кода под
сомнением. (См. также пункт **SEC-H5** в PLAN.md про хранение секретов через `wrangler secret put`.)

---

## 9. Рост и масштабирование

- **Кроп/ресайз — на клиенте.** Тяжёлый canvas-ресайз тайлов выполняется в браузере, сервер не
  держит на этом CPU/память. Bucket-стратегия минимизирует число платных i2i-вызовов.
- **Аплоады не блокируют ответ.** Картинка отдаётся сразу; FTP идёт фоном с crash-recovery, поэтому
  всплески генераций не упираются в латентность FTP.
- **Размеры — по use-case.** `bannerSizes.ts` группирует десятки размеров по площадкам; добавить
  размер/группу — правка одного файла + (опц.) layout-шаблон в `GROUP_TEMPLATES`.
- **Retention встроен.** Карточки живут `retention_cards_months` (дефолт 12), логи чистятся по
  настройкам; воркер не даёт БД/FTP разрастаться.
- **Точки внимания при росте (из PLAN.md):** нет rate-limit / concurrency-cap нигде (**SEC-H1**);
  списание кредитов происходит **после** генерации, префлайт только `>0` (**SEC-H2**); нет лимита на
  размер base64-полей и bulk-zip (**SEC-H4**, риск heap); единственный коннект-на-вызов FTP (просто,
  но без пула). Очередь/приоритеты по тирам (`tier`) — заложены в RBAC, но не реализованы.

---

## 10. Принципы

- **Сервер не доверяет клиенту.** JWT валидируется через Supabase (`auth.getUser`), а не парсингом
  payload-а; данные защищает RLS; service-role клиент — только в серверном коде.
- **Деньги — атомарно и аудируемо.** Списание/начисление кредитов только через SECURITY DEFINER RPC
  (`spend_credits` не уводит баланс в минус; каждое движение пишет `credit_transactions`).
- **UX важнее побочек.** История/FTP-аплоад/AI-нейминг — fire-and-forget и **никогда** не валят
  пользовательский ответ: оплаченную картинку показываем сразу.
- **Точечные правки, без переписываний.** Логика промптов и багфиксы наращиваются блоками с явными
  приоритетами; раннер один и тот же для t2i и i2i.
- **RBAC расширяемый.** Роли/тиры/capabilities — простые строковые юнионы + матрица в `rbac.ts`;
  можно вынести в БД без смены вызовов (`can()`/`requireCapability()`).
- **Наблюдаемость.** Сквозной `request_id` (`logger.ts`), `system_logs` + `audit_logs`, видимые в
  `/admin → Логи`.

---

## 11. Известные долги

Единый источник — [`PLAN.md`](../PLAN.md) (живой бэклог; severity 🔴/🟠/🟡/⚪, evidence `путь:строка`).
Не копировать целиком — вот ориентиры:

- **Безопасность:** SSRF в `fetch-master`/`generate-image`/`extract-master` (**SEC-C1**); секреты в
  `.env`/истории git, нужна ротация (**SEC-C2/SEC-H5**); отсутствие rate-limit (**SEC-H1**); порядок
  биллинга и выдача картинки при `billingError` (**SEC-H2**); публичные угадываемые URL баннеров
  (**SEC-H3**); отсутствие cap на base64/bulk-zip (**SEC-H4**); дрейф списка super-admin TS↔SQL
  (**SEC-M1**).
- **Тесты:** автотестов сейчас нет (**TEST-1/QA-1**) — нужны unit (rbac/биллинг/sizes), integration
  (authz/RLS/RPC), security (IDOR/SSRF/обход биллинга), e2e (логин→мастер→батч→ZIP).
- **RBAC:** фундамент готов (`rbac.ts`, миграция `0005`, `/api/admin/role`, `requireCapability`), но
  массово к роутам не подключён; применённость миграции `0005` на текущем проекте Supabase **не
  подтверждена**; в `supabase/migrations/` лежит лишний `0005_*.zip` (мусор).
- **Документация:** набор `docs/` (DOC-SET) ещё не полон — на текущий момент есть README и
  ARCHITECTURE; остальные доки из таблицы README создаются.

> История проекта: корпоративный Supabase на паузе, идёт переезд на личный — отсюда временные
> gmail-адреса в `SUPER_ADMIN_EMAILS` (`auth-server.ts`) и файл `supabase/MIGRATE_TO_PERSONAL.sql`.
