# Логирование

Серверный код пишет наблюдаемость не в `console`, а в две таблицы Supabase через
централизованный логгер `src/lib/logger.ts`. Причина: вывод в `console`
исчезает вместе с процессом, а строки в БД доступны в `/admin → Логи` и
переживают рестарт (`logger.ts:4-8`).

Две таблицы — две задачи:

| Таблица | Помощник | Что туда пишут | Ретеншен |
|---------|----------|----------------|----------|
| `system_logs` | `logSystem()` | Техническая наблюдаемость: ошибки, ретраи, длительности, события FTP/биллинга | Короткий (чистится `cleanup_expired_logs`) |
| `audit_logs` | `logAudit()` | Бизнес/безопасность: создание карточки, удаления, админ-действия | Долгий (не под короткой чисткой, `logger.ts:16-18`) |

Обе функции **best-effort**: всегда сначала пишут в `console`, затем
fire-and-forget вставляют строку и **никогда не бросают** исключение наверх
(`logger.ts:52-78`, `logger.ts:92-109`).

---

## 1. `logSystem()` — `system_logs`

Сигнатура `SystemLogArgs` (`logger.ts:39-50`). Поля строки:

| Поле | Тип | Примечание |
|------|-----|-----------|
| `level` | `error \| warn \| info \| debug` | Выбирает и `console`-метод (`logger.ts:53-55`) |
| `category` | enum `LogCategory` или строка | См. §3 |
| `message` | string | Обрезается до 1000 символов (`logger.ts:69`) |
| `context` | jsonb | Произвольный контекст (id, токены, размеры…) |
| `user_id` | uuid? | Чей запрос |
| `request_id` | string? | Корреляция запроса (см. §4) |
| `duration_ms` | number? | Округляется (`logger.ts:72`) |
| `error_stack` | text | Из `error.stack`/`.message`, обрезается до 8000 (`logger.ts:59-64`, `:71`) |
| `supa` | client? | Передать готовый клиент, иначе берётся admin-клиент (`logger.ts:58`) |

> Воркеры (`uploadRetryWorker.ts:118-134`, `retentionWorker.ts:44-60`) имеют
> **собственные локальные `logSystem`** — узкие обёртки прямо в `system_logs` с
> фиксированной категорией (`ftp` и `cron` соответственно), а не вызов общего
> логгера.

---

## 2. `logAudit()` — `audit_logs`

Сигнатура `AuditLogArgs` (`logger.ts:80-90`). Поля строки (`logger.ts:95-103`):

| Поле | Примечание |
|------|-----------|
| `user_id` | Кто совершил действие |
| `target_user_id` | Над кем (например при админ-гранте) |
| `action` | Строка-код, обрезается до 120 (`logger.ts:98`) |
| `resource_type` / `resource_id` | Например `card` / id карточки |
| `details` | jsonb |
| `ip_address` / `user_agent` | Опционально |

При провале — fallback в `console.error`, без throw (`logger.ts:105-107`).

Примеры аудит-действий: `card.created` (`cardWriter.ts:223`),
`generation.master_created` / `generation.resize_added` (`cardWriter.ts:331`,
`resize-tile.ts:135`).

---

## 3. Категории `system_logs`

`LogCategory` (`logger.ts:28-37`): `ftp`, `image-gen`, `ai-naming`, `auth`,
`cron`, `api`, `admin`, `history`, `billing`.

| Категория | Где пишется | Типичные сообщения |
|-----------|-------------|--------------------|
| `image-gen` | `generate-image.ts`, `extract-master.ts` | «master/resize generated», «generate-image failed», «vision pre-pass …» |
| `ftp` | `cardWriter.ts`, `resize-tile.ts`, `uploadRetryWorker.ts` | «upload succeeded (first try)», «first FTP attempt failed — queued for retry», «upload retry succeeded/failed/give-up» |
| `ai-naming` | `aiNaming.ts` | «card name polished», «ai-naming provider error», «pricing lookup failed (used fallback)» |
| `history` | `cardWriter.ts`, `resize-tile.ts` | «generation_cards insert failed», «generations insert failed», «touch_card_activity rpc failed» |
| `billing` | `generate-image.ts`, `aiNaming.ts` | «spend_credits rpc failed», «spend_credits unexpected», «ai-naming spend_credits failed» |
| `cron` | `retentionWorker.ts` | «card hard-deleted», «retention: ftp delete failed (continuing)», «hard_delete_card rpc failed» |
| `auth` / `api` / `admin` | прочие эндпоинты | аутентификация, общие API-события, админ-действия |

