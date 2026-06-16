# Размеры изображений — Dream Weaver Studio

> Как устроены **нативные размеры под аспекты** gpt-image-2 и каталог **целевых баннер-размеров**.
> Два модуля: `src/lib/imageSizes.ts` (математика канваса под OpenAI) и `src/lib/bannerSizes.ts` (use-case каталог + layout-шаблоны).
> Все пути — от корня `ban_gen_web/`. Связанный поток — `docs/GENERATION_FLOW.md`.

---

## 1. Два уровня размеров

| Уровень | Что это | Модуль |
|---------|---------|--------|
| **Нативный канвас** | Размер `WxH`, который реально отправляется в OpenAI как `size=` и записывается в `generations.width/height` | `src/lib/imageSizes.ts` |
| **Целевой тайл** | Точные пиксели, которые хочет пользователь (например, `1080×1920` Stories) | `src/lib/bannerSizes.ts` |

Связь: модель рисует на нативном канвасе (≥ целевого тайла, точный аспект), а клиент **даунскейлит** канвас в точные пиксели тайла. Так клиент никогда не апскейлит (`imageSizes.ts:10`).

---

## 2. Ограничения gpt-image-2

Из шапки `src/lib/imageSizes.ts:4`:

- Обе стороны делятся на **16**.
- Аспект между **1:3 и 3:1**.
- Макс. одна сторона — **3840** px (`OPENAI_MAX_EDGE`, `:23`).
- Суммарно пикселей — между **655 360** и **8 294 400** (`OPENAI_MAX_PIXELS`, `:24`).

Критично: **тот же размер**, что уходит в OpenAI, пишется в строку `generations`. Иначе имена файлов в zip и аспект-превью в `/history` соврут про реальную картинку. Поэтому модуль используют оба: `generate-image.ts` (параметр `size=`) и `cardWriter.ts` (`width/height` строки) — `imageSizes.ts:14`.

---

## 3. Нативные размеры под аспекты

### 3.1 Таблица `NATIVE`

`NATIVE` (`src/lib/imageSizes.ts:41`) задаёт на каждый именованный аспект: приведённое (coprime) отношение `ra:rb` и множитель `defaultM` для «2K-tier» канваса (~1.5–2.0 MP).

| Аспект | `ra:rb` | `defaultM` | 2K-дефолт (`ra·M × rb·M`) | Код |
|--------|---------|-----------|---------------------------|-----|
| 1:1 | 1:1 | 1024 | 1024×1024 | `:42` |
| 3:2 | 3:2 | 512 | 1536×1024 | `:43` |
| 2:3 | 2:3 | 512 | 1024×1536 | `:44` |
| 16:9 | 16:9 | 112 | 1792×1008 | `:45` |
| 9:16 | 9:16 | 112 | 1008×1792 | `:46` |
| 4:3 | 4:3 | 352 | 1408×1056 | `:47` |
| 3:4 | 3:4 | 352 | 1056×1408 | `:48` |
| 5:4 | 5:4 | 256 | 1280×1024 | `:49` |
| 4:5 | 4:5 | 256 | 1024×1280 | `:50` |
| 21:9 | 7:3 | 304 | 2128×912 (21:9 сводится к 7:3) | `:51` |
| 9:21 | 3:7 | 304 | 912×2128 | `:52` |

### 3.2 Шаг множителя (`step`)

Любой валидный `m` обязан давать обе стороны `ra·m` и `rb·m` кратными 16. Поэтому `m` должен быть кратен:

```
step = lcm( 16/gcd(ra,16), 16/gcd(rb,16) )
```

Функция `stepFor` (`src/lib/imageSizes.ts:89`). Примеры из комментария: 16:9 → step 16; 4:5 → step 16; 1:1 → step 16 (`:88`).

### 3.3 Кастомные аспекты (fallback)

Если аспект не из `NATIVE`, `entryFor` (`:65`) парсит `"a:b"`, сокращает на `gcd`, и подбирает `defaultM` так, чтобы длинная сторона была ~1024 px (`:78`). Нечисловой/нулевой ввод → `1:1` (`:71`).

