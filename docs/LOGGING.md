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
(`logger.ts:86-115`, `logger.ts:129-146`).

Обе функции **редактируют секреты перед записью** (SEC-M6, см. §6): `context` /
`details` проходят рекурсивный key-scrubber, а `message` / `error_stack` —
скраб секрето-образных строк (`logger.ts:52-84`).

---

## 1. `logSystem()` — `system_logs`

Сигнатура `SystemLogArgs` (`logger.ts:39-50`). Поля строки:

| Поле | Тип | Примечание |
|------|-----|-----------|
| `level` | `error \| warn \| info \| debug` | Выбирает и `console`-метод (`logger.ts:89-90`) |
| `category` | enum `LogCategory` или строка | См. §3 |
| `message` | string | Скрабится от секретов, затем обрезается до 1000 символов (`logger.ts:88`, `:105`) |
| `context` | jsonb | Произвольный контекст (id, токены, размеры…); **рекурсивно редактируется** (`logger.ts:87`) |
| `user_id` | uuid? | Чей запрос |
| `request_id` | string? | Корреляция запроса (см. §4) |
| `duration_ms` | number? | Округляется (`logger.ts:109`) |
| `error_stack` | text | Из `error.stack`/`.message`, скрабится от секретов, обрезается до 8000 (`logger.ts:95-101`, `:110`) |
| `supa` | client? | Передать готовый клиент, иначе берётся admin-клиент (`logger.ts:94`) |

> Воркеры (`uploadRetryWorker.ts:118-134`, `retentionWorker.ts:44-60`) имеют
> **собственные локальные `logSystem`** — узкие обёртки прямо в `system_logs` с
> фиксированной категорией (`ftp` и `cron` соответственно), а не вызов общего
> логгера.

---

## 2. `logAudit()` — `audit_logs`

Сигнатура `AuditLogArgs` (`logger.ts:117-127`). Поля строки (`logger.ts:132-141`):

| Поле | Примечание |
|------|-----------|
| `user_id` | Кто совершил действие |
| `target_user_id` | Над кем (например при админ-гранте) |
| `action` | Строка-код, обрезается до 120 (`logger.ts:135`) |
| `resource_type` / `resource_id` | Например `card` / id карточки |
| `details` | jsonb; **рекурсивно редактируется** перед записью (`logger.ts:138`) |
| `ip_address` / `user_agent` | Опционально |

При провале — fallback в `console.error`, без throw (`logger.ts:142-145`).

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
(`logger.ts:148-155`). Так делает `generate-image` (`requestId` идёт в
`spend_credits`-лог и в финальный «master generated», `:1813`, `:1873`) и
`extract-master` (`:259`, `:289`).

> `audit_logs` поля `request_id` не имеет — корреляция запроса живёт только в
> `system_logs`.

---

## 5. Что логируется на каждом шаге

| Шаг | Категория / уровень | Событие |
|-----|---------------------|---------|
| Старт мастера/ресайза, успех | `image-gen` / `info` | «master/resize generated» — токены, `charge`, `new_balance`, `card_id`, `billing_error` (`generate-image.ts:1871`) |
| Списание упало | `billing` / `error` | «spend_credits rpc failed» / «… unexpected» (`generate-image.ts:1811`, `:1830`) |
| Vision-препасс | `image-gen` / `info`+`error` | «vision pre-pass succeeded / provider error / unexpected failure» (`extract-master.ts:287`, `:257`, `:307`) |
| Карточка создана | audit `card.created` + `history`/`error` при сбое вставки (`cardWriter.ts:211`, `:223`) |
| Генерация записана | audit `master_created`/`resize_added` (`cardWriter.ts:331`) |
| FTP — первая попытка | `ftp` / `info`\|`warn` | «upload succeeded (first try)» / «first FTP attempt failed — queued for retry» (`cardWriter.ts:435`, `:453`) |
| FTP — ретрай | `ftp` / `info`\|`warn`\|`error` | «upload retry succeeded/failed», «give-up: age/max attempts/no buffer» (`uploadRetryWorker.ts:193`–`:225`) |
| AI-наименование | `ai-naming`/`info`+`warn`, `billing`/`warn` при сбое списания (`aiNaming.ts:240`, `:215`) |
| Ретеншен | `cron` / `info`\|`warn`\|`error` | «card hard-deleted», «ftp delete failed (continuing)» (`retentionWorker.ts:141`, `:125`) |

---

## 6. SEC-M6: логгер редактирует секреты ◐ (частично закрыто)

Evidence: `src/lib/logger.ts:52-84`, `:87-88`, `:101`, `:138`; PLAN.md `:23`.

Логгер теперь **скрабит секреты перед записью** — это «belt-and-suspenders»
поверх правила «не клади секреты в логи на call-site». Защита двухслойная.

### 6.1 Рекурсивная редакция по ключу — `context` / `details`

`redactSecrets()` (`logger.ts:72-84`) обходит объект рекурсивно (массивы и
вложенные объекты, до глубины 6, `:73`) и, если **имя ключа** матчит
`SECRET_KEY_RE`, подменяет значение на `"[REDACTED]"`. Паттерн ключей
(`logger.ts:56-57`):

```
authorization | api[-_]?key | secret | token | password | passwd |
bearer | cookie | credential
```

Применяется к `context` в `logSystem` (`logger.ts:87`) и к `details` в `logAudit`
(`logger.ts:138`). Строковые значения, не попавшие под ключ, дополнительно
проходят скраб по форме (см. 6.2).

### 6.2 Скраб секрето-образных строк — `message` / `error_stack`

`scrubSecretText()` (`logger.ts:61-68`) вырезает секреты **по форме токена** из
произвольного текста, даже если он не лежит под «секретным» ключом:

| Что | Замена |
|-----|--------|
| OpenRouter-ключ `sk-or-v1-…` | `[REDACTED_KEY]` |
| OpenAI-ключ `sk-…` | `[REDACTED_KEY]` |
| Supabase secret-ключ `sb_secret_…` | `[REDACTED_KEY]` |
| JWT `eyJ….….…` | `[REDACTED_JWT]` |
| `bearer <token>` | `bearer [REDACTED]` |

Применяется к `message` (`logger.ts:88`) и к `error_stack` (после извлечения из
`error.stack`/`.message`, `logger.ts:95-101`) в `logSystem`. Скрабленные значения
идут и в `console`, и в `system_logs`. (Эти же `scrubSecretText` вызываются и
рекурсивно для всех строк внутри `context`/`details` через `redactSecrets`.)

> Зачем именно тут: `FTP_PASS`, `service_role`, ключи OpenAI/OpenRouter лежат в
> `.env` (см. `docs/STORAGE_FTP.md`, SEC-H3/H5). Если такой ключ просочится в
> `context`, в сообщение или в стек ошибки провайдера — он не осядет в
> `system_logs` (читается из `/admin → Логи`) открытым текстом.

### 6.3 Что ещё открыто

- **Детали ошибок утекают клиенту** — провайдерские сообщения всё ещё отдаются в
  ответе вместо generic-ошибки (например `detail` в биллинговом 402,
  `generate-image.ts:1905`). PLAN.md помечает SEC-M6 как ◐ именно из-за этого
  («провайдер-`detail` клиенту остался», PLAN.md `:23`).
- **Длина** `message`/`error_stack`/`action` по-прежнему обрезается
  (1000/8000/120 символов) — это отдельная защита от раздувания строки, а не
  замена редакции.
