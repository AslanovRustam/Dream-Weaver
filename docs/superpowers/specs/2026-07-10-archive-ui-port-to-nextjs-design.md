# Перенос UI-редизайна из архива на Next.js-ветку (ui-updates)

**Дата:** 2026-07-10
**Ветка:** `ui-updates` (Next.js 16, App Router)
**Источник:** `C:\Users\user\Desktop\Archive (6)` (старая TanStack Start / Vite версия с редизайном UI + новыми фичами)

## Цель

Перенести на текущую Next.js-ветку **весь UI-редизайн архива + новые фичи**, оставив приложение на Next.js и **сохранив серверную работу**, которой в архиве нет (serverless-hardening, безопасность, человекочитаемые ошибки).

Утверждённый подход: **A — пофайловый перенос по категориям** (не сброс ветки, не точечная выборка).

## Контекст расхождения

Архив и `ui-updates` разошлись в обе стороны:
- **Только в архиве:** редизайн 4 крупных экранов, `editor-history.tsx` (undo/redo), страница `/billing`.
- **Только в Next (сохранить!):** `background.ts` (serverless `waitUntil`), `safe-fetch.ts` (SSRF), `rbac.ts`, `request-guard.ts`, `generation-errors.ts` (человекочитаемые ошибки), `ResizeResultsGrid.tsx`, App-Router-обвязка, `supabase/browser.ts` на `NEXT_PUBLIC_*`.

## Диспозиция файлов

### 1. Копировать as-is (архив → Next)
Не содержат router/`import.meta`:
- `src/components/PresetSidebar.tsx`
- `src/components/resize/ResizeBatchPanel.tsx`
- `src/components/ModelToggle.tsx`, `src/components/AspectRatioPicker.tsx` (diff 2–4 строки)
- `src/components/ui/{accordion,button,card,dialog,input,textarea}.tsx`
- `src/assets/*` (если отличаются/новые)
> Проверить импорты статических ассетов: в Next `import x from "@/assets/y.jpg"` даёт `StaticImageData` → использовать `x.src`.

### 2. Адаптировать → копировать (TanStack → Next)
- `src/components/AppHeader.tsx` — router-навигация + **новые кнопки undo/redo**.
- `src/components/ImageGenApp.tsx` — router + **регистрация editor-history** (`register`/`record`).
- **Страницы** `src/routes/*.tsx` → `src/app/**/page.tsx`:
  - `index.tsx` → `app/page.tsx` (рендерит ImageGenApp)
  - `login.tsx` → `app/login/page.tsx`
  - `account.tsx` → `app/account/page.tsx` (+ ссылка на `/billing`)
  - `admin.tsx` → `app/admin/page.tsx` (**1720 строк — самый объёмный**)
  - `reset-password.tsx` → `app/reset-password/page.tsx`
  - `history/index.tsx` → `app/history/page.tsx`
  - `history/$cardId.tsx` → `app/history/[cardId]/page.tsx`

### 3. Merge (сохранить улучшения Next)
- `src/lib/generation-context.tsx` — взять UI-изменения архива, **сохранить `formatGenerationError`** (импорт + вызов, стр. 30/330).
- `src/lib/auth-context.tsx` — слить (проверить, что не тянет TanStack/`import.meta`).
- `src/lib/imageGen.ts`, `src/lib/bannerSizes.ts` — небольшой diff (20/10 строк), слить клиентскую часть.
- `src/app/globals.css` — влить дизайн-токены из архивного `src/styles.css` (420 строк), сохранив Tailwind v4 `@import` и Next-специфику.

### 4. НЕ трогать (остаётся Next-версия)
Весь `src/app/api/**`; `src/lib/history/{cardWriter,retentionWorker,uploadRetryWorker,aiNaming,queries}.ts`; `logger.ts`; `auth-server.ts`; `supabase/{admin,user-client,browser}.ts`; `safe-fetch.ts`; `rbac.ts`; `request-guard.ts`; `background.ts`; `generation-errors.ts`; `imageSizes.ts`; `ftp/*`; `instrumentation.ts`; `resize/ResizeResultsGrid.tsx`.
> Архивные `src/lib/{error-capture,error-page}.ts` — **не переносим** (были только для TanStack `server.ts`, в Next не нужны).

### 5. Новое (добавить + адаптировать)
- `src/lib/editor-history.tsx` — undo/redo контекст. Смонтировать в `app/providers.tsx` (провайдер), подключить в AppHeader (кнопки) и ImageGenApp (`register`/`record`).
- `src/app/billing/page.tsx` — из архивного `routes/billing.tsx` (UI-only, CTA-заглушки).

## Правила адаптации TanStack → Next

| TanStack | Next |
|---|---|
| `import { Link } from "@tanstack/react-router"` | `import Link from "next/link"` |
| `<Link to="/x">` | `<Link href="/x">` |
| `useNavigate()` + `navigate({to:"/x"})` | `useRouter()` (next/navigation) + `router.push("/x")` |
| `useSearch()` / `Route.useSearch()` | `useSearchParams()` |
| `Route.useParams()` | `useParams()` (next/navigation) |
| `createFileRoute(...)({component, head})` | `"use client"` + `export default function Page()`; `head.title` → `document.title` в effect |
| `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` (только в browser.ts, который оставляем Next) |

## Верификация

После каждой области:
1. `npx tsc --noEmit` — 0 ошибок (ловит рассинхрон «архивный клиент ↔ Next-сервер»).
2. `next build` — успешная сборка.
3. Ручной smoke ключевых экранов (генерация, история, admin, login, /billing) на `next dev`.

## Риски

1. **Граница клиент↔сервер:** архивный UI может звать методы `generation-context`/`imageGen` с сигнатурами, отличными от текущих → всплывёт на `tsc`, правится точечно.
2. **`admin.tsx` (1720 строк):** наибольший объём router-адаптации.
3. **CSS-токены:** редизайн зависит от архивного `styles.css`; при неполном переносе токенов экраны «поедут» → влить полностью, вычистить дубли с Tailwind.

## Порядок реализации (области)

1. Стили (`globals.css` ← `styles.css`) + `ui/*` компоненты.
2. `editor-history.tsx` + монтаж в providers.
3. Простые компоненты as-is (`PresetSidebar`, `ResizeBatchPanel`, `ModelToggle`, `AspectRatioPicker`).
4. `AppHeader` (router + undo/redo).
5. `ImageGenApp` (router + editor register) + merge `generation-context`/`imageGen`/`bannerSizes`/`auth-context`.
6. Страницы: index → login → reset-password → account → history → **admin** → **billing (new)**.
7. Полный `tsc` + `next build` + smoke.

Откат — на любом этапе: `git restore` / ветка `backup/ui-updates-tanstack` для сверки с оригиналом архива.
