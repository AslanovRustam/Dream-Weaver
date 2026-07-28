-- =====================================================================
-- Импорт данных БЕЗ привязки к пользователям (нет FK на auth.users).
-- Эти таблицы можно залить сразу после создания схемы.
--
-- Запуск через psql (Settings -> Database -> Connection string):
--   psql "postgresql://postgres:PASSWORD@HOST:5432/postgres" -f supabase/import_config_data.sql
--
-- ВАЖНО:
--  1. Сначала создайте схему: MIGRATE_TO_PERSONAL.sql (Dream Weaver) и
--     extra_tables.sql (estimations/chat/benchmarks).
--  2. Проверьте пути к CSV ниже — при необходимости поправьте каталог.
--  3. \copy выполняется на стороне КЛИЕНТА (psql), файлы читаются с вашего
--     диска — прав superuser не требуется.
-- =====================================================================

\encoding UTF8

-- ---- «чужие» справочники/история/чат (порядок не важен, взаимных FK нет) ----
\copy public.market_benchmarks   FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/market_benchmarks_rows.csv'   WITH (FORMAT csv, HEADER true)
\copy public.estimations         FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/estimations_rows.csv'         WITH (FORMAT csv, HEADER true)
\copy public.estimations_history FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/estimations_history_rows.csv' WITH (FORMAT csv, HEADER true)
\copy public.chat_sessions       FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/chat_sessions_rows.csv'       WITH (FORMAT csv, HEADER true)

-- ---- Dream Weaver config (уже засеяно скриптом схемы; импорт только если
--       вы меняли значения и хотите ровно свои). on-conflict нет у \copy,
--       поэтому заливать в НЕПУСТУЮ таблицу нельзя — раскомментируйте только
--       если пропустили сид или очистили таблицу. --------------------------
-- \copy public.app_settings          FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/app_settings_rows.csv'          WITH (FORMAT csv, HEADER true)
-- \copy public.pricing_coefficients  FROM 'D:/projects/clickable/Скобелєв Віктор/Table-SQL/pricing_coefficients_rows.csv'  WITH (FORMAT csv, HEADER true)

-- ---- Сброс identity-счётчиков после импорта явных id ----
select setval(pg_get_serial_sequence('public.market_benchmarks','id'), coalesce((select max(id) from public.market_benchmarks), 1));
select setval(pg_get_serial_sequence('public.estimations','id'),       coalesce((select max(id) from public.estimations), 1));
select setval(pg_get_serial_sequence('public.chat_sessions','id'),     coalesce((select max(id) from public.chat_sessions), 1));

\echo '--- config data import done ---'