---

## 4. Корреляция запроса — `request_id`

`newRequestId()` (`logger.ts:116-118`) даёт дешёвый id вида
`{base36-времени}_{рандом}`. Его прокидывают через все `logSystem` в одном
HTTP-хендлере, чтобы в `/admin → Логи` отфильтровать связанные строки
(`logger.ts:111-115`). Так делает `generate-image` (`requestId` идёт в
`spend_credits`-лог и в финальный «master generated», `:1793`, `:1853`) и
`extract-master` (`:274`, `:294`).

> `audit_logs` поля `request_id` не имеет — корреляция запроса живёт только в
> `system_logs`.

---

## 5. Что логируется на каждом шаге

| Шаг | Категория / уровень | Событие |
|-----|---------------------|---------|
| Старт мастера/ресайза, успех | `image-gen` / `info` | «master/resize generated» — токены, `charge`, `new_balance`, `card_id`, `billing_error` (`generate-image.ts:1847`) |
| Списание упало | `billing` / `error` | «spend_credits rpc failed» / «… unexpected» (`generate-image.ts:1787`, `:1806`) |
| Vision-препасс | `image-gen` / `info`+`warn` | «vision pre-pass succeeded / provider error / unexpected failure» (`extract-master.ts:269`, `:242`, `:292`) |
| Карточка создана | audit `card.created` + `history`/`error` при сбое вставки (`cardWriter.ts:211`, `:223`) |
| Генерация записана | audit `master_created`/`resize_added` (`cardWriter.ts:331`) |
| FTP — первая попытка | `ftp` / `info`\|`warn` | «upload succeeded (first try)» / «first FTP attempt failed — queued for retry» (`cardWriter.ts:435`, `:453`) |
| FTP — ретрай | `ftp` / `info`\|`warn`\|`error` | «upload retry succeeded/failed», «give-up: age/max attempts/no buffer» (`uploadRetryWorker.ts:193`–`:225`) |
| AI-наименование | `ai-naming`/`info`+`warn`, `billing`/`warn` при сбое списания (`aiNaming.ts:240`, `:215`) |
| Ретеншен | `cron` / `info`\|`warn`\|`error` | «card hard-deleted», «ftp delete failed (continuing)» (`retentionWorker.ts:141`, `:125`) |

---

## 6. Известный долг — SEC-M6: логгер не редактирует секреты

Evidence (PLAN.md §1): `generate-image.ts:1530`, `fetch-master.ts:40`,
`src/lib/logger.ts`.

Проблема трёхсоставная:

1. **Логгер не скрабит секреты.** `logSystem`/`logAudit` пишут `context` /
   `details` / `error_stack` **как есть** — нет рекурсивного key-scrubber по
   ключам вроде `authorization` / `apikey` / `token` / `password` / `secret`.
   Если такой ключ попадёт в `context` или в текст ошибки провайдера, он
   осядет в `system_logs` открытым текстом. (Связано с тем, что `FTP_PASS`,
   `service_role`, ключи OpenAI/OpenRouter лежат в `.env` — см.
   `docs/STORAGE_FTP.md`, SEC-H3/H5.)
2. **Детали ошибок утекают клиенту** — провайдерские сообщения отдаются в ответе
   вместо generic-ошибки.
3. **`ftp_path` отдаётся в ответах** не-админам.

Планируемый фикс (PLAN.md §1): рекурсивный key-scrubber секретов в логгере;
generic-ошибки клиенту; убрать `ftp_path` из ответов не-админам.

> Дополнительно: единственная защита `error_stack`/`message` сейчас — обрезка по
> длине (1000/8000/120 символов), это не редакция содержимого.
