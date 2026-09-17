# Перенос GenGO на Hostinger VPS (Dokploy + self-hosted Supabase)

Пошаговый runbook: Hostinger VPS с панелью **Dokploy**, на ней self-hosted Supabase из готового шаблона и приложение, деплоящееся из GitHub.

Итоговая схема:

```
                    ┌──────────── Hostinger VPS KVM 4 (Ubuntu + Dokploy) ─────────┐
Интернет ──443──►   │  Traefik (авто-TLS, ставится с Dokploy)                     │
                    │    ├── app.example.com  → контейнер приложения      :3000   │
                    │    ├── sb.example.com   → Kong (Supabase API)       :8000   │
                    │    └── panel.example.com→ панель Dokploy            :3000   │
                    │                                                             │
                    │  Compose-стек Supabase: postgres, auth(GoTrue), postgrest,  │
                    │      realtime, storage, kong, studio, imgproxy, meta        │
                    │  Application: GenGO (Next.js, деплой из GitHub)             │
                    └─────────────────────────────────────────────────────────────┘
                              │                              │
                       внешний FTP                    OpenAI / OpenRouter
                    (demo.promo — не трогаем)
```

Почему Dokploy, а не голый Ubuntu: готовый шаблон Supabase, автоматический SSL, деплой по push в GitHub, UI для переменных и логов. Плата за это — ~0.5–0.8 ГБ RAM в простое и один дополнительный слой при отладке.

---

## 0. Что нужно подготовить

| Что | Зачем | Статус |
|---|---|---|
| VPS **KVM 4** (4 vCPU / 16 GB / 200 GB) — $14.99/мес | Supabase просит 4 ядра и 8 ГБ+, плюс Dokploy, приложение и сборка | обязательно |
| Домен + доступ к DNS | Три поддомена: приложение, Supabase, панель | обязательно |
| SMTP (см. §1) | Сброс пароля и подтверждение email | обязательно |
| Google Cloud Console | Новый OAuth redirect URI | обязательно |
| Доступ к текущему Supabase Cloud | Дамп данных | обязательно |
| Значения из текущего `.env` | 14 переменных | обязательно |
| S3-совместимое хранилище | Бэкапы Dokploy (Backblaze B2, Cloudflare R2, Wasabi) | желательно |

**KVM 2** (2 vCPU / 8 GB) не берите: Dokploy ~0.8 ГБ + Supabase 4–6 ГБ + сборка Next.js 2–4 ГБ не помещаются с запасом.

---

## 1. SMTP: да, можно на Hostinger

Self-hosted Supabase **не имеет** встроенной отправки писем (в облаке её делал сам Supabase). Без SMTP сломаются:

- `/api/auth/forgot-password` → `resetPasswordForEmail`
- подтверждение email при регистрации (`signUp` с `emailRedirectTo`)

### Вариант A — Hostinger Email (проще всего, если домен на Hostinger)

