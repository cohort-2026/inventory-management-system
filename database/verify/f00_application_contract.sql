-- READ ONLY: compare the deployed application's current schema with API assumptions.
SELECT 'inventory_counts.status' AS field,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_counts' AND column_name='status') AS exists
UNION ALL
SELECT 'inventory_counts.note', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_counts' AND column_name='note')
UNION ALL
SELECT 'inventory_count_items.expected_quantity', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='expected_quantity')
UNION ALL
SELECT 'inventory_count_items.counted_quantity', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='counted_quantity')
UNION ALL
SELECT 'stock_movements.quantity_after', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_movements' AND column_name='quantity_after')
UNION ALL
SELECT 'users.role_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role_id');

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.inventory_counts'::regclass, 'public.inventory_count_items'::regclass)
  AND contype = 'c'
ORDER BY conrelid::regclass::text, conname;
