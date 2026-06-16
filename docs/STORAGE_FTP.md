# Хранилище баннеров: FTP

Готовые баннеры (мастера и resize-тайлы) лежат не в Supabase, а на внешнем
FTP-сервере (библиотека `basic-ftp`). В БД хранятся только метаданные строки
`generations` — публичный URL (`image_url`), путь на FTP (`ftp_path`) и имя
файла (`filename`). Загрузка всегда **фоновая (fire-and-forget)**: пользователь
получает картинку в ответе ещё до того, как она долетит до FTP.

Слои:

| Слой | Файл | Ответственность |
|------|------|-----------------|
| Низкий уровень | `src/lib/ftp/uploader.ts` | Соединение, upload/delete/ping. Без пула — свежий коннект на каждый вызов |
| Высокий уровень | `src/lib/ftp/storage.ts` | Построение пути/URL, decode dataURL, `uploadImage`/`deleteCardFiles` |
| Запись истории | `src/lib/history/cardWriter.ts` | Создаёт строки, запускает фоновую загрузку мастера/ресайза |
| Resize-тайлы | `src/routes/api/history/$cardId.resize-tile.ts` | Отдельный эндпоинт для клиентских кропов |
| Воркер повторов | `src/lib/history/uploadRetryWorker.ts` | Крэш-устойчивый ретрай неудавшихся загрузок |
| Воркер ретеншена | `src/lib/history/retentionWorker.ts` | Hard-delete файлов + чистка логов |
| Старт воркеров | `src/server.ts` | Запуск обоих воркеров при буте процесса |

---

## 1. Конфигурация (env)

Все настройки FTP читаются из переменных окружения. Здесь — **только названия**;
значения держите в secret-store платформы, не в репозитории.

### Подключение — `getFtpConfig()` (`src/lib/ftp/uploader.ts:22`)

| Переменная | Обязательна | Назначение / дефолт |
|------------|-------------|---------------------|
| `FTP_HOST` | да | Хост FTP. Без неё `uploader` бросает ошибку |
| `FTP_USER` | да | Логин |
| `FTP_PASS` | да | Пароль |
| `FTP_PORT` | нет | Порт, по умолчанию `21` (`uploader.ts:31`) |
| `FTP_SECURE` | нет | FTPS только при строковом значении `"true"` (`uploader.ts:34`) |

Если не задана любая из `FTP_HOST` / `FTP_USER` / `FTP_PASS` — бросается
`Error("FTP_HOST / FTP_USER / FTP_PASS must be set in environment")`
(`uploader.ts:26-28`).

### Путь и URL — `storage.ts`

| Переменная | Обязательна | Назначение |
|------------|-------------|-----------|
| `FTP_BASE_PATH` | да | Базовый путь на сервере (например `/public_html/...`). Хвостовые слэши срезаются — `getBasePath()` (`storage.ts:26-30`) |
| `FTP_BASE_URL` | да | Базовый публичный HTTPS-URL для построения `image_url` — `getBaseUrl()` (`storage.ts:32-36`) |

> **Долг (SEC-C2/SEC-H5, PLAN.md §1).** `FTP_PASS` и прочие прод-секреты сейчас
> лежат открытым текстом в `.env` в каталоге репозитория. Считать
> засвеченными → ротация пароля + переезд в secret-store. Логгер их **не
> редактирует** (см. `docs/LOGGING.md`, SEC-M6).

---

## 2. Построение пути и URL (`storage.ts`)

`buildPath()` (`storage.ts:68-83`) собирает и FTP-путь, и публичный URL по
единой схеме. Раскладка на сервере:

```
{FTP_BASE_PATH}/{userIdShort}/{YYYY-MM}/{kind}_{publicId}_{YYYYMMDD}[_{WxH}]_{random}.{ext}
```

Из чего складывается имя (`storage.ts:71-80`):

| Часть | Источник | Подробности |
|-------|----------|-------------|
| `userIdShort` | `shortUserId()` (`storage.ts:38-40`) | UUID без дефисов, первые 8 символов. Изоляция пользователей без утечки полного id |
| `{YYYY-MM}` | `monthFolder()` (`storage.ts:42-46`) | Помесячная папка по **UTC** |
| `kind` | аргумент | `master` или `resize` (`ImageKind`, `storage.ts:17`) |
| `publicId` | `generations.public_id` | Отдельный UUID, **не** серийный `generations.id` (тот бы выдавал объём активности) |
| `{YYYYMMDD}` | `dateStamp()` (`storage.ts:48-53`) | Дата по UTC |
| `{WxH}` | `width`/`height` | Добавляется только если заданы обе размерности (`storage.ts:76`) — у мастера их нет, у ресайза есть |
| `random` | `randomSuffix()` (`storage.ts:55-57`) | 8 hex-символов (4 байта, `randomBytes`). Анти-гадание |
| `ext` | `ImageFormat` | `png` или `jpg` |

Файлы **никогда не переиспользуют имена** (каждый раз новый `random`), поэтому
`uploadFile` спокойно перезаписывает существующий путь (`uploader.ts:51-53`).

