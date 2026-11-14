
-- F01: Typed stock movements and reason codes
-- Incremental migration for the existing IMS database.
--
-- Preserves historical stock movements and inventory quantities.
-- Do not run the F00 baseline against the live database.

BEGIN;

-- 1. Create the reason-code reference table.
CREATE TABLE public.reason_codes (
    reason_code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type varchar NOT NULL,
    code varchar(60) NOT NULL,
    label varchar(120) NOT NULL,
    requires_note boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,

    CONSTRAINT reason_codes_type_check
        CHECK (
            movement_type IN (
                'RECEIPT',
                'SALE',
                'CUSTOMER_RETURN',
                'WRITE_OFF',
                'ADJUSTMENT',
                'TRANSFER_OUT',
                'TRANSFER_IN',
                'COUNT_VARIANCE'
            )
        ),

    CONSTRAINT reason_codes_code_nonempty
        CHECK (length(btrim(code)) > 0),

    CONSTRAINT reason_codes_label_nonempty
        CHECK (length(btrim(label)) > 0),

    CONSTRAINT reason_codes_type_code_unique
        UNIQUE (movement_type, code),

    CONSTRAINT reason_codes_type_id_unique
        UNIQUE (movement_type, reason_code_id)
);

-- 2. Add F01 fields. Keep reason_code_id nullable so
-- existing historical movements remain valid.
ALTER TABLE public.stock_movements
    ADD COLUMN movement_no text,
    ADD COLUMN reason_code_id uuid,
    ADD COLUMN reference_no varchar(60),
    ADD COLUMN reverses_movement_id uuid;

-- 3. Assign unique movement numbers to historical records.
-- Ordering is deterministic, including when timestamps match.
WITH numbered_movements AS (
    SELECT
        movement_id,
        ROW_NUMBER() OVER (
            ORDER BY created_at, movement_id
        ) AS row_number
    FROM public.stock_movements
)
UPDATE public.stock_movements AS sm
SET movement_no =
    'MV-' || LPAD(numbered_movements.row_number::text, 5, '0')
FROM numbered_movements
WHERE sm.movement_id = numbered_movements.movement_id;


-- 4. Create the sequence for future movement numbers.
CREATE SEQUENCE public.stock_movement_no_seq;

-- Start after the highest number assigned to historical records.
SELECT setval(
    'public.stock_movement_no_seq',
    COALESCE(
        MAX(SUBSTRING(movement_no FROM 4)::bigint),
        1
    ),
    COUNT(*) > 0
)
FROM public.stock_movements;

-- Generate movement numbers safely, including after 99,999.
CREATE OR REPLACE FUNCTION public.generate_stock_movement_no()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    next_number bigint;
BEGIN
    next_number :=
        nextval('public.stock_movement_no_seq'::regclass);

    RETURN 'MV-' || LPAD(
        next_number::text,
        GREATEST(5, LENGTH(next_number::text)),
        '0'
    );
END;
$$;

-- Automatically generate a number when a new movement is inserted.
ALTER TABLE public.stock_movements
    ALTER COLUMN movement_no SET NOT NULL,
    ALTER COLUMN movement_no
        SET DEFAULT public.generate_stock_movement_no();

-- 5. Preserve the existing COUNT records while adopting
-- the F01 COUNT_VARIANCE terminology.
ALTER TABLE public.stock_movements
    DROP CONSTRAINT stock_movements_type_check,
    DROP CONSTRAINT stock_movements_transfer_direction_check;

UPDATE public.stock_movements
SET movement_type = 'COUNT_VARIANCE'
WHERE movement_type = 'COUNT';

-- 6. Apply the expanded movement-type constraint.
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_type_check
    CHECK (
        movement_type IN (
            'RECEIPT',
            'SALE',
            'CUSTOMER_RETURN',
            'WRITE_OFF',
            'ADJUSTMENT',
            'TRANSFER_OUT',
            'TRANSFER_IN',
            'COUNT_VARIANCE'
        )
    );

-- 7. Enforce the sign appropriate to each movement type.
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_transfer_direction_check
    CHECK (
        (movement_type = 'RECEIPT' AND quantity_change > 0)
        OR (movement_type = 'SALE' AND quantity_change < 0)
        OR (movement_type = 'CUSTOMER_RETURN' AND quantity_change > 0)
        OR (movement_type = 'WRITE_OFF' AND quantity_change < 0)
        OR (movement_type = 'ADJUSTMENT')
        OR (movement_type = 'TRANSFER_OUT' AND quantity_change < 0)
        OR (movement_type = 'TRANSFER_IN' AND quantity_change > 0)
        OR (movement_type = 'COUNT_VARIANCE')
    );

-- 8. Link movements to reason codes.
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_reason_code_type_fkey
    FOREIGN KEY (movement_type, reason_code_id)
    REFERENCES public.reason_codes (movement_type, reason_code_id)
    ON DELETE RESTRICT;

-- 9. Link reversal movements to their original movements.
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_reversal_fkey
    FOREIGN KEY (reverses_movement_id)
    REFERENCES public.stock_movements (movement_id)
    ON DELETE RESTRICT;

ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_no_self_reversal
    CHECK (
        reverses_movement_id IS NULL
        OR reverses_movement_id <> movement_id
    );

-- A movement can only be reversed once.
CREATE UNIQUE INDEX idx_stock_movements_reversal_unique
    ON public.stock_movements (reverses_movement_id)
    WHERE reverses_movement_id IS NOT NULL;

-- 10. Enforce unique movement numbers and useful lookup indexes.
CREATE UNIQUE INDEX idx_stock_movements_movement_no_unique
    ON public.stock_movements (movement_no);

CREATE INDEX idx_reason_codes_movement_type_active
    ON public.reason_codes (movement_type, active);

COMMIT;
