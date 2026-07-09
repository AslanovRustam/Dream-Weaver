# Хранение и загрузка сгенерированных изображений — аналитика решений

> Документ: исследование альтернатив текущему FTP-хранилищу для **Dream Weaver Studio**.
> Дата: 2026-06-24. Цены проверены по официальным страницам провайдеров (июнь 2026), но **могут меняться** — перед решением сверить актуальные тарифы по ссылкам в источниках.

---

## 1. Как устроено хранение сейчас

| Параметр | Значение |
|---|---|
| Транспорт | **FTP** через `basic-ftp` (Node-runtime, см. [src/lib/ftp/uploader.ts](src/lib/ftp/uploader.ts)) |
| Хост | `clickdes.ftp.tools:21` |
| Отдача | по HTTPS с `https://demo.promo/sv/...` |
| Структура | `/public_html/dream-weaver/{userId8}/{YYYY-MM}/{kind}_{publicId}_{date}_{rand}.{ext}` (см. [src/lib/ftp/storage.ts](src/lib/ftp/storage.ts)) |
| Запись | fire-and-forget после ответа юзеру (`runBackground` → `after()` / `waitUntil`) — [src/lib/background.ts](src/lib/background.ts) |
| Надёжность | retry-воркер (буфер на диск + прогрессивный backoff) — [src/lib/history/uploadRetryWorker.ts](src/lib/history/uploadRetryWorker.ts) |
| Очистка | retention-воркер (hard-delete по сроку) |
| URL | публичные, анти-guess random-суффикс |

### Боль текущего решения
1. **~1–2 с handshake FTP на каждый аплоад** (новое соединение на файл, без пула — сознательно, ради serverless).
2. **Нет CDN** — файлы отдаются с одного origin (`demo.promo`), нет edge-кеша, нет географической близости к пользователю.
3. **Хрупкость на serverless (Vercel).** Retry-воркер опирается на буфер на диске (`persistPendingBuffer`) и in-process `setInterval` — на Vercel ФС эфемерная/read-only, а процесс замораживается. Часть устойчивости уже перенесена на `after()` + cron (`api/cron/retention`), но disk-buffer recovery на serverless по сути не работает.
4. **FTP не работает на edge-рантаймах** (нужен `net.Socket`), что ограничивает выбор хостинга.
5. **Нет on-the-fly трансформаций** (resize/WebP/AVIF) — все ресайз-тайлы генерируются вручную (API-вызовы + canvas).
6. **Безопасность/учёт.** FTP-доступ — это полный доступ к каталогу; нет per-object ACL, нет подписанных URL из коробки.

> ⚠️ Важный нюанс деплоя: в [MIGRATION_NOTES.md](MIGRATION_NOTES.md) целевой хост — долгоживущий Node (`ukraine.com.ua`), а последние коммиты — «harden for serverless (Vercel)». **Выбор хранилища зависит от того, какой сценарий финальный:**
> - **Долгоживущий Node-хост** → FTP и in-process воркеры работают, миграция не срочная.
> - **Vercel/serverless** → нужно объектное хранилище с HTTP API (S3/Blob), потому что FTP+disk-retry ненадёжны.

---

## 2. Критерии оценки

| Критерий | Почему важно для этого проекта |
|---|---|
| **Egress (исходящий трафик)** | Картинки публично читаются (история, грид, превью, ZIP). Для image-heavy приложения **egress обычно дороже хранения**. Ключевой фактор стоимости. |
| **S3-совместимость** | Позволяет заменить FTP-слой на `@aws-sdk/client-s3` почти один-в-один (presigned URL, `endpoint`-override). Работает на любом рантайме, включая edge. |
| **CDN из коробки** | Edge-кеш ускоряет отдачу и (часто) удешевляет egress. |
| **Цена за ГБ хранения** | Вторично (объёмы относительно небольшие — см. §3). |
| **Сложность интеграции** | Насколько легко вкрутить в текущий `runBackground`-flow без переписывания. |
| **UAH/ФОП-оплата** | Для украинского юрлица/ФОПа — выставление счёта в грн. |
| **Трансформации** | Бонус: on-the-fly resize/WebP мог бы заменить ручную генерацию ресайз-тайлов. |

---

## 3. Оценка объёмов и стоимости для этого проекта

Точных метрик в репозитории нет (нужен доступ к Supabase), поэтому — **параметрическая модель** (её легко пересчитать под реальные данные из `generations`):

