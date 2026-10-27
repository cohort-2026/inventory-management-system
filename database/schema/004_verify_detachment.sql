
-- IMS Phase 1: Verify independence from Supabase Auth
-- Read-only checks

-- A. Confirm public.users now generates UUIDs.
SELECT
    column_name,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'user_id';


-- B. Expect zero foreign keys from
-- public.users to auth.users.
SELECT COUNT(*) AS remaining_auth_foreign_keys
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.conrelid = 'public.users'::regclass
  AND c.confrelid = 'auth.users'::regclass;


-- C. Verify inventory foreign keys remain.
SELECT
    c.conrelid::regclass AS source_table,
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = 'public.users'::regclass
ORDER BY c.conrelid::regclass::text, c.conname;


-- D. Confirm the Viewer role exists.
SELECT
    role_id,
    name
FROM public.roles
WHERE name = 'Viewer';


-- E. Confirm user IDs and roles remain readable.
-- Returns counts, not personal information.
SELECT
    r.name AS assigned_role,
    COUNT(u.user_id) AS account_count
FROM public.roles r
LEFT JOIN public.users u
    ON u.role_id = r.role_id
GROUP BY r.name
ORDER BY r.name;


-- F. Confirm old Auth triggers are still present.
SELECT
    t.tgname AS trigger_name
FROM pg_trigger t
WHERE t.tgrelid = 'auth.users'::regclass
  AND NOT t.tgisinternal
  AND t.tgname IN (
      'on_auth_user_created_ims',
      'on_auth_user_email_updated_ims'
  )
ORDER BY t.tgname;


-- G. Confirm custom authentication tables remain.
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