---

## 4. `resolveCanvasSize` — главный алгоритм

`resolveCanvasSize(ratio, targetW?, targetH?)` (`src/lib/imageSizes.ts:109`) возвращает `{ w, h }`.

### 4.1 Шаги

| # | Шаг | Код |
|---|-----|-----|
| 1 | Берём `entry` (из `NATIVE` или fallback) и `step` | `:114`, `:115` |
| 2 | **Master-режим** (нет `targetW/targetH`): `m = defaultM`, выровненный по `step` | `:127`–`:131` |
| 3 | **Resize-режим** (есть target): `mForW = ceil(targetW/ra)`, `mForH = ceil(targetH/rb)`; `mMin = max(mForW, mForH, defaultM)`; округляем `m` вверх до кратного `step` | `:120`–`:126` |
| 4 | `w = ra·m`, `h = rb·m` | `:133` |
| 5 | Кламп под лимиты OpenAI: пока `w>3840 \|\| h>3840 \|\| w·h>8.29M` и `m>step` — уменьшаем `m` на `step` | `:137`–`:141` |
| 6 | Sanity-floor: если даже минимум превышает лимит — `1024×1024` | `:144` |

Итог в resize-режиме: **наименьший валидный канвас ≥ target по обеим сторонам**, с точным аспектом, обе стороны /16, в пределах лимитов. Клиент потом делает чистый даунскейл канвас → тайл.

### 4.2 `openAiSizeString`

`openAiSizeString(ratio, targetW?, targetH?)` (`:154`) — обёртка, возвращает строку `"WxH"` для API OpenAI. В `generate-image.ts` импортируется как `openAiSizeFor` (`generate-image.ts:117`) и используется:

- мастер: `openAiSizeFor(requestedAspect)` без target (`generate-image.ts:1456` при пустых target);
- i2i-бакет: `openAiSizeFor(requestedAspect, target_w, target_h)` — канвас под крупнейший тайл бакета (`:1456`, плюс пиксельный target для промпта `:1063`).

### 4.3 Пример (resize 1080×1920, аспект 9:16)

```
entry 9:16 → ra=9, rb=16, defaultM=112, step=16
mForW = ceil(1080/9)  = 120
mForH = ceil(1920/16) = 120
mMin  = max(120, 120, 112) = 120  (уже кратно 16)
w = 9·120 = 1080, h = 16·120 = 1920   → ровно target
```
Если бы target был, скажем, 1440×2560 → `m=160` → 1440×2560 (тоже ровно). Промежуточные размеры округляются вверх до канваса ≥ target, далее даунскейл.

---

## 5. Каталог баннер-размеров (`BANNER_SIZE_GROUPS`)

`BANNER_SIZE_GROUPS` (`src/lib/bannerSizes.ts:30`) — целевые размеры, сгруппированные **по use-case**, а не по голому аспекту: пользователь думает «это для Instagram-поста / YouTube-обложки», а не «это 16:9» (`:1`). Каждый `BannerSize` несёт `w`, `h`, `ratio`, опц. `label` и `group_id` (бэкфилл при загрузке модуля, `:162`).

### 5.1 Группы

| `id` | Заголовок (UI) | Кол-во размеров | Аспекты внутри | Код |
|------|----------------|-----------------|----------------|-----|
| `social-posts` | Соцсети — посты | 6 | 1:1 (×3), 4:5 (×3) | `:34` |
| `stories` | Stories / Reels / TikTok | 4 | 9:16 (×4) | `:51` |
| `youtube` | YouTube / Презентации | 5 | 16:9 (×5) | `:66` |
| `web-horizontal` | Веб-баннеры — горизонтальные | 12 | 3:2 (×5), 4:3 (×4), 5:4 (×3) | `:82` |
| `web-vertical` | Веб-баннеры — вертикальные | 11 | 2:3 (×5), 3:4 (×6) | `:108` |
| `tiny` | Маленькие плашки | 8 | 1:1 (×3), 4:3 (×1), 4:5 (×2), 5:4 (×2) | `:132` |

