-- F06: run after F01/F02, with a verified database backup and an approved deployment window.
-- Additive migration. Never drop populated tables as a rollback.
BEGIN;
CREATE TABLE IF NOT EXISTS public.suppliers (
  supplier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code varchar(40) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  contact_name varchar(160),
  email varchar(254),
  phone varchar(60),
  address text,
  status varchar(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_code_nonempty CHECK (length(btrim(supplier_code)) > 0),
  CONSTRAINT suppliers_name_nonempty CHECK (length(btrim(name)) > 0)
);
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(supplier_id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(location_id) ON DELETE RESTRICT,
  delivery_note varchar(120) NOT NULL,
  notes text,
  status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  created_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  posted_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  CONSTRAINT goods_receipts_delivery_note_nonempty CHECK (length(btrim(delivery_note)) > 0),
  CONSTRAINT goods_receipts_posted_consistency CHECK ((status='draft' AND posted_at IS NULL AND posted_by IS NULL) OR (status='posted' AND posted_at IS NOT NULL AND posted_by IS NOT NULL)),
  CONSTRAINT goods_receipts_supplier_delivery_unique UNIQUE (supplier_id, delivery_note)
);
CREATE SEQUENCE IF NOT EXISTS public.f06_receipt_no_seq START 1;
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.goods_receipts(receipt_id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
  expected_packs numeric(18,4) NOT NULL CHECK (expected_packs >= 0),
  received_packs numeric(18,4) NOT NULL CHECK (received_packs >= 0),
  units_per_pack numeric(18,4) NOT NULL CHECK (units_per_pack > 0),
  unit_cost numeric(18,4) CHECK (unit_cost >= 0),
  short_delivery_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goods_receipt_lines_number_unique UNIQUE(receipt_id,line_number),
  CONSTRAINT goods_receipt_lines_product_unique UNIQUE(receipt_id,product_id),
  CONSTRAINT goods_receipt_lines_short_explanation CHECK (received_packs >= expected_packs OR length(btrim(coalesce(short_delivery_note,''))) > 0)
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status_created ON public.goods_receipts(status,created_at DESC,receipt_id DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier_created ON public.goods_receipts(supplier_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_location_created ON public.goods_receipts(location_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_product ON public.goods_receipt_lines(product_id);
-- Keep direct client access closed; authenticated Express backend owns authorization.
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
-- Guard immutable posted documents against direct updates via an application connection.
CREATE OR REPLACE FUNCTION public.f06_reject_posted_grn_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'goods_receipts' THEN
    IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted GRNs cannot be deleted.' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted GRNs cannot be edited.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.goods_receipts gr
      WHERE gr.receipt_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.receipt_id ELSE NEW.receipt_id END
        AND gr.status = 'posted'
    ) THEN
      RAISE EXCEPTION 'Posted GRN lines are read-only.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS f06_posted_receipt_guard ON public.goods_receipts;
CREATE TRIGGER f06_posted_receipt_guard BEFORE UPDATE OR DELETE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.f06_reject_posted_grn_changes();
DROP TRIGGER IF EXISTS f06_posted_line_guard ON public.goods_receipt_lines;
CREATE TRIGGER f06_posted_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.f06_reject_posted_grn_changes();
COMMIT;
