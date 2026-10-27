
-- Inventory Management System
-- Phase 1: Detach public.users from Supabase Auth
--
-- Non-destructive structural migration.
-- Existing users and inventory records are preserved.
--
-- Do not remove Supabase Auth identities yet.

BEGIN;

DO $$
DECLARE
    auth_fk_name text;
    auth_fk_count integer;
BEGIN
    -- Find the foreign key linking public.users
    -- to auth.users.
    SELECT
        COUNT(*),
        MIN(c.conname)
    INTO
        auth_fk_count,
        auth_fk_name
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.users'::regclass
      AND c.confrelid = 'auth.users'::regclass;

    -- Fail safely if the database differs from
    -- the expected initial schema.
    IF auth_fk_count <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one public.users -> auth.users foreign key; found %',
            auth_fk_count;
    END IF;

    -- Remove only the specific Supabase Auth
    -- foreign-key constraint.
    EXECUTE format(
        'ALTER TABLE public.users DROP CONSTRAINT %I',
        auth_fk_name
    );

    RAISE NOTICE
        'Removed foreign key constraint: %',
        auth_fk_name;
END;
$$;

-- Allow PostgreSQL to generate UUIDs for
-- custom-auth accounts created by Express.
ALTER TABLE public.users
ALTER COLUMN user_id SET DEFAULT gen_random_uuid();

-- Existing user_id values remain unchanged.
-- Existing inventory relationships remain intact.

COMMIT;