1. hPanel → **Emails** → выбрать домен → создать ящик, например `noreply@example.com`.
2. hPanel → Emails → ваш ящик → **Manage** → **Configuration Settings** → **Manual Configuration** — там точные хост и порт.
3. Обычные значения:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465          # SSL; либо 587 для STARTTLS
SMTP_USER=noreply@example.com     # ВСЕГДА полный адрес, не только имя
SMTP_PASS=<пароль ящика>
SMTP_ADMIN_EMAIL=noreply@example.com
SMTP_SENDER_NAME=GenGO
```

4. Проверьте, что в DNS есть SPF и DKIM от Hostinger (добавляются сами, если зона на Hostinger).

Плюсы: бесплатно в рамках плана, 10 минут работы. Минусы: лимиты отправки и нет логов доставки — для транзакционных писем приемлемо.

### Вариант B — транзакционный провайдер (лучшая доставляемость)

Brevo, Resend, Mailgun, Postmark — бесплатный тариф, DKIM, логи доставки, вебхуки. Те же переменные:

```
SMTP_HOST=smtp-relay.brevo.com   # или smtp.resend.com и т.п.
SMTP_PORT=587
SMTP_USER=<логин из панели провайдера>
SMTP_PASS=<API-ключ>
```

Рекомендую, если письма о сбросе пароля критичны для бизнеса.

### Вариант C — свой Postfix на VPS ❌

Hostinger порт 25 на VPS не блокирует, но свежий IP без репутации отправит письма в спам. Потребуются PTR, SPF, DKIM, DMARC и мониторинг блок-листов — не стоит того ради двух шаблонов писем.

### Важно про MX

Переезд меняет только **A-записи**. `MX`-записи не трогайте, иначе почта домена перестанет приниматься.

---

## 2. Фаза 0 — подготовка кода (локально)

### 2.1 Починить сборку — она сейчас падает

```bash
npm i mammoth pdfjs-dist
npm run build      # должен пройти
git add package.json package-lock.json && git commit -m "fix: add missing parse-brief deps"
```

`/api/parse-brief` импортирует оба пакета, но их нет в `package.json`. Dokploy будет собирать проект из репозитория — без этого коммита сборка упадёт на сервере ровно так же.

### 2.2 Запомнить про `NEXT_PUBLIC_*`

`NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` **вшиваются в JS-бандл при сборке**. В Dokploy это значит: поменяли переменную в UI → нужен **Redeploy**, а не просто Restart. Иначе браузер продолжит ходить в старый Supabase.

### 2.3 Зафиксировать боевые переменные

```bash
npx vercel env pull .env.vercel.backup
```

Сверьте с текущим `.env` — 14 переменных.

### 2.4 Решить вопрос с доступом к репозиторию

`AslanovRustam/Dream-Weaver` сейчас **публичный**, поэтому Dokploy скачает его без всякой авторизации. Секретов в истории нет — `.env` никогда не коммитился.

Но публичными остаются промпты генерации, схема БД и бизнес-логика. Если открытость не была осознанным решением, переключите видимость (GitHub → Settings → General → Change visibility) — тогда подключать репозиторий нужно будет по SSH-ключу (§8.1).

Подключение провайдера описано в §8.1.

### 2.5 Зафиксировать версию Node и почистить билд-контекст

Без этого Nixpacks берёт свой дефолт — **Node 18** — и сборка падает с `For Next.js, Node.js version ">=20.9.0" is required`.

В репозитории должны быть:

```jsonc
// package.json
"engines": { "node": ">=22" }
```

```
// .nvmrc
22
```

```
// .dockerignore — иначе в билд-контекст уходит ~280 МБ
.git
.next
node_modules
npm-debug.log*
*.tsbuildinfo
.env*
coverage
```

И продублируйте явно в Dokploy → Environment:

```
NIXPACKS_NODE_VERSION=22
```

⚠️ Просите именно **22**. Версии 23 и 24 Nixpacks не знает и при запросе таких версий **молча откатывается на 18.20.5** — выглядит это как «я же указал версию, а оно не применилось».

Отдельно: `pdfjs-dist` в `engines` требует `>=22.13`, а Nixpacks управляет только мажорной версией (минорную задаёт его nixpkgs). Сборке это не мешает — это лишь предупреждение npm, — но если разбор PDF-брифов начнёт сбоить, причина здесь.

---

## 3. Фаза 1 — VPS с Dokploy

### 3.1 Создание

В hPanel при создании VPS: **Панель управления → Dokploy**. Hostinger сам поставит ОС, Docker и панель. Запишите выданные пароль root и IP.

### 3.2 Первый вход в панель

Откройте `http://<IP>:3000` и сразу создайте админскую учётную запись — пока этого не сделано, регистрация открыта любому, кто знает адрес.

### 3.3 Базовая защита сервера

