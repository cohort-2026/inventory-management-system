
BEGIN;

-- 1. Transfer numbering
CREATE SEQUENCE IF NOT EXISTS public.f09_transfer_no_seq
    START WITH 1
    INCREMENT BY 1;

-- 2. Dedicated transit location
-- Existing locations are preserved.
INSERT INTO public.locations (
    location_id,
    name,
    code,
    description,
    status,
    created_at,
    updated_at
)
VALUES (
    'f0900000-0000-4000-8000-000000000001',
    'Stock in Transit',
    'SYS-TRANSIT',
    'System location for stock dispatched between warehouses',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (code) DO NOTHING;

-- 3. Main transfer records
CREATE TABLE IF NOT EXISTS public.transfers (
    transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    transfer_no text NOT NULL UNIQUE
        DEFAULT (
            'TR-' ||
            LPAD(
                nextval('public.f09_transfer_no_seq')::text,
                5,
                '0'
            )
        ),

    from_location_id uuid NOT NULL
        REFERENCES public.locations(location_id)
        ON DELETE RESTRICT,

    to_location_id uuid NOT NULL
        REFERENCES public.locations(location_id)
        ON DELETE RESTRICT,

    status varchar(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (
            status IN (
                'DRAFT',
                'IN_TRANSIT',
                'RECEIVED',
                'CANCELLED'
            )
        ),

    note text,

    created_by uuid NOT NULL
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    received_by uuid
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    cancelled_by uuid
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    dispatched_at timestamptz,
    received_at timestamptz,
    cancelled_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT transfers_different_locations
        CHECK (from_location_id <> to_location_id)
);

-- 4. Individual products in each transfer
CREATE TABLE IF NOT EXISTS public.transfer_lines (
    transfer_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    transfer_id uuid NOT NULL
        REFERENCES public.transfers(transfer_id)
        ON DELETE RESTRICT,

    product_id uuid NOT NULL
        REFERENCES public.products(product_id)
        ON DELETE RESTRICT,

    quantity_sent numeric NOT NULL
        CHECK (quantity_sent > 0),

    quantity_received numeric
        CHECK (
            quantity_received IS NULL
            OR (
                quantity_received >= 0
                AND quantity_received <= quantity_sent
            )
        ),

    shortage_reason_code_id uuid
        REFERENCES public.reason_codes(reason_code_id)
        ON DELETE RESTRICT,

    shortage_note text,

    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT transfer_lines_product_unique
        UNIQUE (transfer_id, product_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_transfers_status_created
    ON public.transfers(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transfers_from_location
    ON public.transfers(from_location_id);

CREATE INDEX IF NOT EXISTS idx_transfers_to_location
    ON public.transfers(to_location_id);

CREATE INDEX IF NOT EXISTS idx_transfer_lines_transfer
    ON public.transfer_lines(transfer_id);

CREATE INDEX IF NOT EXISTS idx_transfer_lines_product
    ON public.transfer_lines(product_id);

COMMIT;
