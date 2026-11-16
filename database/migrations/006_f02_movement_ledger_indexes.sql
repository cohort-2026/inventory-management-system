-- F02: Additional combined filter index; safe to apply once on existing DB.
-- Existing location/created_at, product/created_at, user/created_at and reference indexes are retained.
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_location_created_at
  ON public.stock_movements (product_id, location_id, created_at DESC, movement_id DESC);
