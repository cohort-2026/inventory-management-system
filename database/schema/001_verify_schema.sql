-- Inventory Management System: non-destructive verification for Issue #1
-- Run in Supabase SQL Editor AFTER 001_initial_schema.sql.

-- Expect 9 rows; all row_security values should be true.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'users', 'categories', 'products', 'locations',
    'inventory', 'stock_movements', 'inventory_counts', 'inventory_count_items'
  )
ORDER BY tablename;

-- Expect 3 roles: Manager, Inventory Staff, Viewer.
SELECT name, description FROM public.roles ORDER BY name;

-- Confirm foreign keys, UNIQUE constraints and CHECK constraints.
SELECT conrelid::regclass AS table_name, conname AS constraint_name,
       CASE contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'c' THEN 'CHECK'
         ELSE contype::text
       END AS constraint_type
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid IN (
    'public.roles'::regclass, 'public.users'::regclass,
    'public.categories'::regclass, 'public.products'::regclass,
    'public.locations'::regclass, 'public.inventory'::regclass,
    'public.stock_movements'::regclass, 'public.inventory_counts'::regclass,
    'public.inventory_count_items'::regclass
  )
ORDER BY table_name, constraint_type, constraint_name;

-- Confirm five updated_at triggers and two Auth lifecycle triggers.
SELECT event_object_schema, event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema IN ('public', 'auth')
  AND trigger_name IN (
    'users_updated_at', 'categories_updated_at', 'products_updated_at',
    'locations_updated_at', 'inventory_updated_at',
    'on_auth_user_created_ims', 'on_auth_user_email_updated_ims'
  )
ORDER BY event_object_schema, event_object_table, trigger_name;

-- Confirm there are no public-table RLS policies yet (expected at this stage).
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'users', 'categories', 'products', 'locations',
    'inventory', 'stock_movements', 'inventory_counts', 'inventory_count_items'
  )
ORDER BY tablename, policyname;
