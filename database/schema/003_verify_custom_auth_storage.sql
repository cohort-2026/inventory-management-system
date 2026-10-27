
-- IMS Phase 1 verification
-- Read-only verification of custom auth storage

-- 1. Expect three new tables.
SELECT
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
      'user_credentials',
      'auth_sessions',
      'auth_action_tokens'
  )
ORDER BY tablename;


-- 2. Check primary and foreign key constraints.
SELECT
    conrelid::regclass AS table_name,
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
    'public.user_credentials'::regclass,
    'public.auth_sessions'::regclass,
    'public.auth_action_tokens'::regclass
)
ORDER BY
    conrelid::regclass::text,
    conname;


-- 3. Check indexes.
SELECT
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
      'user_credentials',
      'auth_sessions',
      'auth_action_tokens'
  )
ORDER BY tablename, indexname;


-- 4. Expect zero rows in every new table.
SELECT 'user_credentials' AS table_name,
       COUNT(*) AS records
FROM public.user_credentials

UNION ALL

SELECT 'auth_sessions',
       COUNT(*)
FROM public.auth_sessions

UNION ALL

SELECT 'auth_action_tokens',
       COUNT(*)
FROM public.auth_action_tokens;


-- 5. Verify the existing Viewer role remains.
SELECT role_id, name
FROM public.roles
WHERE name = 'Viewer';
