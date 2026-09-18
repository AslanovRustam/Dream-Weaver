# GenGO — что сделать владельцу: миграции, ключи, деплой и бэклог безопасности

Актуально на 2026-09-18. Код всех фаз 0/1 безопасности и ценообразования уже в `origin/main`. Ниже — только то, что нельзя сделать из кода: применить миграции, повернуть ключи, задеплоить и проверить. Затем — бэклог второй фазы.

---

## Часть 1. Сделать сейчас (по порядку)

### Шаг 1. Снять улики (ДО миграций)

Supabase → SQL Editor:

```sql
select id, email, role, tier, credits_balance
from public.profiles
where role <> 'user' or tier <> 'regular';
```

Норма: `superadmin` только у `kela@clickable.agency` и `aslanov@clickable.agency`. Любой другой superadmin — след использования дыры `profiles.role` (кто угодно мог назначить себе роль). В этом случае сохраните вывод и дополнительно поверните `SUPABASE_SERVICE_ROLE_KEY`.

### Шаг 2. Применить миграции строго по порядку

Вариант А — из репозитория одной командой:

```bash
cd C:\claude\Dream-Weaver
supabase db push
```

Вариант Б — по одному файлу в SQL Editor (New query → вставить содержимое файла → Run):

| # | Файл | Что делает |
|---|------|------------|
| 0007 | `supabase/migrations/0007_notifications.sql` | таблица уведомлений |
| 0008 | `0008_revoke_skobelev_admin.sql` | снимает superadmin с `skobelev@…` в БД (в коде уже снят) |
| 0009 | `0009_lock_profiles_privileged_columns.sql` | **CRITICAL**: пользователь больше не может менять себе `role`, `tier`, `credits_balance` |
| 0010 | `0010_billing_refund_ratelimit_roles.sql` | `refund_credits`, общий лимитер `rate_limits`, `admin_set_user_role`, снятие лишних грантов |
| 0011 | `0011_backfill_image_cost_usd.sql` | data-only: проставляет реальную стоимость $ старым генерациям картинок (вкладка «Расход» перестанет показывать $0.00) |

Проверка после:

```sql
select public.is_super_admin('skobelev@clickable.agency');            -- false
select email, role from public.profiles where role = 'superadmin';    -- только kela, aslanov
select count(*) from public.rate_limits;                              -- 0, без ошибки
select proname from pg_proc
 where proname in ('refund_credits','rate_limit_hit','admin_set_user_role'); -- 3 строки
select model, count(*), round(sum(cost_usd)::numeric, 2) as usd
  from public.generations where created_at > now() - interval '90 days'
 group by model order by usd desc;                                    -- у gpt-image-* сумма > 0
```

Если применяли через SQL Editor (не CLI), Supabase не отметит миграции как применённые — при будущем `db push` они выполнятся ещё раз. 0011 и 0008 идемпотентны, остальные упадут на «already exists» — это нормально, просто пропустите.

### Шаг 3. Ротация ключей

1. **OpenAI**: создать новый ключ → положить в `.env.local` и в переменные прода → перезапустить → отозвать старый. Посмотреть Usage за 30 дней: до Фазы 0 семь платных роутов были доступны без входа.
2. **FTP**: сменить пароль в панели хостинга → обновить `FTP_PASS` в `.env.local` и на проде → перезапуск. FTPS уже включён кодом.
3. **OpenRouter**: удалить `OPENROUTER_API_KEY` из `.env.local` и с прода, отозвать ключ на openrouter.ai. Он больше не используется.

### Шаг 4. Деплой `main` и перезапуск

После деплоя в логах не должно быть строки `[rate-limit] shared counter unavailable` — если есть, миграция 0010 не применилась.

### Шаг 5. Проверка на проде

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ДОМЕН/api/generate-character \
  -H "Content-Type: application/json" -d '{"prompt":"x"}'
# ожидается 401