**Допущения (консервативно-средние):**
- 1 карточка ≈ 1 мастер (PNG, ~1–3 МБ) + ~10–40 ресайз-тайлов (JPG/PNG, ~0.2–1.5 МБ) ≈ **~10–25 МБ/карточка**.
- Команда генерит ~30–60 карточек/день → **~0.5–1.2 ГБ/день** → **~15–35 ГБ/мес** прироста.
- Retention 12 мес → стационарный объём через год ≈ **200–400 ГБ**.
- Egress: каждый файл смотрят в гриде/истории + скачивают в ZIP. Реалистично **×2–4 от хранимого** → **~0.5–1.5 ТБ/мес**.

**Базовый сценарий для сравнения цен ниже: `300 ГБ хранение + 1 ТБ egress/мес`.**

| Провайдер | Хранение | Egress | CDN | **Итого/мес (≈)** |
|---|---|---|---|---|
| **Cloudflare R2** | $4.50 | **$0** | вкл. | **≈ $4.5** |
| **Backblaze B2** | $1.80 | free до 900 ГБ, далее $0.01/ГБ (≈$1) | через Cloudflare — free | **≈ $2–3** |
| **Hetzner Object Storage** | вкл. в базу | вкл. (1 ТБ) | нет | **≈ €5** |
| **DigitalOcean Spaces** | $5 база (250 ГБ+1 ТБ) +$1 | вкл. | вкл. | **≈ $6** |
| **ukraine.com.ua «Сховище CDN»** | ~€7 (300 ГБ) | вкл. | псевдо-CDN | **≈ €7** |
| **Bunny (Storage+CDN)** | $3 | $10 (EU/NA $0.01/ГБ) | вкл. | **≈ $13** |
| **Scaleway Object Storage** | €4.8 | €9.25 | Edge от €0.99 | **≈ €14–15** |
| **Supabase Storage** | $4.20 (свыше 100 ГБ) | $22.5 (cached) / $67.5 (uncached) | вкл. (API-gateway CDN) | **≈ $27–72** |
| **Vercel Blob** | $6.90 | $50 ($0.05/ГБ) | вкл. | **≈ $57** |
| **AWS S3 (Standard)** | $6.90 | ~$81 ($0.09/ГБ) | нужен CloudFront | **≈ $88** |
| **HostPro Storage VPS** (DIY) | ₴20 (~$0.5) за 500 ГБ | не лимитирован | Cloudflare resell | **≈ $0.5–1** (но self-host MinIO) |

> Вывод по цене: при image-heavy профиле **решают egress и CDN, а не цена за ГБ**. AWS S3 и Vercel Blob дороги именно из-за трафика. Cloudflare R2 / Backblaze B2 / Hetzner — на порядок дешевле.

---

## 4. Украинские решения (приоритет по задаче)

### Сводка
**Реальность рынка:** большинство популярных украинских хостеров **не имеют истинного S3-совместимого объектного хранилища** с публичным S3 API — это классические shared/VPS-шопы. S3-нативные провайдеры (De Novo, GigaCloud, GMhost, HostPark) есть, но **цены у них «за запитом»** (не публикуются). Поэтому для drop-in замены FTP на `@aws-sdk/client-s3` в Украине выбор ограничен и часто требует запроса КП.

