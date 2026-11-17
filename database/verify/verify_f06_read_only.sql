-- Execute each query after deploying F06. These statements do not modify data.
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('suppliers','goods_receipts','goods_receipt_lines') ORDER BY 1;
SELECT r.receipt_no,r.status,r.delivery_note,r.created_at,r.posted_at,s.name AS supplier,l.name AS location,
       count(gl.line_id) AS lines,
       count(sm.movement_id) AS receipt_movements
FROM public.goods_receipts r
JOIN public.suppliers s ON s.supplier_id=r.supplier_id
JOIN public.locations l ON l.location_id=r.location_id
LEFT JOIN public.goods_receipt_lines gl ON gl.receipt_id=r.receipt_id
LEFT JOIN public.stock_movements sm ON sm.reference_id=r.receipt_id AND sm.movement_type='RECEIPT' AND sm.product_id=gl.product_id
GROUP BY r.receipt_id,s.name,l.name ORDER BY r.created_at DESC;
SELECT r.receipt_no,gl.line_number,p.sku,gl.expected_packs,gl.received_packs,gl.units_per_pack,
       (gl.received_packs*gl.units_per_pack) AS base_units,gl.unit_cost,gl.short_delivery_note,
       sm.movement_no,sm.quantity_change,sm.quantity_after,
       i.quantity AS current_stock
FROM public.goods_receipts r
JOIN public.goods_receipt_lines gl ON gl.receipt_id=r.receipt_id
JOIN public.products p ON p.product_id=gl.product_id
LEFT JOIN public.stock_movements sm ON sm.reference_id=r.receipt_id AND sm.product_id=gl.product_id AND sm.movement_type='RECEIPT'
LEFT JOIN public.inventory i ON i.product_id=gl.product_id AND i.location_id=r.location_id
ORDER BY r.created_at DESC,gl.line_number;
