# Dream Weaver Studio — Handover Document

> Кинь этот файл в новый чат как контекст. Архитектура устойчивая, основной flow работает в продакшен-стиле.

## 🎯 Что это

**Dream Weaver Studio** — AI banner generator для команды Clickable Agency.

**Флоу:**
1. Юзер логинится (Google OAuth с принудительным account-picker'ом, или email/password через Supabase)
2. Выбирает один из 4 пресетов: **Широкий угол / Слот / Событие / Спорт**
3. Заполняет форму (бренд, тексты, опции персонажа, аспект-ratio)
4. Генерит **мастер-баннер** через **gpt-image-2** (OpenAI direct, нативные размеры под каждый из 10 аспектов)
5. Выбирает в выпадашке размеры для **ресайз-пакета** (65+ размеров в 6 use-case группах)
6. Раннер делает один i2i на каждый уникальный аспект (≠ мастера), потом чистый scale в браузере под точные пиксели
7. Скачивает результаты ZIP-пакетом или из истории

## 🧱 Tech Stack

| Слой | Что |
|------|-----|
| Framework | TanStack Start (file-based routing) + React 19 + TypeScript |
| Build | Vite + Bun |
| Runtime | **Node.js** (TanStack Start node-server preset) |
| Hosting (целевой) | Netlify (пока локально) |
| DB | Supabase (Postgres + Auth) |
| Auth | Supabase Auth: Google OAuth (с `prompt=select_account`) + email/password + сброс пароля |
| Image gen | OpenAI `gpt-image-2` (direct) + Gemini `google/gemini-3.1-flash-image-preview` (через OpenRouter) |
| Vision OCR | `gpt-4o-mini` через OpenAI direct (extract-master) |
| AI naming | `gpt-4o-mini` через OpenAI direct (polishCardName) |
| FTP | `basic-ftp` (Node-runtime, обязательно) → `clickdes.ftp.tools:21` |
| UI | shadcn/ui + Radix + Tailwind v4 (тёмная тема, accent-green) |
| Image processing | `canvas` API (browser-side pure scale через drawImage) |
| Archive | `jszip` (export) |

## 🔑 Environment Variables

### `.env` (server-side, не в git):
```bash
SUPABASE_URL=https://hpimiriqpenhnjfferqa.supabase.co
SUPABASE_ANON_KEY=eyJ...   # legacy JWT anon
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # legacy JWT service_role
OPENAI_API_KEY=sk-proj-...   # gpt-image-2, gpt-4o-mini
OPENROUTER_API_KEY=sk-or-v1-...   # Gemini nano-banana (fallback)

# FTP
FTP_HOST=clickdes.ftp.tools
FTP_PORT=21
FTP_USER=clickdes_sv
FTP_PASS=hD1xoJ6isB2ouY5hqC4h
FTP_BASE_PATH=/public_html/dream-weaver
FTP_BASE_URL=https://demo.promo/sv/public_html/dream-weaver
```

### `.env.local` (client-side, Vite):
```bash
VITE_SUPABASE_URL=https://hpimiriqpenhnjfferqa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 📂 File Map (актуально)

### Backend (`src/routes/api/`)
| Файл | Что |
|---|---|
| `generate-image.ts` | Главный endpoint. **Серверный fetch URL→dataURL** для history-loaded master. Vision pre-pass логируется. |
| `extract-master.ts` | Vision pre-pass через gpt-4o-mini → структурированный JSON. **Принимает и URL, и dataURL**. Жёсткие safety-фильтры в промпте. |
| `me.ts` | GET профиль+баланс, PATCH профиль |
| `auth/change-password.ts`, `auth/forgot-password.ts` | Управление паролем |
| `admin/users.ts`, `admin/credits.ts`, `admin/pricing.ts` | Управление юзерами/кредитами/тарифами |
| `admin/settings.ts` | 12 настроек приложения (retention, retry, format, limits, AI) |
| `admin/logs.ts` | Просмотр system_logs + audit_logs с фильтрами |
| `admin/history.ts` | Просмотр истории любого юзера (super-admin only) |
| `history/index.ts` | GET список карточек юзера (поиск/фильтры) |
| `history/$cardId.ts` | GET/PATCH/DELETE одна карточка |
| `history/$cardId.resize-tile.ts` | POST готовый ресайз-тайл → создаёт generations row + FTP upload |
| `history/clone-card.ts` | Клонирует карточку под новый preset (общий FTP-файл, защита от накопления "(новая категория)" суффиксов) |
| `history/restore.ts`, `history/bulk-delete.ts`, `history/bulk-zip.ts` | Восстановление/массовое удаление/архив. Bulk-zip использует `generateAsync({type: 'blob'})` для надёжности. |
| `history/upload-status.ts` | Счётчик failed/pending uploads для badge в шапке |

### Server-side libs (`src/lib/`)
| Файл | Что |
|---|---|
| `imageSizes.ts` | **Точные нативные размеры под аспекты gpt-image-2** (1:1, 16:9, 9:16, 4:3, 3:4, 5:4, 4:5, 3:2, 2:3, 21:9, 9:21). Алгоритм через reduced ratio + step=lcm(16/gcd(...)). |
| `supabase/admin.ts` | Service-role client |
| `supabase/user-client.ts` | User-scoped client (с access_token) |
| `auth-server.ts` | `requireUser` / `requireSuperAdmin` |
| `logger.ts` | `logSystem`, `logAudit`, `newRequestId` — centralized server logging |
| `ftp/uploader.ts`, `ftp/storage.ts` | FTP операции через basic-ftp + path/URL builder |
| `history/cardWriter.ts` | Создание card + generations row + fire-and-forget FTP upload. Использует `resolveCanvasSize` из `imageSizes.ts` для точных DB-размеров. |
| `history/queries.ts` | Shared queries для list/detail карточек, reused в /api/history и /api/admin/history |
| `history/aiNaming.ts` | gpt-4o-mini AI naming, биллинг, kill-switch через `ai_naming_enabled` |
| `history/uploadRetryWorker.ts` | Crash-recovery FTP retry (in-app scheduler, 2 мин, прогрессивный backoff) |
| `history/retentionWorker.ts` | Retention worker (6h, hard-delete + cleanup logs) |

### Frontend libs (`src/lib/`)
| Файл | Что |
|---|---|
| `auth-context.tsx` | `<AuthProvider>` + `useAuth()` |
| `generation-context.tsx` | **Root-level provider** для master+batch state. Переживает навигацию. `runMaster()`, `runBatch()`, `cancel()`, `clear()`. localStorage persist. Защита `clear()` от обрыва активной работы. |
| `api-client.ts` | `apiFetch` / `apiJson` с auto-Bearer токеном |
| `imageGen.ts` | `generateImage(payload)` + `extractMasterDetails()` + `resizeToExact()` (чистый scale через canvas, без crop) |

### Frontend routes (`src/routes/`)
| Файл | Что |
|---|---|
| `__root.tsx` | Обёрнут в `<AuthProvider>` + `<GenerationProvider>` |
| `index.tsx` | `/` — главная (ImageGenApp) |
| `login.tsx` | `/login` (Google c принудительным account-picker'ом + email/pwd + forgot) |
| `reset-password.tsx` | `/reset-password` |
| `account.tsx` | `/account` — личный кабинет (включает AppHeader) |
| `admin.tsx` | `/admin` — 5 вкладок: Пользователи / Истории / Тарифы / Настройки / Логи (включает AppHeader) |
| `history/index.tsx` | `/history` — masonry-grid карточек **сгруппированных по дням** (Сегодня/Вчера/DD.MM.YYYY) |
| `history/$cardId.tsx` | `/history/$cardId` — полностраничный детальный view (не модалка) |

### Key components (`src/components/`)
| Файл | Что |
|---|---|
| `ImageGenApp.tsx` | Главная форма. Подключена к `generation-context`. preset+model persist в localStorage. История-load через `?card=<id>` + clone-card при смене preset. |
| `AppHeader.tsx` | Шапка с балансом + badge failed-uploads + **GenerationIndicator** (Sora-стиль bell/check chip с прогрессом + cancel). Показывается на `/`, `/history`, `/account`, `/admin`. |
| `resize/ResizeResultsGrid.tsx` | Грид тайлов. **Различает API-тайлы (✨ amber) от scale-тайлов (⤢ emerald)**. Сводка: «N API · M без API». |

### DB Migrations
| Файл | Что |
|---|---|
| `0001_init.sql` | Initial: profiles, pricing_coefficients, credit_transactions, generations + RLS + RPC |
| `0002_history_feature.sql` | generation_cards, app_settings, audit_logs, system_logs + расширение generations |
| `0003_fix_service_role_check.sql` | Промежуточный fix (заменён 0004) |
| `0004_use_auth_role.sql` | Финальный fix: `auth.role()` вместо `current_user` для service_role проверок в RPC |

## 🎨 Image Generation Pipeline (актуально)

### Master generation
1. Фронт: `gen.runMaster(payload)` → POST `/api/generate-image` без `source_image`
2. Бэк: `resolveCanvasSize(aspect)` → нативный размер (например 16:9 → 1792×1008)
3. OpenAI `gpt-image-2` → JPEG dataURL
4. spend_credits + insert generation_cards + insert generations (master, upload_status='pending')
5. **AI naming** fire-and-forget (gpt-4o-mini, биллится юзеру)
6. **FTP upload** fire-and-forget. На failure → буфер на disk, retry воркером
7. **Логируется в system_logs** category `image-gen` (success/error)

### Resize batch (новый pure-scale flow)
1. Группируем размеры по аспекту → buckets
2. **Vision pre-pass** (gpt-4o-mini extract-master) **ТОЛЬКО** если есть bucket с другим аспектом. Логируется. Принимает URL ИЛИ dataURL (для history-loaded master)
3. Для каждого bucket:
   - Same aspect как мастер → **pure scale** master → каждый тайл (0 API, бесплатно)
   - Другой аспект → ОДИН i2i call: `target_w/h` = размер самого большого тайла → `resolveCanvasSize(ratio, target_w, target_h)` находит точный нативный canvas. Затем все тайлы bucket'а — чистый downscale из bucket source
4. Каждый готовый тайл → POST `/api/history/$cardId/resize-tile` → DB row (kind=client_resize) + FTP upload
5. Bucket i2i вызов идёт с `skip_history_attach: true` (бакет-source не аттачится к карточке, только тайлы)

### Server-side URL→dataURL для history-loaded master
- Если `body.source_image` начинается с `http(s)://` — сервер **fetch'ит URL, конвертит в dataURL**, дальше pipeline идёт идентично fresh-master случаю
- Без этого ресайзы из истории терялись бы как референс (выглядели как новые независимые генерации)

## 🗄️ Database Schema (summary)

```sql
profiles { id, email, first_name, last_name, nickname, credits_balance, ... }
pricing_coefficients { model, quality, coefficient }   -- gpt-image-2/{low,med,high}, gpt-4o-mini/standard
credit_transactions { user_id, delta, reason, meta }
generations { id, user_id, model, quality, total_tokens, cost_credits, card_id, is_master, public_id, image_url, ftp_path, filename, width, height, upload_status, upload_attempts, next_retry_at, deleted_at, meta }
generation_cards { id, user_id, name, preset_id, form_snapshot, is_favorite, inspired_by_card_id, created_at, last_activity_at, expires_at, deleted_at, hard_delete_after, search_tsv }
app_settings { key, value, description, updated_by, updated_at }   -- 12 ключей
audit_logs { user_id, target_user_id, action, resource_type, resource_id, details, ip_address, user_agent }
system_logs { level, category, message, context, user_id, request_id, duration_ms, error_stack }
```

**RPC functions:**
- `is_caller_super_admin()`
- `admin_grant_credits(target, delta, reason, meta)` — atomic credit grant + audit
- `spend_credits(user, amount, meta)` — atomic списание
- `touch_card_activity(card_id)` — bump activity + reset expires
- `soft_delete_card(card_id)` — soft-delete + hard_delete_after
- `restore_card(card_id)` — undo within grace
- `admin_set_setting(key, value)` — super-admin only + audit
- `cleanup_expired_logs()` — service_role only (через `auth.role()`)
- `hard_delete_card(card_id)` — service_role only

## 🚦 Background Workers (in-process)

| Worker | Интервал | Что делает |
|---|---|---|
| `uploadRetryWorker` | 2 мин | Retry FTP upload pending rows. Прогрессивный backoff: 30s/2m/10m/60m. Max 100 попыток / 72ч. |
| `retentionWorker` | 6 ч | Hard-delete expired карточек (FTP + DB). Cleanup system_logs + audit_logs per app_settings. |

Оба стартуют в `src/server.ts` boot, `setInterval.unref()` (не блокируют exit).

## 🎚️ Catalog: BANNER_SIZE_GROUPS

6 групп use-case (Pinterest удалён, его сайзы переехали в web-vertical):
1. **social-posts** — Instagram/FB feed (1:1, 4:5)
2. **stories** — TikTok/Reels/Stories (9:16)
3. **youtube** — YouTube/Презентации (16:9)
4. **web-horizontal** — display ads, web banners (3:2, 4:3, 5:4)
5. **web-vertical** — sidebars (2:3, 3:4 — включая бывшие Pinterest 1080×1440, 960×1280, 768×1024)
6. **tiny** — мини-плашки

## 💰 Billing Model

- gpt-image-2: `tokens × coefficient` (default 0.001 → 10000 tokens = 10 кредитов)
- gpt-4o-mini (vision + ai-naming): тот же mechanism, model='gpt-4o-mini' / quality='standard'
- Same-aspect ресайз = **0 кредитов** (только canvas scale)
- Different-aspect bucket = 1 API вызов на весь бакет (не на тайл)
- Vision pre-pass: 1 на пакет (только если нужен i2i)
- AI naming: 1 на новую карточку (если `ai_naming_enabled=true`)

## ⚙️ App Settings (через `/admin → Настройки`)

| Ключ | Default | Что |
|---|---|---|
| `retention_cards_months` | 12 | Срок жизни карточек |
| `retention_logs_days` | 90 | Срок жизни system_logs |
| `retention_audit_days` | -1 | Срок жизни audit_logs (-1 = никогда) |
| `card_delete_grace_hours` | 24 | Окно восстановления |
| `ftp_retry_max_attempts` | 100 | Макс попыток FTP |
| `ftp_retry_max_hours` | 72 | Дедлайн FTP-ретраев |
| `crash_recovery_interval_minutes` | 2 | Интервал воркера ретраев (требует рестарт) |
| `resize_format` | png | png \| jpg90 \| jpg95 (master всегда PNG, для ресайзов опция) |
| `bulk_zip_max_cards` | 20 | Лимит bulk-ZIP |
| `history_page_size` | 20 | Размер страницы /history |
| `ai_naming_enabled` | true | Включить gpt-4o-mini polishCardName |
| `ai_naming_model` | gpt-4o-mini | Модель для AI-имён |

## 🔧 Major Changes Recent Session

1. **`useResizeBatch` → `generation-context.tsx`** — state lifted to root, переживает навигацию. master+tiles в localStorage. Sora-стиль chip-индикатор в AppHeader. `cancel()` отдельно от `clear()`.
2. **Pure-scale resize flow** — никакого smartcrop. Через `resizeToExact` (drawImage). Per-bucket один i2i, тайлы — чистый downscale.
3. **`imageSizes.ts`** — точный native size алгоритм через reduced ratio + step (lcm от 16/gcd). 10 аспектов поддерживаются нативно gpt-image-2.
4. **Bug fix: server fetch URL→dataURL** — без этого history-loaded master терялся как референс при ресайзе.
5. **Промпт safety**: vision pre-pass переписан с forbidden-words список + server-side scrubber. content-policy block в i2i промпте. Снижает safety_violations=[sexual].
6. **/history** — masonry grid + группировка по дням + полностраничный detail (не модалка). Aspect-correct превью тайлов.
7. **Background generation** — Sora-стиль: chip в шапке показывает прогресс везде. Клик → `/`. Cancel ✕. State в localStorage, переживает F5.
8. **Resize-type indicator** — chip ✨ API / ⤢ scale на каждом тайле + сводка над гридом. Юзер видит сколько реально оплачивается.
9. **AppHeader на /admin и /account** — был только на /, /history. Теперь везде.
10. **Persist `preset` + `model`** в localStorage — навигация не сбрасывает форму.
11. **`clone-card`** — стрипает накапливающийся суффикс «(новая категория)».
12. **Cost transparency**: 188 client-crop тайлов = 0 кредитов. Все OpenAI вызовы логируются (master + resize + vision + ai-naming).
13. **bulk-zip** — `generateAsync({type:'blob'})` вместо stream (раньше архив был 1KB битый).
14. **`/admin → Логи` timestamp** в формате `DD.MM.YYYY HH:MM:SS`.
15. **Google OAuth** — `prompt=select_account` (показывает picker всегда).

## 🚨 Known Issues

1. **HMR в dev может ресетить generation context** — в prod-сборке (без HMR) не воспроизводится. Признаки: чип пропал во время кодинга. Лечится: запускать тесты когда никто параллельно не правит код.
2. **`crash_recovery_interval_minutes`** — настройка применяется только после рестарта. Worker hardcoded интервалом сейчас. Future: реактивно перечитывать.
3. **`resize_format` JPG/PNG** — поле в admin есть, но в pipeline ещё не врезано (всегда JPEG из OpenAI, или PNG для мастера). Future задача.
4. **clone-card shares FTP file** — если retention удалит оригинал, клон сломается. Принято для MVP. Future: ref-counting в FTP.
5. **`gen.clear()` при HMR-induced unmount** может теряться по таймингу. Защита есть (`if isBusy return`), но если HMR пере-выполняет провайдер — `cancelRef` новый, старый loop orphan.

## 🛠️ How to Run

```bash
cd "D:\Project_Normandy\Dream Weaver Studio"
bun install
bun run dev   # localhost:8080 (или 8081/8082 если занят)
```

После запуска видны в логах:
```
[upload-retry-worker] started, interval=120000ms, ...
[retention-worker] started, interval=21600000ms
```

## 🧪 Sanity Checks

```bash
# Все защищённые endpoints без токена → 401:
curl http://localhost:8080/api/me
curl http://localhost:8080/api/history/
curl http://localhost:8080/api/admin/logs

# Главная — 200:
curl -o /dev/null -w "%{http_code}" http://localhost:8080/

# Подсчёт API-вызовов за период (использует SUPABASE_SERVICE_ROLE_KEY):
bun run scripts/check-api-calls.ts
```

## 🔐 Super Admins (хардкод)

В двух местах:
1. SQL `is_super_admin()` в миграции
2. `src/lib/auth-server.ts → SUPER_ADMIN_EMAILS`

Список: `kela@clickable.agency`, `skobelev@clickable.agency`. При добавлении — править оба.

## 📊 Logging Categories

| Category | Источник | Что |
|---|---|---|
| `image-gen` | generate-image.ts + extract-master.ts | master generated / resize generated / vision pre-pass succeeded / errors |
| `ai-naming` | aiNaming.ts | card name polished / pricing lookup / provider errors |
| `ftp` | cardWriter + uploadRetryWorker + resize-tile | upload succeeded/failed/retry/give-up |
| `history` | cardWriter + resize-tile + clone-card | card created / generation added / clone created |
| `billing` | generate-image.ts | spend_credits failures |
| `cron` | retentionWorker | hard-delete success/fail |

Audit actions: `card.created`, `card.renamed`, `card.favorited`, `card.unfavorited`, `card.soft_deleted`, `card.restored`, `card.cloned_to_new_preset`, `generation.master_created`, `generation.resize_added`, `settings.updated`, `admin.viewed_user_history`, etc.

## 🎬 Context для нового чата

> Привет, продолжаем работу над Dream Weaver Studio. Полный handover в HANDOVER.md в корне проекта. Сейчас нужно: [твоя задача]. Архитектура устойчивая — generation context на root, FTP+history+retention в Node-runtime, vision/ai-naming/billing полностью логируются.

---

**Удачи!** Если что-то отвалится — `bun run scripts/check-api-calls.ts` и `/admin → Логи` дадут полную картину OpenAI hits и system events.
