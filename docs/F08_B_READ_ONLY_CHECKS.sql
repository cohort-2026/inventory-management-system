-- F08-B verification (read-only). Replace the example count number with your new CNT reference.
-- Run statements individually if Supabase only displays the final result set.

-- 1. New counts have zero-inclusive snapshots; every active product appears once.
SELECT
    c.count_no,
    c.status,
    l.name AS warehouse,
    (SELECT COUNT(*) FROM public.products WHERE status = 'active') AS active_products,
    COUNT(i.item_id) AS snapshotted_products,
    COUNT(*) FILTER (WHERE i.expected_quantity = 0) AS zero_snapshot_lines
FROM public.inventory_counts c
JOIN public.locations l ON l.location_id = c.location_id
LEFT JOIN public.inventory_count_items i ON i.count_id = c.count_id
WHERE c.count_no = 'CNT-000009'
GROUP BY c.count_id, c.count_no, c.status, l.name;

-- 2. F08 count submission metadata (does not imply stock movement posting).
SELECT count_no, status, submitted_at IS NOT NULL AS has_submission_time,
       submitted_by IS NOT NULL AS has_submitter,
       posted_at IS NOT NULL AS posted
FROM public.inventory_counts
WHERE count_no = 'CNT-000009';

-- 3. No stock movement should be linked to an F08-B count before F08-C.
SELECT c.count_no, COUNT(sm.movement_id) AS count_variance_movements
FROM public.inventory_counts c
LEFT JOIN public.stock_movements sm
  ON sm.reference_id = c.count_id AND sm.movement_type = 'COUNT_VARIANCE'
WHERE c.count_no = 'CNT-000009'
GROUP BY c.count_no;

-- 4. Existing legacy statuses should remain intact.
SELECT status, COUNT(*) AS count_total
FROM public.inventory_counts
GROUP BY status
ORDER BY status;