Итого **46** размеров (`totalSizesCount`, `:155`). Утилиты: `sizeKey` (`"WxH"`, `:150`), `totalSizesCount` (`:155`).

> Аспекты в каталоге пересекаются между группами (например, 1:1 есть и в `social-posts`, и в `tiny`). Для бакетинга важен именно `ratio`: размеры одного аспекта из разных групп всё равно попадут в один i2i-бакет (бакетинг — по `size.ratio`, `generation-context.tsx:373`). `group_id` влияет лишь на layout-шаблон промпта.

### 5.2 Layout-шаблоны групп (`GROUP_TEMPLATES`)

`GROUP_TEMPLATES` (`src/lib/bannerSizes.ts:185`) на каждый `group_id` задаёт:

- `layout` — natural-language шаблон раскладки (где логотип/headline/визуал/CTA внутри кадра этого типа баннера). Встраивается в resize-промпт через `getGroupTemplate` (`:219`) → `generate-image.ts:1084`.
- `boost` — нормированный (0–1) прямоугольник для smartcrop (`:182`). **На текущий момент** в рантайме батча smartcrop не используется (client-scale идёт через `resizeToExact`) — `boost` это задел; см. `docs/GENERATION_FLOW.md` §3.8.

Группы с шаблонами: `social-posts`, `stories`, `youtube`, `web-horizontal`, `web-vertical`, `tiny` (`:186`–`:215`).

---

## 6. Как тайл получает точные пиксели

```
1. UI: пользователь выбирает целевые размеры (ResizeBatchPanel)
2. Бакетинг по size.ratio                          ← generation-context.tsx:373
3. primary тайл бакета = максимум по w·h            ← :438
4. i2i: target_w/target_h = primary.size.{w,h}      ← :447
5. Сервер: size = openAiSizeFor(aspect, target_w, target_h)
        = наименьший валидный канвас ≥ primary, аспект точный, /16   ← imageSizes.ts:109
6. Модель рисует на этом канвасе (OpenAI size=)     ← generate-image.ts:1456/1469
7. Клиент: каждый тайл = resizeToExact(canvas, w, h) — чистый даунскейл в точные пиксели  ← generation-context.tsx:393 → imageGen.ts:445
8. Тайл (точные w×h) → resize-tile + FTP            ← :523, resize-tile.ts:39
```

Ключевые свойства:

- **Только даунскейл**: канвас ≥ primary-тайла, primary — крупнейший в бакете, поэтому любой тайл бакета ≤ канваса (`imageSizes.ts:10`).
- **Точный аспект**: канвас строится из `ra:rb`, тайлы бакета по определению того же аспекта → `resizeToExact` (stretch в точные `w×h`) не искажает.
- **Same-aspect тайлы** (аспект мастера): даунскейлятся прямо из мастера, без i2i (`generation-context.tsx:427`).
- **DB-консистентность**: `cardWriter.resolveSize` пишет тот же канвас в `generations.width/height` (`cardWriter.ts:134`, `:277`), а для client-тайлов `resize-tile` пишет фактические `width/height` тайла (`resize-tile.ts:111`).

---

## 7. Связанные файлы

| Файл | Роль |
|------|------|
| `src/lib/imageSizes.ts` | `NATIVE`, `stepFor`, `resolveCanvasSize`, `openAiSizeString` — математика канваса под OpenAI |
| `src/lib/bannerSizes.ts` | `BANNER_SIZE_GROUPS` (use-case каталог), `GROUP_TEMPLATES` (layout/boost), `sizeKey`, `totalSizesCount` |
| `src/routes/api/generate-image.ts` | Использует `openAiSizeFor` для `size=` и пиксельного target в промпте |
| `src/lib/history/cardWriter.ts` | `resolveSize` → `width/height` строки `generations` |
| `src/lib/generation-context.tsx` | Бакетинг, выбор primary, client-scale тайлов |
| `src/components/resize/ResizeBatchPanel.tsx` | Выбор размеров из каталога |
