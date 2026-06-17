# Биллинг: кредитный леджер

Биллинг построен как **кредитный леджер в Supabase**: у каждого пользователя есть
баланс `profiles.credits_balance`, любое изменение проходит атомарно через
SECURITY DEFINER-функции и пишет аудит-строку в `credit_transactions`. Списание —
реальное; цены и пополнение — **заглушка** (см. §6).

Базовая формула:

```
credits = total_tokens × coefficient(model, quality)
```

Схема и функции: `supabase/migrations/0001_init.sql`.

> **Префлайт vs. реальное списание (SEC-H2, закрыто).** Перед вызовом
> провайдера эндпоинт проверяет грубый порог `balance >= MIN_BALANCE_TO_GENERATE`
> (`generate-image.ts:21`, `:723`), а **после** ответа провайдера списывает по
> факту. Если фактическое списание не покрылось балансом — **картинка НЕ
> отдаётся, клиент получает 402** (`generate-image.ts:1896-1916`). Точного
> per-request hold пока нет — он относится к QUEUE-1 (см. §7).

---

## 1. Таблицы

| Таблица | Назначение | Где в схеме |
|---------|-----------|-------------|
| `profiles.credits_balance` | Баланс пользователя, `numeric(20,4)`, дефолт `0` | `0001_init.sql:54` |
| `pricing_coefficients` | Коэффициент на пару (model, quality) | `0001_init.sql:100-108` |
| `credit_transactions` | Аудит каждого изменения баланса (`delta`, `reason`, `meta`, `admin_id`) | `0001_init.sql:129-137` |
| `generations` | Лог генерации: токены, `cost_usd`, `cost_credits`, `meta` | `0001_init.sql:145-158` |

---

## 2. `pricing_coefficients`

Коэффициенты лежат в БД, чтобы команда могла крутить цены без редеплоя
(`0001_init.sql:96-97`).

| Колонка | Тип / смысл |
|---------|-------------|
| `model` | строка-ключ: `'gpt-image-2'`, `'gemini-nano'`, `'gpt-4o-mini'`, … |
| `quality` | `'low' \| 'medium' \| 'high'` (для AI-наименования — `'standard'`) |
| `coefficient` | `numeric(20,8)`, дефолт `0.001` |
| `updated_at` / `updated_by` | кто и когда менял |
| `unique(model, quality)` | один коэффициент на пару |

Сид при инициализации (`0001_init.sql:117-124`): `gpt-image-2` и `gemini-nano` ×
{low, medium, high}, **все `0.001`**.

Резолв ключа модели на стороне `generate-image`: `pricingModelKey()`
(`generate-image.ts:26-30`) — всё «gemini»/«google/…» → `gemini-nano`, остальное →
`gpt-image-2`. Если строки в таблице нет, берётся `DEFAULT_COEFFICIENT = 0.001`
(`generate-image.ts:14`).

### Админ-API цен — `src/routes/api/admin/pricing.ts`

| Метод | Доступ | Что делает |
|-------|--------|-----------|
| `GET /api/admin/pricing` | любой авторизованный (`requireUser`) | Список коэффициентов. RLS разрешает чтение, чтобы UI мог показать «эта генерация ~X кредитов» (`pricing.ts:24-41`) |
| `PUT /api/admin/pricing` | super-admin (`requireSuperAdmin`) | Upsert по `onConflict: "model,quality"`, до 50 строк, валидация `quality ∈ {low,medium,high}` и `0 ≤ coefficient ≤ 1000` (`pricing.ts:43-108`) |

---

## 3. `spend_credits` — списание (атомарно, service-role)

`spend_credits(p_user, p_amount, p_meta)` (`0001_init.sql:206-239`) —
SECURITY DEFINER. EXECUTE выдан **только `service_role`** (`0001_init.sql:308`),
то есть вызывается с сервера, не из браузера.

Поведение:

- `p_amount < 0` или `null` → исключение `amount must be non-negative`.
- `p_amount = 0` → возвращает текущий баланс, ничего не списывает.
- Иначе атомарно: `UPDATE profiles SET credits_balance = credits_balance -
  p_amount WHERE id = p_user AND credits_balance >= p_amount`. Условие
  `>= p_amount` **не даёт балансу уйти ниже нуля**.
- Если строка не обновилась (баланса не хватило) → исключение
  `insufficient_credits` (errcode `P0001`).
- При успехе пишет `credit_transactions` с `delta = -p_amount`,
  `reason = 'generation'`.

Кто вызывает `spend_credits`:

| Вызыватель | `purpose` в `p_meta` | Биллится? |
|-----------|----------------------|-----------|
| `generate-image.ts:1794` | (model/quality/total_tokens/cost_usd/coefficient) | **Да** — мастер и i2i-ресайз |
| `aiNaming.ts:203` | `ai_naming` | **Да** — полировка имени карточки |

