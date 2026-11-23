
CREATE TABLE IF NOT EXISTS public.reorder_rules (
    reorder_rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL
        REFERENCES public.products(product_id),

    location_id UUID NOT NULL
        REFERENCES public.locations(location_id),

    min_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
    max_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_reorder_rules_product_location
        UNIQUE (product_id, location_id),

    CONSTRAINT chk_reorder_rules_min_quantity
        CHECK (min_quantity >= 0),

    CONSTRAINT chk_reorder_rules_max_quantity
        CHECK (max_quantity >= 0),

    CONSTRAINT chk_reorder_rules_min_max
        CHECK (min_quantity <= max_quantity)
);

CREATE INDEX IF NOT EXISTS idx_reorder_rules_location
    ON public.reorder_rules(location_id);

CREATE INDEX IF NOT EXISTS idx_reorder_rules_product
    ON public.reorder_rules(product_id);

ALTER TABLE public.reorder_rules ENABLE ROW LEVEL SECURITY;
