-- READ ONLY: run in Supabase SQL Editor. No table data, credentials, hashes or tokens are returned.
-- Save the results for comparison with the candidate pg_dump baseline.

-- 1. Public tables and columns (use to compare backend expectations)
SELECT table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 2. Table constraints (includes check definitions and key relationships)
SELECT c.conrelid::regclass::text AS table_name, c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;

-- 3. Public table RLS configuration
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Role policies on public tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Triggers on public tables (do not include trigger function source)
SELECT event_object_table AS table_name, trigger_name, event_manipulation,
       action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 6. Extensions; note whether the schema dump depends on non-public extensions
SELECT extname, extversion, extnamespace::regnamespace::text AS installed_schema
FROM pg_extension ORDER BY extname;

-- 7. Required relation presence (does not enumerate actual records)
WITH required(name) AS (
  VALUES ('roles'), ('users'), ('categories'), ('products'), ('locations'),
         ('inventory'), ('stock_movements'), ('inventory_counts'),
         ('inventory_count_items'), ('user_credentials'),
         ('auth_sessions'), ('auth_action_tokens')
)
SELECT name, to_regclass('public.' || name) IS NOT NULL AS exists
FROM required ORDER BY name;
