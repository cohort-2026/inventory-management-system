-- Inventory Management System - GitHub Issue #2
-- Read-only verification after running 002_database_indexes.sql.
-- Supabase SQL Editor generally shows only the LAST SELECT result per run;
-- execute individual SELECTs separately if you want to view all result sets.

-- A. Expect 13 rows, all present = true. No duplicate unexpected definitions.
WITH expected(indexname) AS (
    VALUES
      ('idx_products_name'),
      ('idx_products_category_id'),
      ('idx_users_role_id'),
      ('idx_inventory_location_id'),
      ('idx_stock_movements_product_created_at'),
      ('idx_stock_movements_location_created_at'),
      ('idx_stock_movements_user_created_at'),
      ('idx_stock_movements_created_at'),
      ('idx_stock_movements_reference_id'),
      ('idx_inventory_counts_location_started_at'),
      ('idx_inventory_counts_user_id'),
      ('idx_inventory_counts_status_started_at'),
      ('idx_inventory_count_items_product_id')
)
SELECT e.indexname, (i.indexname IS NOT NULL) AS present,
       i.tablename, i.indexdef
FROM expected AS e
LEFT JOIN pg_indexes AS i
  ON i.schemaname = 'public' AND i.indexname = e.indexname
ORDER BY e.indexname;

-- B. View all indexes on the nine application tables, including automatically
-- created PK/UNIQUE indexes from Issue #1.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'users', 'categories', 'products', 'locations',
    'inventory', 'stock_movements', 'inventory_counts', 'inventory_count_items'
  )
ORDER BY tablename, indexname;

-- C. Compact pass/fail, useful because it is the LAST query in this file.
WITH expected(indexname) AS (
    VALUES
      ('idx_products_name'),
      ('idx_products_category_id'),
      ('idx_users_role_id'),
      ('idx_inventory_location_id'),
      ('idx_stock_movements_product_created_at'),
      ('idx_stock_movements_location_created_at'),
      ('idx_stock_movements_user_created_at'),
      ('idx_stock_movements_created_at'),
      ('idx_stock_movements_reference_id'),
      ('idx_inventory_counts_location_started_at'),
      ('idx_inventory_counts_user_id'),
      ('idx_inventory_counts_status_started_at'),
      ('idx_inventory_count_items_product_id')
)
SELECT COUNT(*) AS expected_indexes,
       COUNT(i.indexname) AS installed_indexes,
       CASE WHEN COUNT(i.indexname) = COUNT(*) THEN 'PASS' ELSE 'FAIL' END AS result
FROM expected AS e
LEFT JOIN pg_indexes AS i
  ON i.schemaname = 'public' AND i.indexname = e.indexname;
