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
(`generate-image.ts:17-21`) — всё «gemini»/«google/…» → `gemini-nano`, остальное →
`gpt-image-2`. Если строки в таблице нет, берётся `DEFAULT_COEFFICIENT = 0.001`
(`generate-image.ts:12`).

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
| `generate-image.ts:1774` | (model/quality/total_tokens/cost_usd/coefficient) | **Да** — мастер и i2i-ресайз |
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
> (PLAN.md §1). Запланирован единый источник (`profiles.role`).

---

## 5. Цены действий (что и как списывается)

| Действие | Эндпоинт / файл | Списание |
|----------|-----------------|----------|
| Мастер-генерация | `generate-image.ts:1730-1816` | `max(total_tokens, 1) × coefficient(model, quality)`, округление до 4 знаков (`:1763-1764`) |
| i2i-ресайз (бакет) | тот же путь | Так же, как мастер (тот же `spend_credits`) |
| Resize-тайл (клиентский кроп) | `$cardId.resize-tile.ts:99-106` | **0** — `cost_credits: 0`, бакет уже оплачен один раз |
| AI-наименование карточки | `aiNaming.ts:196-213` | `max(total_tokens, 1) × coefficient('gpt-4o-mini','standard')`, fallback `0.001` (`aiNaming.ts:23`) |
| Vision-препасс (`extract-master`) | `extract-master.ts` | **Сейчас НЕ списывается** — только логируется `purpose: "vision_pre_pass"`; вызова `spend_credits` в эндпоинте нет |

Деталь начисления токенов (`generate-image.ts:1734-1744`): если провайдер не
вернул `total_tokens`, они **суммируются** из `input_text_tokens +
input_image_tokens + output_image_tokens`. Минимум списания — за 1 токен
(`max(total_tokens, 1)`), чтобы нулевой-токенный ответ нельзя было
проэксплуатировать (`generate-image.ts:1761-1763`).

---

## 6. Что реально, а что заглушка

**Реально и крепко (PLAN.md §2):**

- атомарное `spend_credits`, не уводящее баланс в минус;
- RLS на `profiles` / `credit_transactions` / `generations`;
- аудит-леджер `credit_transactions` на каждое движение;
- self-grant заблокирован (балансом нельзя управлять из браузера: write-политика
  `profiles_update_self` требует неизменности `credits_balance`,
  `0001_init.sql:257-259`); запись в `credit_transactions` идёт только через
  SECURITY DEFINER RPC — INSERT-политики нет намеренно (`0001_init.sql:277-285`).

**Заглушка (на стороне цен и пополнения):**

- **Все коэффициенты — плейсхолдеры `0.001`** (`0001_init.sql:117-124`,
  `DEFAULT_COEFFICIENT`/`FALLBACK_COEFFICIENT`). Реальной тарификации нет.
- **Нет пополнения/оплаты (top-up).** Баланс пополняется только вручную через
  `admin_grant_credits`. Платёжного провайдера нет.

То есть **spend-леджер реальный, а ценообразование и top-up — заглушка.**

---

## 7. Известные дыры

### SEC-H2 — списание ПОСЛЕ генерации; картинка отдаётся при `billingError`

Evidence (PLAN.md §1): `generate-image.ts:711` / `:1774` / `:1876`.

- Префлайт проверяет **только `balanceBefore > 0`** (`generate-image.ts:711`),
  никакой оценки стоимости/hold до вызова провайдера.
- `spend_credits` дёргается **после** успешного ответа провайдера и **после**
  декода картинки (`generate-image.ts:1768-1816`).
- Если списание упало (`spendErr`/исключение), ошибка кладётся в `billingError`,
  логируется в категорию `billing`, но картинка **всё равно отдаётся**
  пользователю (`generate-image.ts:1876-1889`), а `billing_error` пишется в
  `generations.meta`. Итог: пользователь с нулём (ушедший в ноль в гонке между
  префлайтом и списанием) может получить картинку бесплатно.

Планируемый фикс: оценка/hold кредитов **до** вызова провайдера по серверному
price-floor (model, quality); при `billingError` не отдавать картинку или делать
refund-hold.

### SEC-M5 — недосписание

Evidence (PLAN.md §1): `generate-image.ts:1763`, `0001_init.sql:117`.

`max(total_tokens, 1) × coefficient`, где **0 токенов трактуется как минимум, а
не как максимум**; коэффициенты — заглушка `0.001`; модель и качество выбирает
**клиент** (`body.model`, `quality`). Планируемый фикс: серверный price-floor;
0 токенов = максимум; реальные коэффициенты.

> См. также SEC-M6 (`docs/LOGGING.md`): логгер **не редактирует секреты**, а
> детали ошибок (включая биллинговые) утекают клиенту.

---

## 8. Шов под будущий `TopUpProvider`

PLAN.md §2 фиксирует точку расширения:

- ввести интерфейс **`TopUpProvider`** со stub-реализацией (ручной грант /
  фиктивная оплата), чтобы позже подключить реального провайдера **без
  переписывания** остального;
- цены брать из уже существующей таблицы `pricing_coefficients` — её надо лишь
  заполнить **реальными** коэффициентами вместо `0.001`;
- связать с SEC-H2 / SEC-M5: hold/estimate кредитов до вызова провайдера.

Текущая поверхность, на которую ляжет шов:

| Сегодня | Будущее |
|---------|---------|
| Грант только через `admin_grant_credits` (ручной) | `TopUpProvider.topUp()` поверх того же леджера/`credit_transactions` |
| Списание `spend_credits` пост-фактум | Estimate/hold до провайдера, расчёт по завершении, release при фейле |
| Коэффициенты `0.001` | Реальные значения в `pricing_coefficients` (таблица готова) |