### 4.1. GigaCloud — Object Storage (S3)
- **Что:** крупнейший украинский облачный провайдер. Продукт **«Об'єктне сховище (S3)»** на платформе S-Cloud 2.0 / OpenStack (Swift) + S3-слой, тройная репликация. Интеграции с Veeam, Cyberduck.
- **S3 API:** да (S3-совместимость поверх Swift — для базового CRUD/multipart/presigned ок, продвинутые фичи S3 типа Object Lock/bucket policies лучше протестировать).
- **Цена:** **S3 не публикуется** — «ціна за запитом» (КП от sales, тел. +380 44 290 7108). Для ориентира: отдельный продукт **SFTP-storage публично стоит ~0,96 грн/ГБ-мес** (но это не S3).
- **Egress:** не публикуется; модель «платите за использованный объём».
- **CDN/локация:** CDN нет. 5 ЦОД: **Киев, Львов (Украина) + Варшава (EU, Atman Tier III / Equinix Tier IV)**. SLA 99.95%; сертификаты PCI DSS, ISO 27001/27017/27018, КСЗІ, VMware Sovereign Cloud.
- **UAH/ФОП:** да (грн при размещении в UA, EUR при Equinix; ориентир на юрлицо).
- **Оценка:** нормальный drop-in S3 (`@aws-sdk/client-s3` + custom `endpoint` + `forcePathStyle: true`). Минусы: непрозрачные цены, нет CDN.
- Источник: [gigacloud.ua/services/cloud-data-storage](https://gigacloud.ua/services/cloud-data-storage), [SFTP storage](https://gigacloud.ua/products/sftp-storage/)

### 4.2. De Novo — S3/Grid *(самый зрелый S3 в Украине)*
- **Что:** корпоративный провайдер. Объектное хранилище **«S3/Grid» на NetApp StorageGRID** — нативная реализация S3 API (не «слой совместимости»).
- **S3 API:** **native**, включая **Object Lock (WORM/анти-ransomware)**, versioning, multipart, presigned. По заявлению De Novo, переезд с AWS S3 и обратно «не требует изменений кода».
- **Цена:** **не публикуется** — «ціна за запитом» (калькулятор-запрос, валюта грн; маркетинг: «до 3× дешевле гиперскейлеров»).
- **Egress:** **не тарифицируется** — «мережевий трафік та дискові операції не тарифікуються». Платишь только за хранимый объём — большой плюс для трафик-heavy приложения.
- **CDN/локация:** CDN нет. ЦОД: **Киев, Львов, Франкфурт**. Доступ по HTTPS.
- **UAH/ФОП:** да (грн, юрлицо).
- **Оценка:** **самый «правильный» S3 в украинском списке** — near drop-in для `@aws-sdk/client-s3`, бесплатный egress упрощает costing. Минус — цена только по запросу и enterprise-ориентация.
- Источник: [denovo.ua/s3-object-storage](https://denovo.ua/s3-object-storage), [denovo.ua/prices](https://denovo.ua/prices)

### 4.2b. Thehost — KeepData *(дешёвый UA-storage с грн-ценами, но не S3)*
- **Что:** управляемый сетевой/облачный диск до 50–100 ТБ.
- **S3 API:** **нет** (SFTP, FTP/FTPS, WebDAV).
- **Цена (грн/мес):** 25 ГБ — 59 ₴ · 100 ГБ — 129 ₴ · 500 ГБ — 299 ₴ · 1 ТБ — 539 ₴ · 10 ТБ — 2 499 ₴ · 50 ТБ — 12 499 ₴ (≈0.25–2.4 ₴/ГБ). **Egress включён** (канал до 10 Гбит/с).
- **Локация:** **2 географически разнесённых ЦОД в Украине, двойная репликация.** Триал 7 дней. UAH/ФОП — да.
- **Оценка:** отличная in-UA-резервируемость и грн-цены, но не S3 (нужен WebDAV/SFTP-клиент, нет публичных object-URL из коробки). Как замена FTP-модели — рабочий вариант наравне с ukraine.com.ua.
- Источник: [thehost.ua/hosting/cloud-storage](https://thehost.ua/hosting/cloud-storage)

### 4.2c. Cityhost / Deltahost — file-storage box (не S3)
- **Cityhost Storage Box:** 1 ТБ — €5.60 · 5 ТБ — €16.81 · 10 ТБ — €31.94 · 20 ТБ — €56.04 (≈€0.0028–0.0056/ГБ — **самое дешёвое по ёмкости**). Протоколы FTP/SFTP/Samba/WebDAV, **S3 нет**, ЦОД **Финляндия/Германия** (EU, не UA). UAH/ФОП — да. [cityhost.ua/storagebox](https://cityhost.ua/storagebox/)
- **Deltahost Cloud storage:** 100 ГБ — ~$2–3 · 1 ТБ — $10 · 5 ТБ — $40 (≈$0.008–0.02/ГБ). SSHFS/WebDAV/FTP, **S3 нет**. ЦОД на выбор: **Украина / Нидерланды / США**. [deltahost.ua/ua/cloud-storage.html](https://deltahost.ua/ua/cloud-storage.html)

### 4.3. ukraine.com.ua (Хостинг Україна) — «Сховище CDN»
- **Что:** **самый близкий по форме продукт** среди массовых хостеров — метрированное дисковое хранилище, отдаётся по FTP + HTTP.
- **S3 API:** **нет** (FTP + веб-файлменеджер + свой API). НО есть полезное для картинок: **публичные ссылки, Secure Link (подписанные URL с ограничением по IP/времени), привязка кастомного домена, авто-удаление**.
- **Цена (€/мес, по макс. дневному потреблению):** 10 ГБ — €0.50 · 50 ГБ — €1.37 · 100 ГБ — €2.55 · 500 ГБ — €11.17 · 1 ТБ — €19.15 · 5 ТБ — €117. ≈ **€0.02–0.05/ГБ**.
- **Egress:** отдельно не тарифицируется (сеть 40 Гбит/с в цене).
- **CDN:** «CDN-хостинг», но фактически отдача из украинского ЦОД (не настоящий мульти-PoP edge).
- **Локация:** собственный ЦОД в Украине, NVMe.
- **UAH/ФОП:** да, явно (счета для ФОП/юрлиц).
- **Оценка интеграции:** S3 SDK не подойдёт — **но это почти точная замена текущего FTP** (тот же `basic-ftp`), при этом добавляет Secure Link и кастомный домен. **Минимальная по усилиям миграция, если остаёмся на FTP-модели и Node-хосте.** Это, по сути, апгрейд текущего `demo.promo`.
- Источник: [ukraine.com.ua/storage](https://www.ukraine.com.ua/storage/), [billing wiki (ФОП)](https://www.ukraine.com.ua/wiki/billing/entity-cash-payment/)

### 4.4. HostPro — Storage VPS
- **Что:** не объектное хранилище, а **блочный Storage VPS** (HDD/RAID, монтируешь сам), + реселл Cloudflare CDN.
- **Цена:** 250 ГБ — ₴10/мес · 500 ГБ — ₴20 · 1 ТБ — ₴30 · 2 ТБ — ₴40 · 4 ТБ — ₴50 · 6 ТБ — ₴60. ≈ **₴0.01–0.04/ГБ** (очень дёшево).
- **S3 API:** нет (можно самому поднять MinIO → `@aws-sdk/client-s3` с `forcePathStyle`).
- **Egress:** явного лимита/тарифа нет.
- **UAH/ФОП:** да.
- **Оценка:** супердёшево по ёмкости, но **DIY-ops**: сам ставишь MinIO/Nginx, сам отвечаешь за доступность. Не turnkey.
- Источник: [hostpro.ua/ua/storage-vps](https://hostpro.ua/ua/storage-vps/)

### 4.5. Tucha — TuchaBackup
- **Что:** украинский провайдер (с 2012), но **S3-продукта нет**. Ближайшее — backup-хранилище.
- **S3 API:** нет (FTP/SFTP/SCP/RSYNC). TuchaSync (WebDAV) — закрыт для новых.
- **Цена:** ~€0.10/ГБ (50 ГБ) → ~€0.067/ГБ (1 ТБ) → ~€0.050/ГБ (2 ТБ). **Egress безлимитный/бесплатный.**
- **Локация:** Словакия (Tier III+), для TuchaSync — Frankfurt.
- **UAH/ФОП:** да (грн/EUR/USD/PLN).
- **Оценка:** не S3, дороже за ГБ, ЦОД вне Украины. Как чистый бэкап — ок, как origin для веб-картинок — нет.
- Источник: [tucha.ua/uk/services/tuchabackup](https://tucha.ua/uk/services/tuchabackup)

### 4.6. Mirohost
- Object storage / S3 **нет**. Только shared/VPS/dedicated/colocation. ЦОД в Киеве. UAH/ФОП — да. Для задачи **не подходит** без self-host. Источник: [mirohost.net/en/datacenter](https://mirohost.net/en/datacenter)

### Итог по Украине
| Провайдер | S3 API | Цена | Egress | CDN | Локация | UAH/ФОП | Вердикт для проекта |
|---|---|---|---|---|---|---|---|
| **De Novo S3/Grid** | ✅ native (StorageGRID) | за запитом | **не тарифицируется** | — | Киев/Львов/FRA | ✅ | **Самый зрелый S3 в UA** — near drop-in, бесплатный egress; минус — цена по запросу |
| **GigaCloud Object Storage** | ✅ (Swift+S3) | за запитом | за запитом | ❌ | Киев/Львов/Варшава | ✅ | Хороший S3-вариант, ЦОД в UA, но непрозрачные цены |
| **ukraine.com.ua «Сховище CDN»** | ❌ (FTP+Secure Link) | €0.02–0.05/ГБ | вкл. | псевдо | UA | ✅ | **Лучший «минимальный шаг»** — почти drop-in замена FTP + подписанные URL + свой домен |
| **Thehost KeepData** | ❌ (SFTP/WebDAV) | 0.25–2.4 ₴/ГБ | вкл. | ❌ | 2× ЦОД UA | ✅ | Дёшево, грн-цены, in-UA репликация; не S3 |
| **HostPro Storage VPS** | ❌ (MinIO сам) | ₴0.01–0.04/ГБ | — | Cloudflare resell | UA | ✅ | Дёшево, но DIY (self-host MinIO) |
| **Cityhost Storage Box** | ❌ | €0.003–0.006/ГБ | ? | ❌ | FI/DE (EU) | ✅ | Самое дешёвое по ёмкости, но EU и не S3 |
| **Deltahost Cloud storage** | ❌ | $0.008–0.02/ГБ | ? | ❌ | UA/NL/US | ✅ | Не S3, но есть UA-локация |
| **Tucha Backup** | ❌ | €0.05–0.10/ГБ | free | ❌ | Словакия | ✅ | Только как бэкап |
| **Mirohost / Freehost** | ❌ | — | — | ❌ | UA | ✅ | Object storage нет — только self-host на VPS |

---

## 5. Глобальные S3-совместимые хранилища

### Мастер-таблица (базовая отдача в интернет)

| Провайдер | Хранение $/ГБ-мес | Egress $/ГБ | Запросы | CDN | Free tier | S3 API |
|---|---|---|---|---|---|---|
| **Cloudflare R2** | **0.015** | **0 (всегда free)** | A: $4.5/млн · B: $0.36/млн | вкл. (PoP в Киеве) | 10 ГБ + ops | ✅ |
| **Backblaze B2** | **~0.006** ($6.95/ТБ) | free до 3× хранения, далее 0.01; **free через Cloudflare** | A/B/C — free | через партнёров | 10 ГБ | ✅ |
| **Wasabi** | ~0.0069 ($6.99→**$7.99/ТБ** с 1 июля 2026) | free при egress ≤ объёма (1:1) | free | ❌ | ❌ (мин. 1 ТБ) | ✅ |
| **Hetzner Object Storage** | вкл. (база €4.99 = 1 ТБ) · сверх ~€0.006 | вкл. 1 ТБ, далее **€0.0012** (€1/ТБ) | free | ❌ | ❌ | ✅ |
| **DigitalOcean Spaces** | база $5 = 250 ГБ · сверх 0.02 | вкл. 1 ТБ, далее 0.01 | free | **вкл.** | ❌ | ✅ |
| **Linode/Akamai** | база $5 = 250 ГБ · сверх 0.02 | вкл. 1 ТБ, далее **0.005** | free до квоты (с ~окт 2026) | Akamai (отд. контракт) | ❌ | ✅ |
| **Scaleway** | €0.016 | 75 ГБ free, далее €0.01 | вкл. | Edge от €0.99 | 750 ГБ/90 дн (триал) | ✅ |
| **Google Cloud Storage** | ~0.020–0.023 (Standard) | ~0.12 | платно | нужен Cloud CDN | $300 кредит | ✅ |
| **Azure Blob (Hot)** | ~0.018–0.023 | ~0.087 | платно | нужен Azure CDN | $200 кредит | ✅ (через адаптер) |
| **AWS S3 (Standard)** | 0.023 | **0.09** (первые 100 ГБ free) | платно | нужен CloudFront | $200 кредит 6 мес | ✅ |

### Краткие оценки интеграции (Node + `@aws-sdk/client-s3`)
- **Cloudflare R2** — drop-in: `endpoint: https://<acct>.r2.cloudflarestorage.com`, presigned URL по SigV4, presigned работает на edge. **Главный плюс — нулевой egress** + PoP в Киеве (низкая задержка для UA-юзеров). Storage немного дороже, читающие операции (Class B) метрируются, но для веб-картинок копейки.
- **Backblaze B2** — drop-in S3, **самое дешёвое хранение**, все стандартные API-вызовы бесплатны, нет минимального срока. Egress бесплатен через **Cloudflare** (Bandwidth Alliance) — связка **B2 + Cloudflare CDN = почти бесплатная отдача**.
- **Hetzner** — drop-in S3, **самый дешёвый egress сверх квоты** (€1/ТБ), но **нет CDN** (надо паровать с внешним) и нет UA-residency (EU).
- **DigitalOcean Spaces / Linode** — drop-in S3 **с встроенным CDN** и предсказуемым $5/мес. Хорошо, если хочется «всё в одном» без отдельного CDN-контракта.
- **Wasabi** — дёшево, но **минимум 1 ТБ биллинга** и **90-дневный минимум хранения** + «reasonable use» по egress — неудобно для приложения с активным удалением (retention) и небольшими объёмами.
- **AWS S3 / GCS / Azure** — максимально зрелые, но **egress дорогой**; имеют смысл только если экосистема уже там. Для этого проекта переплата за трафик.

### Самые дешёвые для image-heavy с публичным чтением
1. **Backblaze B2 + Cloudflare CDN** — фактически бесплатный egress, ~$0.006/ГБ хранение.
2. **Cloudflare R2** — нулевой egress «из коробки», без партнёрской связки, PoP в Киеве.
3. **Hetzner** — дёшево, если внешний CDN не нужен или ставится отдельно.

### AWS — детальнее (S3 + CloudFront)
Эталон отрасли и нативный S3 API, но **дорогой по egress** — имеет смысл, только если уже завязаны на AWS-экосистему.

- **S3 Standard:** $0.023/ГБ-мес (первые 50 ТБ). Дешевле для редко читаемых файлов: **S3 Standard-IA** ~$0.0125/ГБ, **One Zone-IA** ~$0.01/ГБ (но +плата за чтение и мин. срок 30 дней, мин. объект 128 КБ).
- **Egress напрямую из S3:** первые 100 ГБ/мес free, далее **$0.09/ГБ** — главный источник стоимости.
- **Решение для трафика — CloudFront (CDN):** **1 ТБ egress + 10 млн запросов/мес — бесплатно навсегда**, далее ~$0.085/ГБ (US/EU). Трафик S3→CloudFront бесплатный, поэтому **связка S3 + CloudFront почти убирает egress-боль** на наших объёмах (~1 ТБ/мес укладывается в free tier CloudFront).
- **Запросы:** PUT $0.005/1000, GET $0.0004/1000.
- **Free tier:** новые аккаунты (после 15.07.2025) — $200 кредитов на 6 мес (старого «5 ГБ навсегда» больше нет).
- **S3 API:** native. Интеграция в Node — `@aws-sdk/client-s3` drop-in вместо FTP, presigned URL, есть украинский edge через CloudFront (ближайшие PoP — Варшава/Франкфурт; выделенного PoP в Украине у AWS нет, в отличие от Cloudflare).
- **UAH/ФОП:** нет — биллинг в USD, международная карта.
- **Стоимость в нашем сценарии (300 ГБ + 1 ТБ):** **голый S3 ≈ $88/мес** (egress убивает), **S3 + CloudFront ≈ $7/мес** (1 ТБ в free tier CloudFront + хранение $6.9). То есть AWS конкурентоспособен **только в связке с CloudFront**.
- **Вердикт:** технически безупречно и максимально зрело, но **сложнее в настройке** (IAM, bucket policy, CloudFront-дистрибуция, OAC) и без UAH-биллинга. Для этого проекта Cloudflare R2 даёт тот же результат (нулевой egress) проще и с PoP в Киеве. AWS оправдан, если планируется более широкое использование AWS.
- Источник: [aws.amazon.com/s3/pricing](https://aws.amazon.com/s3/pricing/), [aws.amazon.com/cloudfront/pricing](https://aws.amazon.com/cloudfront/pricing/)

---

## 6. Image-специфичные и платформенные сервисы

Эти решения **уже близки к стеку** (Vercel + Supabase) или дают **трансформации** (могли бы заменить ручную генерацию ресайз-тайлов).

### 6.1. Vercel Blob *(приложение уже на Vercel)*
- **Цена:** хранение **$0.023/ГБ-мес**, передача данных **$0.05/ГБ**. Hobby: 1 ГБ + 10 ГБ трафика free.
- **Интеграция:** **минимальное трение** — `@vercel/blob`, `put()`/`del()`, работает в serverless-функции «из коробки», без env-возни. Подписанные/публичные URL сразу.
- **Минус:** **egress $0.05/ГБ** делает его дорогим при картиночном трафике (см. §3: ~$57/мес против ~$4.5 у R2). Нет трансформаций.
- **Когда брать:** если приоритет — нулевое трение и трафик небольшой.
- Источник: [vercel.com/docs/vercel-blob/usage-and-pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)

### 6.2. Supabase Storage *(Supabase уже в стеке: Postgres + Auth)*
- **Цена:** хранение **$0.021/ГБ** (свыше 100 ГБ на Pro). Egress: 250 ГБ в Pro включено, далее **$0.09/ГБ uncached** / **$0.03/ГБ cached** (трафик идёт через API-gateway-CDN).
- **S3-совместимость:** есть **S3-endpoint** (в т.ч. multipart) → можно `@aws-sdk/client-s3`. Плюс нативный `supabase-js` Storage API с **RLS-политиками** и подписанными URL.
- **Интеграция:** **очень низкое трение** — клиент Supabase уже сконфигурирован, auth тот же. Загрузка из serverless-функции тривиальна. RLS даёт per-user изоляцию без ручного蛋 path-обфускации (как сейчас в `shortUserId`).
- **Минус:** uncached egress дорогой; cached дешевле, но зависит от cache-hit. Дороже R2/B2.
- **Когда брать:** если важна **единая консоль с БД/Auth** и RLS-управление доступом важнее цены egress. Архитектурно — самый «родной» вариант.
- Источник: [supabase.com/docs/guides/storage/pricing](https://supabase.com/docs/guides/storage/pricing), [bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth)

### 6.3. Cloudinary *(хранение + мощные трансформации)*
- **Цена:** кредитная модель. Free: **25 кредитов/мес** (1 кредит = 1 ГБ хранения **или** 1 ГБ трафика **или** 1000 трансформаций) ≈ 25 ГБ. Платные планы — пакетами кредитов.
- **Плюс:** on-the-fly resize/crop/format(WebP/AVIF)/оптимизация — **мог бы заменить ручную генерацию ресайз-тайлов** (сейчас это API-вызовы + canvas). Один мастер → все размеры по URL-параметрам.
- **Минус:** дорого при росте; кредитная модель смешивает хранение/трафик/трансформации — трудно прогнозировать.
- **Когда брать:** если решим **переложить ресайзы на CDN-трансформации** вместо генерации.
- Источник: [cloudinary.com/pricing](https://cloudinary.com/pricing)

### 6.4. ImageKit.io
- **Цена:** Free — **20 ГБ трафика/мес**, **безлимитные трансформации** (не тарифицируются). Платно от ~$9/мес (+AVIF).
- **Плюс:** трансформации не считаются (в отличие от Cloudinary) — дешевле для много-размерного вывода. S3/внешний origin поддерживается.
- **Когда брать:** дешевле Cloudinary, если основная ценность — трансформации/оптимизация отдачи.
- Источник: [imagekit.io](https://imagekit.io/cloudinary-alternative/)

### 6.5. Bunny.net (Storage + CDN + Optimizer)
- **Цена:** Edge Storage **$0.01/ГБ** (1 регион), CDN **$0.01/ГБ** (EU/NA), Optimizer **$9.50/мес/сайт** (unlimited WebP/AVIF). Минимум $1/мес.
- **Минус:** Edge Storage **не S3-совместим** (свой HTTP API) — слой загрузки придётся писать под их SDK.
- **Плюс:** очень дёшево, отличный европейский CDN, есть PoP близко к Украине.
- **Когда брать:** если нужен дешёвый CDN + опциональная image-оптимизация и не жалко написать не-S3 аплоадер.
- Источник: [bunny.net/pricing/storage](https://bunny.net/pricing/storage/)

---

## 7. Рекомендации

### Матрица выбора по сценарию

| Сценарий | Рекомендация | Почему |
|---|---|---|
| **Хочу дёшево + быстро в мире, минимум переписывания** | **Cloudflare R2** | Нулевой egress, S3-API (drop-in вместо FTP), PoP в Киеве, ~$4.5/мес в нашем сценарии |
| **Хочу абсолютный минимум стоимости отдачи** | **Backblaze B2 + Cloudflare CDN** | ~$0.006/ГБ хранение + бесплатный egress через Cloudflare |
| **Хочу остаться в украинской юрисдикции с S3** | **De Novo S3/Grid** (native S3, egress не тарифицируется) или **GigaCloud** | S3-API, ЦОД в Украине, UAH/ФОП (цену запросить КП) |
| **Минимальный шаг от текущего FTP, UA-юрисдикция** | **ukraine.com.ua «Сховище CDN»** | Та же FTP-модель (`basic-ftp`), + Secure Link + кастомный домен, грн/ФОП |
| **Важна единая консоль с БД/Auth + RLS** | **Supabase Storage** | Уже в стеке, S3-endpoint, RLS вместо ручной обфускации путей |
| **Нулевое трение, трафик небольшой** | **Vercel Blob** | Уже на Vercel, `put()` в одну строку (но дорогой egress) |
| **Хочу убрать ручную генерацию ресайзов** | **ImageKit / Cloudinary** | On-the-fly resize/WebP — один мастер, все размеры по URL |

### Топ-рекомендация для текущего стека (Vercel + Supabase)

**Cloudflare R2** как основное хранилище:
- **S3-совместимость** → заменяем [src/lib/ftp/uploader.ts](src/lib/ftp/uploader.ts) на тонкий S3-клиент почти без изменений в [cardWriter.ts](src/lib/history/cardWriter.ts) (тот же `uploadImage(buffer, args)` интерфейс).
- **Нулевой egress** → стоимость отдачи не растёт с трафиком (критично для грида/истории/ZIP).
- **Работает на edge** → снимает ограничение «FTP только в Node-runtime», упрощает serverless.
- **Убирает disk-buffer retry** → объектное хранилище надёжнее, чем буфер на эфемерной ФС Vercel; retry-воркер сильно упрощается (буфер можно держать прямо в R2/temp-bucket или просто ретраить из исходного dataURL).
- **PoP в Киеве** → низкая задержка для украинских пользователей.

**Запасной/гибридный вариант:** **Supabase Storage**, если ценность «всё в одной консоли + RLS» перевешивает чуть более дорогой egress. Архитектурно это самый «родной» путь (auth и БД уже там).

### Объём работ по миграции (оценка)
1. Новый модуль `src/lib/storage/s3.ts` (`@aws-sdk/client-s3`): `uploadFile(buffer, key)`, `deleteFiles(keys)`, `ping()` — зеркало текущего `ftp/uploader.ts`. **~0.5 дня.**
2. `storage.ts`: `buildPath` → `buildKey` (тот же layout, но object key вместо FTP-пути) + `getBaseUrl` на R2 public/custom domain. **~0.5 дня.**
3. Env: заменить `FTP_*` на `S3_*` (`endpoint`, `access_key`, `secret`, `bucket`, `public_url`). Обновить [HANDOVER.md](HANDOVER.md)/[MIGRATION_NOTES.md](MIGRATION_NOTES.md). **~0.25 дня.**
4. Упростить `uploadRetryWorker` (убрать disk-buffer, ретраить из объекта/исходника). **~0.5 дня.**
5. Миграция существующих файлов с FTP на новый бакет (скрипт `rclone`/одноразовый) + бэкофилл `image_url`/`ftp_path` в `generations`. **~0.5–1 день.**
6. Тест: генерация → upload → отдача по CDN → retention-delete. **~0.5 дня.**

**Итого: ~3–4 дня.** Интерфейс `uploadImage`/`deleteCardFiles` уже изолирован — основной код (`cardWriter`, retention, resize-tile) почти не трогается.

---

## Источники

**Украина:**
- [GigaCloud Object Storage](https://gigacloud.ua/en/solutions/hmarne-shovyshhe-danyh/)
- [De Novo S3](https://denovo.ua/s3-object-storage)
- [ukraine.com.ua «Сховище CDN»](https://www.ukraine.com.ua/storage/) · [ФОП-биллинг](https://www.ukraine.com.ua/wiki/billing/entity-cash-payment/)
- [HostPro Storage VPS](https://hostpro.ua/ua/storage-vps/)
- [Tucha Backup](https://tucha.ua/uk/services/tuchabackup)
- [Mirohost ЦОД](https://mirohost.net/en/datacenter)

**Глобальные S3:**
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) · [Kyiv PoP](https://blog.cloudflare.com/kyiv/) · [S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
- [Backblaze B2 Pricing](https://www.backblaze.com/cloud-storage/pricing) · [Transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing)
- [Wasabi Pricing](https://wasabi.com/pricing) · [FAQ](https://wasabi.com/pricing/faq)
- [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)
- [DigitalOcean Spaces Pricing](https://docs.digitalocean.com/products/spaces/details/pricing/)
- [Linode/Akamai Object Storage](https://techdocs.akamai.com/cloud-computing/docs/object-storage-pricing)
- [Scaleway Storage Pricing](https://www.scaleway.com/en/pricing/storage/)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)

**Image / платформенные:**
- [Vercel Blob Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Supabase Storage Pricing](https://supabase.com/docs/guides/storage/pricing) · [Bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth)
- [Cloudinary Pricing](https://cloudinary.com/pricing)
- [ImageKit](https://imagekit.io/cloudinary-alternative/)
- [Bunny.net Storage](https://bunny.net/pricing/storage/) · [CDN](https://bunny.net/pricing/cdn/)