curl -sI https://ДОМЕН/ | grep -iE "strict-transport|x-frame|content-security"
# ожидается HSTS, X-Frame-Options: DENY, Content-Security-Policy-Report-Only
```

Затем войти и руками пройти: баннер, один ресайз, фон + персонаж в лендинге, смена пароля (должна спросить текущий), загрузка .docx ТЗ. Консоль браузера открыта — ищем сообщения `[Report Only]` от CSP. Запишите, какие были.

### Шаг 6. Хостинг: листинг каталогов

```bash
curl -sI https://FTP_BASE_URL/любые8символов/
```

Ожидается 403 или 404. Если отдаёт список файлов — выключить directory listing или положить `.htaccess` с `Options -Indexes` в корень `FTP_BASE_PATH`.

### Шаг 7. Включить CSP

После шага 5 без нарушений: попросить Claude переименовать заголовок в `next.config.ts` из `Content-Security-Policy-Report-Only` в `Content-Security-Policy` и задеплоить. Если нарушения были — сначала сообщить какие.

---

## Часть 2. Бэклог безопасности (Фаза 2, после Части 1)

Приоритет сверху вниз.

| # | Задача | Зачем | Объём |
|---|--------|-------|-------|
| 1 | **Шифрование BYO-кредов** рекламных кабинетов и ESP (`src/lib/credentials.ts` сейчас хранит в localStorage) | OAuth-токены и ключи лежат в браузере открытым текстом; любой XSS их уносит | таблица `user_integrations` + AES-256-GCM (ключ `INTEGRATIONS_KEK`) или pgsodium, RLS `auth.uid()=user_id`, роут `/api/integrations`. ~1 день |
| 2 | **CI-гейт «каждый /api роут защищён»** | чтобы новый роут не появился без `requireUser` + `rateLimitResponse`, как было с семью платными | скрипт в CI, грепает `src/app/api/**/route.ts`. ~2 часа |
| 3 | **Сессии в cookies** через `@supabase/ssr` + CSRF | сейчас JWT в localStorage; XSS = кража сессии. Большой рефакторинг: `api-client`, `auth-context`, `browser.ts`, 30+ роутов | отдельный релиз, ~2–3 дня |
| 4 | **Строгий nonce-CSP** | текущий CSP с `'unsafe-inline'`; строгий возможен только после выноса srcdoc-превью лендингов на отдельный origin | после п. 3, ~1 день |
| 5 | **Клампить `target_w` / `target_h`** в generate-image к поддерживаемым размерам | клиент может запросить самый дорогой холст | ~1 час |
| 6 | **Пиннинг IP в safe-fetch** (DNS-rebinding) + allowlist портов 80/443 | brand-lookup ходит по произвольным URL | ~2 часа |
| 7 | **Зафиксировать плавающие зависимости** (`@supabase/supabase-js`, `mammoth`, `pdfjs-dist`, `jszip`) | supply-chain: сейчас `^`-диапазоны | ~30 минут + прогон |
| 8 | **Модерация промптов** (`omni-moderation-latest`), блокировать только `sexual/minors`, `violence/graphic`, `self-harm` | защита ключа компании от запрещённого контента | опционально, ~2 часа |
| 9 | **Продуктовое решение по цене баннера** | UI показывает 30 кредитов, БД списывает по токенам (~4). Что авторитетно? | решение владельца |

### Хозяйственное (не безопасность, но стоит сделать)

- **История git весит ~207 МБ** из-за старых PNG-превью (по 2 МБ штука). Превью уже пережаты в WebP, но история хранит все версии. Можно почистить через `git filter-repo` — это переписывает историю, нужно согласовать со всеми, у кого есть клон.
- В `.git/objects/pack` есть `.idx` без парных `.pack` (остатки прерванных операций) — `git gc` уберёт предупреждения.

---

## Что уже сделано (для контекста)

**Фаза 0/1 (в коде, запушено):** закрыты 7 анонимных платных роутов (вход + лимит частоты + лимит размера тела + проверка magic-bytes картинок и документов); списание кредитов до вызова провайдера с возвратом при ошибке; общий лимитер на Supabase; security-заголовки (HSTS, nosniff, X-Frame-Options, CSP в режиме Report-Only); смена пароля требует текущий; FTPS по умолчанию; XSS в экспортах лендингов закрыт (`embedJson` / `safeCtaUrl` / `cssUrl`); песочница превью плейбла без `allow-same-origin`; `getUserRole` не верит `superadmin` из БД для email вне allowlist; cron с constant-time сравнением секрета; гости получают окно входа вместо тихих 401.

**Ценообразование (2026-09-18):** реальная стоимость $ по токенам во всех image- и LLM-роутах, настоящее имя модели в леджере, миграция 0011 для истории.