---

## 4. `admin_grant_credits` — грант/клавбэк (super-admin)

`admin_grant_credits(p_target_user, p_delta, p_reason, p_meta)`
(`0001_init.sql:167-200`) — SECURITY DEFINER, EXECUTE для `authenticated`
(`0001_init.sql:307`).

- Внутри проверяет `is_caller_super_admin()` — сверяет
  `auth.jwt()->>'email'` с хардкод-списком (`0001_init.sql:14-32`). Не super-admin
  → исключение `forbidden` (errcode `42501`).
- `p_delta = 0` → исключение. Положительный `delta` — грант, отрицательный —
  клавбэк; **уход в минус для админа разрешён** (это не spend-путь,
  `0001_init.sql:186-189`, комментарий в `credits.ts:6-8`).
- Атомарно меняет `credits_balance` и пишет `credit_transactions`
  (`delta`, `reason`, `meta`, `admin_id = auth.uid()`).

### Админ-API грантов — `src/routes/api/admin/credits.ts`

`POST /api/admin/credits` body `{ user_id, delta, reason?, note? }`. Особенность
вызова (`credits.ts:44-58`): RPC дёргается **от имени авторизованного админа**
(`getUserClient(caller.accessToken)`), а не через service-role — потому что
функция проверяет email-claim, а у `service_role` его нет. Валидация: `delta`
ненулевой, `|delta| ≤ 10_000_000`. Маппинг ошибок RPC в HTTP: `user not found` →
404, `forbidden` → 403, иначе 500 (`credits.ts:62-68`).

> Super-admin список **захардкожен дважды** — в SQL (`is_super_admin`,
> `0001_init.sql:19`) и в TS (`auth-server.ts`). Это известный дрейф SEC-M1
> (PLAN.md §1), частично смощён RBAC: `is_super_admin` теперь учитывает
> `profiles.role` (PLAN.md `:22`).

---

## 5. Цены действий (что и как списывается)

| Действие | Эндпоинт / файл | Списание |
|----------|-----------------|----------|
| Мастер-генерация | `generate-image.ts:1750-1836` | `max(total_tokens, 1) × coefficient(model, quality)`, округление до 4 знаков (`:1783-1784`) |
| i2i-ресайз (бакет) | тот же путь | Так же, как мастер (тот же `spend_credits`) |
| Resize-тайл (клиентский кроп) | `$cardId.resize-tile.ts:113` | **0** — `cost_credits: 0`, бакет уже оплачен один раз |
| AI-наименование карточки | `aiNaming.ts:196-213` | `max(total_tokens, 1) × coefficient('gpt-4o-mini','standard')`, fallback `0.001` (`aiNaming.ts:23`) |
| Vision-препасс (`extract-master`) | `extract-master.ts` | **Сейчас НЕ списывается** — только логируется `purpose: "vision_pre_pass"`; вызова `spend_credits` в эндпоинте нет (**BILL-1**, см. §7) |

Деталь начисления токенов (`generate-image.ts:1754-1764`): если провайдер не
вернул `total_tokens`, они **суммируются** из `input_text_tokens +
input_image_tokens + output_image_tokens`. Минимум списания — за 1 токен
(`max(total_tokens, 1)`), чтобы нулевой-токенный ответ нельзя было
проэксплуатировать (`generate-image.ts:1781-1784`). Само значение токенов —
**доверенное от провайдера** (`SEC-M5`, см. §7).

---

## 6. Что реально, а что заглушка

**Реально и крепко (PLAN.md §2):**

- атомарное `spend_credits`, не уводящее баланс в минус;
- грубый префлайт `balance >= MIN_BALANCE_TO_GENERATE` ДО вызова провайдера и
  **отказ выдавать картинку при провале списания (402)** — закрыт эксплойт
  «околонулевой баланс → бесплатная генерация» (SEC-H2, `generate-image.ts:21`,
  `:723`, `:1896-1916`);
- RLS на `profiles` / `credit_transactions` / `generations`;
- аудит-леджер `credit_transactions` на каждое движение; при провале списания
  строка `generations` с `billing_error` **остаётся** для аудита
  (`generate-image.ts:1850-1865`, `:1899-1900`);
- self-grant заблокирован (балансом нельзя управлять из браузера: write-политика
  `profiles_update_self` требует неизменности `credits_balance`,
  `0001_init.sql:257-259`); запись в `credit_transactions` идёт только через
  SECURITY DEFINER RPC — INSERT-политики нет намеренно (`0001_init.sql:277-285`).

**Заглушка / открыто (на стороне цен, токенов и пополнения):**

- **Все коэффициенты — плейсхолдеры `0.001`** (`0001_init.sql:117-124`,
  `DEFAULT_COEFFICIENT`/`FALLBACK_COEFFICIENT`). Реальной тарификации нет.