```bash
ssh root@<IP>

# Пользователь вместо root
adduser deploy && usermod -aG sudo,docker deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# Запретить вход root и по паролю
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw allow 3000/tcp            # временно, до §4.2 — панель Dokploy
ufw --force enable

apt update && apt install -y fail2ban unattended-upgrades
systemctl enable --now fail2ban

# Swap — страховка на время сборки Next.js
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Node.js и Caddy ставить не нужно — сборка идёт в контейнере, TLS делает Traefik.

---

## 4. Фаза 2 — DNS и доступ к панели

### 4.1 Записи

| Тип | Имя | Значение |
|---|---|---|
| A | `app` (или `@`) | IP вашего VPS |
| A | `sb` | IP вашего VPS |
| A | `panel` | IP вашего VPS |

MX и почтовые записи не трогайте. TTL понизьте до 300 секунд **за сутки до переезда** — это ускорит откат.

Дождитесь распространения: `dig app.example.com +short`.

### 4.2 Закрыть панель доменом

В Dokploy: **Settings → Server → Domain** → указать `panel.example.com`, включить Let's Encrypt. После того как панель открылась по HTTPS:

```bash
ufw delete allow 3000/tcp
```

Теперь порт 3000 снаружи закрыт, панель доступна только по домену с сертификатом.

---

## 5. Фаза 3 — Supabase из шаблона

### 5.1 Развернуть шаблон

1. Создайте проект: **Projects → Create Project**, например `gengo`.
2. Внутри проекта: **Create Service → Template → Supabase → Create**.
3. Шаблон поднимет весь стек (postgres, auth, postgrest, realtime, storage, kong, studio, imgproxy, meta), сгенерирует ключи и создаст тома.

Требуется Dokploy ≥ 0.22.5 — на свежей установке Hostinger это выполняется.

### 5.2 Домен для API

Во вкладке **Domains** сервиса: `sb.example.com` → контейнер **kong**, порт **8000**, включить HTTPS (Let's Encrypt).

HTTPS здесь обязателен: без валидного сертификата Google OAuth работать не будет.

### 5.3 Донастроить переменные вручную

Шаблон не знает ни про ваш домен, ни про SMTP, ни про Google. Откройте **Environment** сервиса Supabase и приведите к виду:

```ini
############ URLs ############
SUPABASE_PUBLIC_URL=https://sb.example.com
API_EXTERNAL_URL=https://sb.example.com
SITE_URL=https://app.example.com
ADDITIONAL_REDIRECT_URLS=https://app.example.com/,https://app.example.com/reset-password

############ SMTP (из §1) ############
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=noreply@example.com
SMTP_PASS=<пароль>
SMTP_ADMIN_EMAIL=noreply@example.com
SMTP_SENDER_NAME=GenGO

############ Auth ############
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<client id>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<client secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://sb.example.com/auth/v1/callback

############ Studio ############
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<длинный пароль с буквами и цифрами>
```

`SITE_URL` и `ADDITIONAL_REDIRECT_URLS` обязаны совпадать с доменом приложения: код строит редиректы от `window.location.origin`, и GoTrue отклонит всё, чего нет в allow-list.

После правки — **Redeploy** сервиса.

### 5.4 Забрать ключи

Во вкладке Environment найдите и сохраните: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`. Они понадобятся приложению в §8.

⚠️ **Про формат ключей.** Свежий Supabase генерирует также новые `sb_publishable_…` / `sb_secret_…`. Ваш код использует legacy `ANON_KEY` / `SERVICE_ROLE_KEY` — они поддерживаются (Kong принимает оба типа), код менять не нужно. Но Supabase выводит legacy-ключи из обращения **к концу 2026** — заложите отдельную задачу на переход.

### 5.5 Закрыть Studio

Studio — это полный доступ к вашей базе через браузер. Во вкладке **Advanced → Security** включите basic auth для домена Studio, а ещё лучше — не выдавайте Studio публичный домен вообще и ходите в него через SSH-туннель:

```bash
ssh -L 3001:localhost:3000 deploy@<IP>     # порт Studio внутри стека
```

---

## 6. Фаза 4 — перенос данных из Supabase Cloud

Эта часть идёт по SSH — панель тут не помощник.

Строку подключения возьмите в облачном дашборде: Project Settings → Database → Connection string (URI).

### 6.1 Объявить maintenance

Данные меняются во время дампа — предупредите пользователей или закройте запись. Для небольшой базы окно составит минуты.

