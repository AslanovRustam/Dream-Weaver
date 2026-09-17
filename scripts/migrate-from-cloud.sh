#!/usr/bin/env bash
# Перенос данных из облачного Supabase в self-hosted (на этом сервере).
#
# Запуск:
#   export CLOUD_PW='пароль_облачной_БД'
#   bash migrate-from-cloud.sh
#
# Идемпотентность: скрипт НЕ чистит целевую базу. Если прогон был частичным,
# сбросьте стек кнопкой "Fresh Volumes" в Dokploy и запустите заново.
set -euo pipefail

CLOUD_HOST="aws-0-eu-west-1.pooler.supabase.com"
CLOUD_USER="postgres.gqwwrrlzdsopigauafpl"
REPO_RAW="https://raw.githubusercontent.com/AslanovRustam/Dream-Weaver/main/supabase/migrations"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "${CLOUD_PW:-}" ] || die "не задан CLOUD_PW (export CLOUD_PW='...')"

DB=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*-db-[0-9]+$' | head -1)
REST=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*-rest-[0-9]+$' | head -1)
[ -n "$DB" ] || die "не найден контейнер postgres"
say "Контейнеры: db=$DB rest=${REST:-не найден}"

# Пароль передаём через окружение, а не в строке подключения, чтобы он не попал
# ни в ps, ни в логи, и чтобы спецсимволы не ломали URI.
CLOUD_URI="postgresql://${CLOUD_USER}@${CLOUD_HOST}:5432/postgres?sslmode=require"
dex() { docker exec -e PGPASSWORD="$CLOUD_PW" "$DB" "$@"; }

say "1/7 Проверка связи с облаком"
dex psql "$CLOUD_URI" -tAc "select 'облако: ' || version();" || die "нет связи с облачной БД (пароль? регион? sslmode?)"

say "2/7 Счётчики В ОБЛАКЕ (до переноса)"
dex psql "$CLOUD_URI" -c "
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'generations', count(*) from public.generations
union all select 'generation_cards', count(*) from public.generation_cards
union all select 'credit_transactions', count(*) from public.credit_transactions
order by 1;"

say "3/7 Дамп пользователей (auth.users, auth.identities)"
dex pg_dump "$CLOUD_URI" --data-only --no-owner \
    --table=auth.users --table=auth.identities -f /tmp/auth_data.sql
docker exec "$DB" sh -c 'ls -lh /tmp/auth_data.sql'

say "4/7 Дамп схемы public (структура + данные)"
dex pg_dump "$CLOUD_URI" --schema=public --no-owner -f /tmp/public.sql
docker exec "$DB" sh -c 'ls -lh /tmp/public.sql'

say "5/7 Восстановление: сначала пользователи, затем public"
# session_replication_role=replica глушит триггеры: иначе handle_new_user
# насоздаёт профилей, и вставка public.profiles упадёт на дубликатах.
docker exec "$DB" psql -U postgres -d postgres --single-transaction \
    -v ON_ERROR_STOP=1 -c 'SET session_replication_role = replica' -f /tmp/auth_data.sql
docker exec "$DB" psql -U postgres -d postgres --single-transaction \
    -v ON_ERROR_STOP=1 -c 'SET session_replication_role = replica' -f /tmp/public.sql

say "6/7 Догоняем миграции, которых нет в облаке (0006 RBAC, 0007 notifications)"
for m in 0006_rbac_role_tier.sql 0007_notifications.sql; do
  if curl -fsSL "$REPO_RAW/$m" -o "/tmp/$m"; then
    docker cp "/tmp/$m" "$DB:/tmp/$m"
    docker exec "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$m" \
      && echo "  применена: $m" || echo "  ПРОПУЩЕНА (ошибка): $m"
  else
    echo "  не скачалась: $m — примените вручную через Studio"
  fi
done

say "7/7 Перезапуск PostgREST (иначе не увидит новые таблицы)"
[ -n "$REST" ] && docker restart "$REST" >/dev/null && echo "  $REST перезапущен"

say "ИТОГ — счётчики в новой базе"
docker exec "$DB" psql -U postgres -d postgres -c "
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'generations', count(*) from public.generations
union all select 'generation_cards', count(*) from public.generation_cards
union all select 'credit_transactions', count(*) from public.credit_transactions
union all select 'notifications', count(*) from public.notifications
union all select '>>> СИРОТЫ (надо 0)', count(*) from public.profiles p
         left join auth.users u on u.id = p.id where u.id is null
order by 1;"

say "Готово. Сверьте числа с шагом 2/7."
