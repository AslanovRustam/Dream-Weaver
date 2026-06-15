# Backend setup — Dream Weaver Studio

Этот документ описывает что нужно сделать руками после того как бек залит в репу.
Подключаем Supabase (Auth + Postgres) к Cloudflare Worker.

---

## 1. Создать проект в Supabase

1. https://supabase.com → New project → free tier
2. Запомнить (вкладка **Project Settings → API**):
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ секрет, никогда не в браузер

## 2. Применить миграцию

В Dashboard → **SQL Editor** → **New query** → вставить целиком файл
`supabase/migrations/0001_init.sql` → **Run**.

Создаст:

- таблицы `profiles`, `pricing_coefficients`, `credit_transactions`, `generations`
- RLS политики
- функции `admin_grant_credits`, `spend_credits`, `is_super_admin`
- триггер автосоздания профиля при регистрации
- 6 строк с дефолтными коэффициентами (0.001) для (gpt-image-2 | gemini-nano) × (low | medium | high)

## 3. Включить Google OAuth

Dashboard → **Authentication → Providers → Google**:

1. Включить тумблер.
2. Создать OAuth client в https://console.cloud.google.com/apis/credentials
   - Application type: Web application
   - Authorized redirect URI: значение из Supabase (показано прямо в форме провайдера,
     вида `https://<project>.supabase.co/auth/v1/callback`)
3. Вставить `Client ID` / `Client Secret` обратно в Supabase. Save.

## 4. Включить email/password + сброс пароля

Dashboard → **Authentication → Providers → Email** — уже включено по умолчанию.

Dashboard → **Authentication → URL Configuration**:

- `Site URL`: основной адрес фронта (для прод-окружения).
- `Redirect URLs`: добавить адреса куда юзер будет возвращаться после
  reset-password / OAuth (например `https://<your-domain>/auth/callback`,
  `http://localhost:5173/auth/callback` для dev).

Dashboard → **Authentication → Email Templates** — отредактировать шаблоны
"Reset Password" и "Magic Link" если нужно брендирование.

## 5. Прокинуть env переменные

### Локально (dev)

Создать `.dev.vars` в корне (Wrangler/Vite подхватят):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJ...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJ...
OPENAI_API_KEY=sk-...
LOVABLE_API_KEY=...
```

### Cloudflare (prod)

В Dashboard воркера → **Settings → Variables and Secrets** добавить теми же именами,
тип **Secret** для SERVICE_ROLE и API-ключей.

Альтернативно через CLI:

```
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_ANON_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## 6. Установить зависимость

```
bun install
```

(добавлен `@supabase/supabase-js`)

---

## API endpoints

Все защищённые роуты ждут хедер `Authorization: Bearer <access_token>`,
где токен — это `session.access_token` от Supabase клиента на фронте.

### Юзер

| Метод   | Путь                        | Описание                                                           |
| ------- | --------------------------- | ------------------------------------------------------------------ |
| `GET`   | `/api/me`                   | Профиль + баланс + флаг `is_super_admin`                           |
| `PATCH` | `/api/me`                   | Обновить `first_name`, `last_name`, `nickname`, `phone`, `contact` |
| `POST`  | `/api/auth/change-password` | `{ new_password }` — поменять пароль (для залогиненого)            |
| `POST`  | `/api/auth/forgot-password` | `{ email, redirect_to? }` — письмо со ссылкой сброса (без хедера)  |

### Генерация

| Метод  | Путь                  | Описание                                                                                        |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `POST` | `/api/generate-image` | Теперь требует auth. При баланс=0 → 402. После генерации списывает `total_tokens × coefficient` |

Ответ генерации теперь содержит поле `credits`:

```json
{
  "image": "...",
  "prompt": "...",
  "usage": { ... },
  "credits": {
    "charged": 4.2,
    "coefficient": 0.001,
    "total_tokens": 4200,
    "new_balance": 95.8,
    "error": null
  }
}
```

### Админ (super-admin only)

| Метод  | Путь                                    | Описание                                                    |
| ------ | --------------------------------------- | ----------------------------------------------------------- |
| `GET`  | `/api/admin/users?q=&limit=50&offset=0` | Список профилей, поиск по email/имени/нику                  |
| `POST` | `/api/admin/credits`                    | `{ user_id, delta, reason?, note? }` — выдать/снять кредиты |
| `GET`  | `/api/admin/pricing`                    | Список коэффициентов (читают все авторизованные)            |
| `PUT`  | `/api/admin/pricing`                    | `{ items: [{ model, quality, coefficient }] }` — апсёрт     |

Супер-админы определяются по email (хардкод в БД-функции `is_super_admin` и в `src/lib/auth-server.ts`):

- `kela@clickable.agency`
- `skobelev@clickable.agency`

Чтобы добавить ещё — править оба места (массив и SQL-функцию).

---

## Что НЕ сделано (намеренно)

- ❌ UI логина / профиля / админки — это фронт-этап, не трогал
- ❌ Платёжки (Monobank и т.д.)
- ❌ Frontend интеграция с Supabase клиентом — фронт должен:
  - вызвать `supabase.auth.signInWithOAuth({ provider: 'google' })` или `signInWithPassword`
  - на каждый запрос к `/api/*` добавлять `Authorization: Bearer ${session.access_token}`

## Полезное

- Баланс юзера лежит в `public.profiles.credits_balance` — единственная правда о деньгах.
- Каждое изменение баланса (выдача/списание) пишется в `public.credit_transactions` — полный аудит.
- Каждая генерация (даже если списание упало) пишется в `public.generations`.
- Если в `pricing_coefficients` нет строки для пары (model, quality) — на лету используется дефолт `0.001`.
- Чтобы вручную выдать тебе кредитов до того как готов фронт админки:
  ```sql
  -- из SQL Editor под service_role
  update public.profiles
     set credits_balance = credits_balance + 1000
   where email = 'skobelev@clickable.agency';
  ```