> **Долг (SEC-H3, PLAN.md §1, evidence `storage.ts:79`).** Публичные баннеры
> доступны по **угадываемому URL без авторизации**: путь содержит стабильный
> `userIdShort`, а случайности — лишь ~32 бита. Любой, кто знает/подберёт URL,
> скачает чужой баннер. Планируемый фикс: отдавать через authenticated-прокси с
> проверкой владельца либо подписанные истекающие URL; рандом ≥128 бит; убрать
> стабильный `userIdShort` из пути.

---

## 3. Загрузка fire-and-forget

Общий принцип: строка `generations` пишется со статусом `upload_status='pending'`,
затем **детачится** фоновая загрузка. Ответ пользователю не ждёт FTP.

### 3.1 Мастер и i2i-ресайз — `cardWriter.ts`

`recordGenerationAndUpload()` (`cardWriter.ts:174`) после вставки строки
`generations` вызывает `uploadInBackground()` через `void` — **только если есть
карточка** (`cardId && generationId && gen.public_id`, `cardWriter.ts:349`).
Legacy-строки без карточки FTP пропускают (`upload_status='legacy'`,
`cardWriter.ts:301`).

`uploadInBackground()` (`cardWriter.ts:392`):

1. `decodeDataUrl(image)` → buffer + формат (`cardWriter.ts:399`). При провале —
   `upload_status='failed'`, выход.
2. `uploadImage(buffer, {...})` (`cardWriter.ts:418`). Для мастера `width/height`
   **не передаются** (в имени файла размеров нет), для ресайза — передаются.
3. Успех → патч строки: `image_url`, `ftp_path`, `filename`,
   `upload_status='success'` (`cardWriter.ts:426-434`) + лог `info`.
4. Провал первой попытки (`cardWriter.ts:450`):
   - лог `warn`;
   - `persistPendingBuffer(generationId, buffer, format)` — сохранить байты на
     диск, чтобы воркер мог их забрать после рестарта (`cardWriter.ts:476`);
   - патч строки: `upload_status='pending'`, `upload_attempts=1`,
     `next_retry_at = now + 30s`, `last_error` (`cardWriter.ts:491-500`).

Ошибки записи истории/загрузки **никогда не пробрасываются** наверх — упавшая
запись истории не должна мешать пользователю увидеть уже оплаченную картинку
(`cardWriter.ts:172-173`).

### 3.2 Resize-тайлы — `$cardId.resize-tile.ts`

Эндпоинт `POST /api/history/$cardId/resize-tile` для тайлов, посчитанных
полностью на клиенте (smartcrop / center-crop). Они не проходят через
`generate-image`, поэтому пишутся отдельно.

- **Биллинг отсутствует** — бакетная генерация уже была оплачена один раз
  (`cost_credits: 0`, `model: "client-crop"`, `resize-tile.ts:99-106`).
- Проверка владельца через user-scoped клиент (RLS) до вставки
  (`resize-tile.ts:77-88`) — чтобы не грузить FTP-файл для чужой/несуществующей
  карточки.
- Guard на пустые/мелкие пейлоады: отбрасывает base64 < 200 символов
  (`resize-tile.ts:68-72`) и пост-decode буфер < 100 байт (`resize-tile.ts:221`),
  чтобы не плодить 0-байтовые файлы на FTP.
- `uploadTile()` (`resize-tile.ts:187`) повторяет логику `uploadInBackground`:
  на провале — `persistPendingBuffer` + `pending`/`attempts=1`/`+30s`.

---

## 4. Воркер повторов загрузки (`uploadRetryWorker.ts`)

Крэш-устойчивый ретрай: байты лежат на диске, а не в памяти/БД, поэтому
переживают рестарт процесса.

### Параметры (`uploadRetryWorker.ts:53-58`)

| Константа | Значение | Смысл |
|-----------|----------|-------|
| `WORKER_INTERVAL_MS` | `2 * 60 * 1000` (2 мин) | Период тика |
| `MAX_ATTEMPTS` | `100` | Потолок попыток |
| `MAX_AGE_MS` | `72 * 60 * 60 * 1000` (72 ч) | Бюджет возраста строки |
| `BATCH_SIZE` | `20` | Строк за один тик |
| `TEMP_DIR` | `os.tmpdir()/dream-weaver-uploads` | Где лежат байты для ретрая |

### Хранение байтов

- `persistPendingBuffer()` (`uploadRetryWorker.ts:68`) пишет
  `{generationId}.{format}` в `TEMP_DIR`.
- `loadPendingBuffer()` (`uploadRetryWorker.ts:86`) перебирает `.png` и `.jpg`
  (формат отдельно не хранится).
- Почему файл, а не колонка/память: память теряется при крэше; колонка в БД
  перечитывала бы ~1.5 МБ через Supabase на каждый ретрай и пухла бы; диск —
  быстро и переживает крэш (`uploadRetryWorker.ts:36-39`).

### Выборка кандидатов — `tick()` (`uploadRetryWorker.ts:261`)

```
upload_status = 'pending'
AND upload_attempts < MAX_ATTEMPTS
AND (next_retry_at IS NULL OR next_retry_at <= now)
ORDER BY created_at ASC
LIMIT BATCH_SIZE
```

