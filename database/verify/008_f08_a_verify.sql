-- Read-only verification. No private user records returned.
SELECT status, legacy_completed, COUNT(*) AS counts
FROM public.inventory_counts
GROUP BY status, legacy_completed
ORDER BY status, legacy_completed;

SELECT COUNT(*) AS total_counts,
       COUNT(count_no) AS counts_with_reference,
       COUNT(DISTINCT count_no) AS distinct_references,
       COUNT(*) FILTER (WHERE legacy_completed) AS legacy_completed_counts
FROM public.inventory_counts;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inventory_counts', 'inventory_count_items')
  AND column_name IN (
    'count_no', 'legacy_completed', 'submitted_at', 'submitted_by',
    'posted_at', 'posted_by', 'cancelled_at', 'cancelled_by',
    'recount_requested_at', 'recount_requested_by', 'recount_note',
    'recount_round', 'counted_by', 'counted_at', 'reason_code_id',
    'reason_note', 'recount_required', 'recount_completed_at'
  )
ORDER BY table_name, column_name;

SELECT code, label, requires_note, active
FROM public.reason_codes
WHERE movement_type = 'COUNT_VARIANCE'
ORDER BY code;

SELECT COUNT(*) AS movement_count
FROM public.stock_movements
WHERE movement_type = 'COUNT_VARIANCE';
