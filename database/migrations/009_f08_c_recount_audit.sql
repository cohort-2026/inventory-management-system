-- F08-C: preserve earlier physical observations when a Manager requests a recount.
-- No changes to inventory quantities or existing movements.
BEGIN;
CREATE TABLE public.inventory_count_recount_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(count_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
  recount_round integer NOT NULL CHECK (recount_round > 0),
  previous_counted_quantity numeric,
  previous_counted_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
  previous_counted_at timestamptz,
  requested_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_note text NOT NULL CHECK (length(btrim(request_note)) BETWEEN 1 AND 2000),
  CONSTRAINT inventory_count_recount_history_unique UNIQUE (count_id, product_id, recount_round)
);
CREATE INDEX inventory_count_recount_history_count_idx
  ON public.inventory_count_recount_history(count_id, recount_round);
COMMIT;