Возрастной лимит (`created_at > now-72h`) проверяется не в SQL, а в
`processOne()` по `MAX_AGE_MS` (`uploadRetryWorker.ts:148-158`).

### Backoff — `nextRetryDelayMs()` (`uploadRetryWorker.ts:111-116`)

| Попытки | Задержка |
|---------|----------|
| 1–9 (`< 10`) | 30 с |
| 10–29 (`< 30`) | 2 мин |
| 30–59 (`< 60`) | 10 мин |
| 60–99 | 60 мин |

Худший случай ≈ 46 ч — внутри 72-часового бюджета.

### Обработка строки — `processOne()` (`uploadRetryWorker.ts:147`)

1. Возраст > 72 ч → `markFailed` + чистка temp-файлов + лог `warn` «age limit».
2. Нет буфера на диске → `markFailed` («Бинарь не найден…») + лог `error`.
3. `uploadImage` успех → патч строки (`image_url`/`ftp_path`/`filename`/
   `upload_status='success'`, обнуление `next_retry_at`/`last_error`),
   `cleanupTempFiles`, лог `info`.
4. Провал и `nextAttempts >= MAX_ATTEMPTS` → `markFailed` + чистка + лог.
5. Иначе — `upload_attempts++`, `next_retry_at = now + backoff`, `last_error`.

Ошибки ловятся **по строке** — один битый upload не рвёт цикл
(`uploadRetryWorker.ts:288-294`).

### Старт — `startUploadRetryWorker()` (`uploadRetryWorker.ts:304`)

Идемпотентен. Делает один немедленный `tick()` на буте (подобрать «зависшие»
после крэша), дальше `setInterval`. Таймер `unref()`-нут, процесс не держит.

---

## 5. Воркер ретеншена (`retentionWorker.ts`)

Один тик раз в 6 часов решает две задачи (общая стоимость пробуждения):

### Параметры (`retentionWorker.ts:33-34`)

| Константа | Значение |
|-----------|----------|
| `TICK_INTERVAL_MS` | `6 * 60 * 60 * 1000` (6 ч) |
| `BATCH_SIZE` | `100` |

### 5.1 Hard-delete карточек

`fetchExpiringCards()` (`retentionWorker.ts:71`) собирает в один набор (по id,
дубликаты схлопываются через `Map`):

- карточки с истёкшим grace-окном soft-delete: `hard_delete_after IS NOT NULL`
  AND `hard_delete_after <= now` (`retentionWorker.ts:75-80`);
- карточки с истёкшим ретеншеном: `deleted_at IS NULL` AND `expires_at <= now`
  (`retentionWorker.ts:81-86`).

`processCard()` (`retentionWorker.ts:98`) на каждую карточку:

1. Читает все строки `generations` по `card_id`, собирает непустые `ftp_path`.
2. `deleteCardFiles(ftpPaths)` → `deleteFiles()` (`uploader.ts:82`): один коннект
   на пачку, ошибки удаления **по файлу глотаются** (`uploader.ts:92-94`).
3. `hard_delete_card` RPC (service-role) — каскадно сносит строки `generations`
   (`retentionWorker.ts:132`).
4. Лог `info` «card hard-deleted» с `file_count`.

### 5.2 Чистка логов

`cleanup_expired_logs` RPC (`retentionWorker.ts:169`) тримит `system_logs` /
`audit_logs` по их retention-настройкам. RPC идемпотентна и дёшева — гоняется
каждый тик.

### Старт — `startRetentionWorker()` (`retentionWorker.ts:184`)

Идемпотентен, один немедленный `tick()` на буте, дальше `setInterval`, таймер
`unref()`-нут.

> **Долг (SEC-M7, PLAN.md §1, evidence `retentionWorker.ts`).** Удаление файлов
> при ретеншене **ненадёжно**: строка БД сносится через `hard_delete_card`
> **даже если FTP-delete упал** — код логирует `warn` и идёт дальше, чтобы
> освободить место в БД (`retentionWorker.ts:121-130`). Итог — **осиротевшие
> файлы** на FTP (путь после удаления строки восстановить нельзя — только из
> лога). Дополнительно `clone-card` делит один `ftp_path` между карточками, так
> что удаление одной может стереть файл, ещё нужный другой. Планируемый фикс: не
> удалять строку БД при сбое FTP; ref-count на `ftp_path`.

---

## 6. Запуск воркеров (`src/server.ts`)

Оба воркера стартуют при буте процесса (`server.ts:13-14`):

```
startUploadRetryWorker(); // 2-мин такт, ретраит pending-загрузки
startRetentionWorker();   // 6-час такт, hard-delete карточек + чистка логов
```

Оба идемпотентны и держат `unref()`-нутые таймеры — не блокируют выход процесса.

> Замечание по среде выполнения: `basic-ftp` требует реальный Node `net.Socket`,
> поэтому FTP-слой работает **только в Node-рантайме**, не в Cloudflare Workers
> (`uploader.ts:2-4`). Воркеры на `setInterval` тоже рассчитаны на долгоживущий
> Node-процесс, а не на serverless-инстансы.