- **`total_tokens` доверяется провайдеру** и не верифицируется (`SEC-M5`).
- **Vision-препасс не списывается** (`extract-master.ts` — только логи, `BILL-1`).
- **Нет пополнения/оплаты (top-up).** Баланс пополняется только вручную через
  `admin_grant_credits`. Платёжного провайдера нет.
- **Нет точного per-request hold** — грубый порог не равен реальной стоимости
  (относится к QUEUE-1).

То есть **spend-леджер реальный, а ценообразование, верификация токенов и
top-up — заглушка/открыто.**

---

## 7. Известные дыры

### SEC-H2 — списание ПОСЛЕ генерации ✅ ЗАКРЫТО (грубый порог + 402)

Evidence: `generate-image.ts:21`, `:723`, `:1794`, `:1896-1916`; PLAN.md `:23`,
`:41`.

Что сделано:

- Префлайт теперь требует `balanceBefore < MIN_BALANCE_TO_GENERATE` → **402**
  ещё ДО вызова провайдера (`generate-image.ts:723`; `MIN_BALANCE_TO_GENERATE = 1`,
  `:21`). Это **грубый floor**, чья задача — не пускать околонулевой аккаунт жечь
  платные вызовы, а не точная оценка стоимости.
- `spend_credits` по-прежнему дёргается **после** успешного ответа провайдера и
  декода картинки (`generate-image.ts:1794`).
- **Ключевой фикс:** если списание упало (`spendErr`/исключение), ошибка кладётся
  в `billingError`, логируется в категорию `billing`, и **картинка больше НЕ
  отдаётся** — клиент получает `402 insufficient_credits`
  (`generate-image.ts:1896-1916`). Строка `generations` с `billing_error`
  остаётся для аудит-трейла.

Итог: гонка «ушёл в ноль между префлайтом и списанием» больше не даёт бесплатную
картинку — провайдер-вызов потрачен, но пользователю возвращается 402.

Что осталось (не входит в SEC-H2): **точный per-request hold/estimate ДО вызова
провайдера** по серверному price-floor — относится к QUEUE-1 (биллинг-hold при
admission, PLAN.md §QUEUE-1 `:152`).

### SEC-M5 — недосписание ☐ ОТКРЫТО

Evidence: `generate-image.ts:1783`, `0001_init.sql:117`; PLAN.md `:94`.

`max(total_tokens, 1) × coefficient`, где **0 токенов трактуется как минимум, а
не как максимум**; коэффициенты — заглушка `0.001`; модель и качество выбирает
**клиент** (`body.model`, `quality`); само `total_tokens` приходит от провайдера
и **не верифицируется**. Планируемый фикс: серверный price-floor; 0 токенов =
максимум; реальные коэффициенты.

### BILL-1 — vision-препасс не билётся ☐ ОТКРЫТО

Evidence: `extract-master.ts` (вызова `spend_credits` нет; только
`logSystem` с `purpose: "vision_pre_pass"` на `:254`, `:284`, `:304`);
PLAN.md `:33`.

`POST /api/extract-master` тратит вызов vision-LLM (`gpt-4o-mini`), считает
`usage.total_tokens` и **только логирует** их — списания нет. Планируемый фикс:
провести препасс через `spend_credits` тем же путём, что мастер/AI-наименование.

> См. также SEC-M6 (`docs/LOGGING.md`): логгер теперь **редактирует секреты**
> (рекурсивный key-scrubber + скраб секрето-образных строк). Открытым остаётся
> провайдерский `detail` в ответе клиенту — биллинговый 402 тоже включает
> `detail: billingError` (`generate-image.ts:1905`).

---

## 8. Шов под будущий `TopUpProvider`

PLAN.md §2 фиксирует точку расширения:

- ввести интерфейс **`TopUpProvider`** со stub-реализацией (ручной грант /
  фиктивная оплата), чтобы позже подключить реального провайдера **без
  переписывания** остального;
- цены брать из уже существующей таблицы `pricing_coefficients` — её надо лишь
  заполнить **реальными** коэффициентами вместо `0.001`;
- связать с QUEUE-1: hold/estimate кредитов до вызова провайдера (грубый floor
  SEC-H2 — это только нижняя планка, не точный резерв).

Текущая поверхность, на которую ляжет шов:

| Сегодня | Будущее |
|---------|---------|
| Грант только через `admin_grant_credits` (ручной) | `TopUpProvider.topUp()` поверх того же леджера/`credit_transactions` |
| Грубый префлайт-floor `MIN_BALANCE_TO_GENERATE`; списание `spend_credits` пост-фактум; при провале — 402 без картинки | Точный estimate/hold до провайдера, расчёт по завершении, release при фейле |
| Коэффициенты `0.001`, `total_tokens` от провайдера | Реальные значения в `pricing_coefficients` (таблица готова); верификация токенов |
