-- Run on the ISOLATED rebuilt database, not production mutations.
SELECT table_name, count(*) AS columns FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name;
SELECT count(*) AS constraints FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public';
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname;
SELECT tgrelid::regclass::text AS table_name, tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY 1,2;
SELECT name FROM public.roles ORDER BY name;