### 6.2 Дамп (локально, нужен Supabase CLI)

```bash
supabase db dump --db-url "postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres" -f roles.sql  --role-only
supabase db dump --db-url "postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres" -f schema.sql
supabase db dump --db-url "postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres" -f data.sql --use-copy --data-only
```

Схема `auth` попадает в дамп вместе с остальными — именно она содержит `auth.users`, bcrypt-хеши паролей и связи Google-identity. **UUID пользователей обязаны сохраниться**: на них завязаны `profiles.id`, `generations.user_id`, `generation_cards.user_id`.

### 6.3 Восстановление

```bash
scp roles.sql schema.sql data.sql deploy@<IP>:~/dump/
ssh deploy@<IP>

# Узнать имя контейнера Postgres (Dokploy даёт свои имена)
docker ps --format '{{.Names}}' | grep -i db

cd ~/dump
DB=<имя контейнера из предыдущей команды>
docker cp roles.sql  $DB:/tmp/
docker cp schema.sql $DB:/tmp/
docker cp data.sql   $DB:/tmp/

docker exec -i $DB psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file /tmp/roles.sql \
  --file /tmp/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file /tmp/data.sql \
  --dbname "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres"
```

`session_replication_role = replica` отключает триггеры на время заливки — иначе сработает `handle_new_user` и продублирует профили.

### 6.4 Проверка

```sql
select count(*) from auth.users;
select count(*) from public.profiles;
select count(*) from public.generation_cards;

-- каждому профилю должен соответствовать пользователь
select count(*) from public.profiles p
  left join auth.users u on u.id = p.id where u.id is null;   -- ожидаем 0

-- RLS включён на всех таблицах
select tablename, rowsecurity from pg_tables where schemaname='public';
```

Отдельно убедитесь, что на месте таблицы из всех 7 миграций — в частности `templates` (0005) и `notifications` (0007). Если шаблонная база оказалась старше, накатите недостающие миграции вручную из `supabase/migrations/`.

---

## 7. Фаза 5 — Google OAuth

В Google Cloud Console → APIs & Services → Credentials → ваш OAuth client:

1. **Authorized redirect URIs** — добавить `https://sb.example.com/auth/v1/callback`
2. **Authorized JavaScript origins** — добавить `https://app.example.com`

Старые URI облачного Supabase пока не удаляйте — пригодятся при откате.

Client ID и Secret уже прописаны в §5.3; после их изменения делайте Redeploy сервиса Supabase.

---

## 8. Фаза 6 — деплой приложения

### 8.1 Подключить GitHub к Dokploy

Делается один раз на всю панель. Репозиторий `AslanovRustam/Dream-Weaver` сейчас публичный, поэтому годятся оба варианта.

**Вариант A — GitHub App (рекомендуется, даёт авто-деплой):**

1. Dokploy → **Settings → Git** → выбрать **GitHub**
2. Выбрать **Personal** (репозиторий на личном аккаунте, не в организации)
3. **Create GitHub App** → уникальное имя, например `dokploy-gengo`
4. GitHub вернёт в Dokploy → нажать появившуюся кнопку **Install**
5. На GitHub: **Only select repositories → Dream-Weaver** → **Install & Authorize**

Авто-деплой после этого работает из коробки: push в выбранную ветку запускает пересборку, push в другие ветки — нет.

**Вариант B — Generic Git:** provider `Git`, URL `https://github.com/AslanovRustam/Dream-Weaver.git`, ветка `main`. SSH-ключ не нужен, пока репозиторий публичный, но авто-деплой придётся вешать вебхуком вручную.

**Если репозиторий станет приватным:** Dokploy → **SSH Keys → Create SSH Key → Generate RSA** → скопировать публичный ключ → GitHub → репозиторий → **Settings → Deploy keys → Add deploy key**. В Dokploy обязательно использовать SSH-URL `git@github.com:AslanovRustam/Dream-Weaver.git` — с HTTPS-адресом ключ не применяется.

### 8.2 Создать сервис

В том же проекте: **Create Service → Application**.

- **Provider**: GitHub → репозиторий `AslanovRustam/Dream-Weaver`, ветка `main`
- **Build Path**: `/` (проект в корне репозитория)
- **Build Type**: `Nixpacks` (сам определит Next.js и выполнит `npm run build` / `npm run start`)

- **Publish Directory**: оставить **пустым** — это поле для статических сайтов, оно заставит отдавать папку через NGINX, и все 36 API-роутов перестанут работать

Почему именно Nixpacks, а не Dockerfile: он запускает `next start` с полным `node_modules`, поэтому `pdfjs-dist` и `mammoth` в `/api/parse-brief` работают без настройки. Со standalone-образом папка со шрифтами pdfjs теряется — подробности и решение в §8.6. Фоновые воркеры из `instrumentation.ts` поднимаются в любом случае: процесс постоянный.

Предупреждение Dokploy про ресурсы билдера (4+ ГБ RAM, 2+ ядра) на KVM 4 выполняется с запасом, плюс swap из §3.3.

### 8.3 Переменные окружения

Вкладка **Environment**:

```ini
# Supabase — теперь свой
SUPABASE_URL=https://sb.example.com
SUPABASE_ANON_KEY=<ANON_KEY из §5.4>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY из §5.4>
NEXT_PUBLIC_SUPABASE_URL=https://sb.example.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<тот же ANON_KEY>

# AI — без изменений
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...

# FTP-хранилище — без изменений
FTP_HOST=...
FTP_PORT=21
FTP_USER=...
FTP_PASS=...
FTP_BASE_PATH=/public_html/dream-weaver
FTP_BASE_URL=https://demo.promo/sv/public_html/dream-weaver

# Эндпоинт ретеншена закрыт этим секретом (сам ретеншен крутится in-process)
CRON_SECRET=<длинная случайная строка>

PORT=3000
NODE_ENV=production
```

Чего здесь быть **не должно**:

- `WORKERS_IN_PROCESS=false` — выключит фоновые воркеры, которые на постоянном процессе как раз и нужны
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` — это обход авторизации, в проде недопустим

### 8.4 Домен

Вкладка **Domains**: `app.example.com`, порт контейнера **3000**, HTTPS с Let's Encrypt.

### 8.5 Авто-деплой

Вкладка **Deployments** → включить webhook и добавить его в GitHub (Settings → Webhooks). После этого push в `main` запускает пересборку — поведение, к которому вы привыкли на Vercel.

Помните про §2.2: смена `NEXT_PUBLIC_*` требует именно Redeploy.

### 8.6 Опционально: Dockerfile вместо Nixpacks

Даёт меньший образ и предсказуемую сборку, но **требует одной доработки**, иначе сломается разбор PDF-брифов.

`/api/parse-brief` читает шрифты по runtime-пути `process.cwd()/node_modules/pdfjs-dist/standard_fonts`. Трассировка `output: "standalone"` ловит статические импорты и такой путь не видит, поэтому в образ папка не попадёт. Сначала добавьте в `next.config.ts`:

```ts
outputFileTracingIncludes: {
  "/api/parse-brief": ["./node_modules/pdfjs-dist/standard_fonts/**"],
},
```

Затем положите в корень репозитория:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Обратите внимание: `public/` и `.next/static/` копируются отдельно — standalone их не включает. В Dokploy переключите **Build Type → Dockerfile**, path `./Dockerfile`, context `.`.

---

## 9. Фаза 7 — долгие запросы

Генерация баннера занимает **2–3 минуты**, а `bulk-zip` отдаёт большой архив. Это первое, что нужно проверить после деплоя, — типовые прокси рвут такие соединения.

1. Запустите реальную генерацию и дождитесь ответа.
2. Если запрос обрывается на 1–2 минутах, откройте **Advanced → Traefik / Rules** у приложения и поднимите таймауты ответа для его роутера.
3. Там же, в **Advanced**, при необходимости увеличьте лимит размера тела запроса: логотипы и брифы уходят base64, десятки мегабайт.

`maxDuration = 300` в коде — это настройка Vercel, на своём хосте она ни на что не влияет: Node-сервер сам запрос не обрывает, режет только прокси.

---

## 10. Фаза 8 — приёмка

Проверяйте по порядку, каждый пункт опирается на предыдущий:

- [ ] `https://app.example.com` открывается, сертификат валиден
- [ ] `https://sb.example.com/auth/v1/health` отвечает
- [ ] Регистрация нового пользователя → **письмо приходит** (проверка SMTP)
- [ ] Вход по email и паролю **старым** аккаунтом (проверка переноса bcrypt-хешей)
- [ ] Вход через Google (проверка OAuth redirect)
- [ ] «Забыли пароль» → письмо со ссылкой на `/reset-password` работает
- [ ] `/api/me` возвращает профиль с правильным балансом кредитов
- [ ] Полная генерация баннера: списание кредитов → картинка → загрузка на FTP → карточка в истории
- [ ] Ресайзы и `bulk-zip` доходят до конца (проверка §9)
- [ ] `/admin` открывается под админом, логи пишутся
- [ ] В логах приложения (Dokploy → Logs) видно старт воркеров из `instrumentation.ts`
- [ ] Ручной прогон ретеншена:
      `curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/retention`
- [ ] Studio недоступен без пароля

Только после зелёного чеклиста отключайте проект на Vercel.

---

## 11. Фаза 9 — бэкапы и эксплуатация

### Бэкапы — главное, что вы теряете, уходя из облака

Встроенные **Database Backups** в Dokploy работают с базами, созданными через саму панель. Наш Postgres живёт внутри Compose-стека Supabase, поэтому используем два механизма:

**1) Логический дамп по расписанию (основной, без простоя):**

```bash
ssh deploy@<IP>
mkdir -p ~/backups && nano ~/backup-db.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
DB=$(docker ps --format '{{.Names}}' | grep -i 'supabase.*db' | head -1)
STAMP=$(date +%F-%H%M)
OUT=~/backups/db-$STAMP.sql.gz
docker exec "$DB" pg_dumpall -U postgres | gzip > "$OUT"
find ~/backups -name 'db-*.sql.gz' -mtime +14 -delete
# TODO: выгрузить $OUT во внешнее хранилище (S3 / FTP) — копия на том же диске бэкапом не считается
```

```bash
chmod +x ~/backup-db.sh
crontab -e
# 0 4 * * * /home/deploy/backup-db.sh >> /home/deploy/backups/cron.log 2>&1
```

**2) Volume Backups в Dokploy (дополнительный):** панель умеет выгружать именованные Docker-тома в S3. Учтите: безопасный режим останавливает контейнер на время копирования, то есть это короткий простой. Ставьте на ночь и воспринимайте как «снимок на случай катастрофы», а не как ежедневный бэкап.

**Раз в квартал проверяйте восстановление.** Непроверенный бэкап — не бэкап.

### Мониторинг

- Внешний uptime-чек на `https://app.example.com` (UptimeRobot, Better Stack)
- Алерт на свободное место: логи Supabase и Postgres растут
- Dokploy показывает CPU/RAM по контейнерам — заглядывайте после релизов

### Обновления

- **Приложение**: push в `main` (или кнопка Redeploy)
- **Supabase**: обновление образов в шаблоне — делайте руками и только после свежего дампа
- **Dokploy**: обновляется из панели; не делайте это в пятницу

### Опционально: rembg

`/api/remove-bg` ожидает сервис удаления фона на `127.0.0.1:7001` (на Vercel он не работал в принципе — там нет локальных процессов). На VPS поднимается отдельным сервисом:

```bash
docker run -d --restart always -p 127.0.0.1:7001:7000 \
  danielgatis/rembg s --host 0.0.0.0 --port 7000
```

Если приложение работает в контейнере Dokploy, `127.0.0.1` изнутри контейнера указывает на сам контейнер — заведите rembg как сервис в том же проекте и укажите `REMBG_URL=http://<имя-сервиса>:7000`.

---

## 12. Откат

Пока Vercel и облачный Supabase живы, откат занимает минуты:

1. Вернуть A-запись домена на Vercel (для этого и понижали TTL).
2. Если данные успели разойтись — снять дамп с self-hosted и залить обратно в облако.
3. Вернуть старые redirect URI в Google Console (мы их не удаляли).

Держите Vercel и облачный Supabase **минимум две недели** после переезда.

---

## 13. Типичные проблемы

| Симптом | Причина | Решение |
|---|---|---|
| Письма не приходят | SMTP не настроен или порт закрыт | Логи сервиса `auth` в Dokploy; попробовать 587 вместо 465 |
| `redirect_to is not allowed` | Домен не в allow-list | Проверить `SITE_URL` / `ADDITIONAL_REDIRECT_URLS`, Redeploy |
| Google-вход возвращает ошибку | Redirect URI не совпадает | В Console ровно `https://sb.example.com/auth/v1/callback` |
| Приложение ходит в старый Supabase | `NEXT_PUBLIC_*` вшиты в бандл | **Redeploy**, а не Restart |
| Генерация обрывается на 1–2 минутах | Таймаут Traefik | §9 |
| 413 при загрузке логотипа | Лимит размера тела | Поднять в Advanced |
| Пользователи не могут войти | Не перенесена схема `auth` или изменились UUID | Перезалить дамп целиком, проверить джойн `profiles` ↔ `auth.users` |
| Сборка падает по памяти | Мало RAM | Swap из §3.3 или сборка через Dockerfile |
| `Module not found: mammoth` | Пакеты не в `package.json` | §2.1 |
| `You are using Node.js 18.20.5. For Next.js, Node.js version ">=20.9.0" is required` | Nixpacks не нашёл требуемую версию и взял свой дефолт | `NIXPACKS_NODE_VERSION=22` в Environment + `engines`/`.nvmrc` в репозитории (§2.5). Не просите 23/24 — Nixpacks молча откатится на 18 |
| Билд-контекст в сотни МБ, деплой медленный | Нет `.dockerignore` | Добавить его с `.git`, `.next`, `node_modules` (§2.5) |
| `Missing NEXT_PUBLIC_SUPABASE_URL` в браузере | Переменных не было на момент **сборки** | Задать в Environment и сделать Redeploy (§2.2) |
| Таблицы `notifications` нет | Шаблон старше ваших миграций | Накатить `supabase/migrations/0007_notifications.sql` |
| Панель Dokploy недоступна | Закрыт порт 3000 | Так и задумано (§4.2) — ходить по `panel.example.com` |

---

## 14. Безопасность — перед публичным запуском

- [ ] Ротировать **все** ключи: OpenAI, OpenRouter, FTP, Supabase (в `MIGRATION_NOTES.md` это отмечено как незакрытая задача)
- [ ] Админ Dokploy создан сразу после установки, пароль сильный
- [ ] Порт 3000 закрыт, панель только по домену с HTTPS
- [ ] Supabase Studio за basic auth или вообще без публичного домена
- [ ] Postgres и Kong не опубликованы наружу (проверить `docker ps` — портов на `0.0.0.0` быть не должно)
- [ ] `NEXT_PUBLIC_DEV_AUTH_BYPASS` отсутствует в проде
- [ ] SSH только по ключу, root отключён
- [ ] Бэкап снят и **проверен восстановлением** до отключения Vercel

---

## Источники

- [Dokploy: шаблон Supabase](https://dokploy.com/templates/supabase)
- [Dokploy: типы сборки](https://docs.dokploy.com/docs/core/applications/build-type)
- [Dokploy: расширенные настройки (Traefik, ресурсы, security)](https://docs.dokploy.com/docs/core/applications/advanced)
- [Dokploy: Volume Backups](https://docs.dokploy.com/docs/core/volume-backups)
- [Supabase: Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase: Auth self-hosting config](https://supabase.com/docs/guides/self-hosting/auth/config)
- [Supabase: новые API-ключи](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)
- [Supabase: Backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Hostinger: блокируется ли порт 25 на VPS](https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/)
- [Hostinger: Coolify vs Dokploy](https://www.hostinger.com/tutorials/coolify-vs-dokploy/)
