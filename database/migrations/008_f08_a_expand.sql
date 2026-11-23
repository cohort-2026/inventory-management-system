-- F08-A / EXPAND: additive, transactional, no stock modifications.
-- Run once against a backed-up TEST database. Does not change legacy statuses.
BEGIN;

-- Preserve the provenance of pre-F08 completed records. Do not claim manager approval.
ALTER TABLE public.inventory_counts
    ADD COLUMN count_no text,
    ADD COLUMN legacy_completed boolean NOT NULL DEFAULT false,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN submitted_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN posted_at timestamptz,
    ADD COLUMN posted_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN cancelled_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN recount_requested_at timestamptz,
    ADD COLUMN recount_requested_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN recount_note text,
    ADD COLUMN recount_round integer NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_counts
    ADD CONSTRAINT inventory_counts_f08_recount_round_nonnegative
        CHECK (recount_round >= 0),
    ADD CONSTRAINT inventory_counts_f08_recount_note_length
        CHECK (recount_note IS NULL OR length(recount_note) <= 2000);

-- Sequence names are fixed and deliberately separate from GRN/movement numbering.
CREATE SEQUENCE public.f08_count_no_seq AS bigint START WITH 1 INCREMENT BY 1;

ALTER TABLE public.inventory_counts
    ALTER COLUMN count_no SET DEFAULT
        ('CNT-' || lpad(nextval('public.f08_count_no_seq')::text, 6, '0'));

-- Assign stable references to existing test counts without changing their state.
UPDATE public.inventory_counts
SET count_no = 'CNT-' || lpad(nextval('public.f08_count_no_seq')::text, 6, '0')
WHERE count_no IS NULL;

ALTER TABLE public.inventory_counts
    ALTER COLUMN count_no SET NOT NULL,
    ADD CONSTRAINT inventory_counts_f08_count_no_unique UNIQUE (count_no);

UPDATE public.inventory_counts
SET legacy_completed = true
WHERE status = 'completed';

-- Keep existing open/completed values valid until the coordinated API cutover.
-- New F08 states are enabled in the schema, but not activated by this migration.
ALTER TABLE public.inventory_counts
    ADD CONSTRAINT inventory_counts_f08_status_check
        CHECK (status IN (
            'open', 'completed',
            'DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'POSTED', 'CANCELLED'
        ));

ALTER TABLE public.inventory_count_items
    ADD COLUMN counted_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN counted_at timestamptz,
    ADD COLUMN reason_code_id uuid REFERENCES public.reason_codes(reason_code_id) ON DELETE RESTRICT,
    ADD COLUMN reason_note text,
    ADD COLUMN recount_required boolean NOT NULL DEFAULT false,
    ADD COLUMN recount_completed_at timestamptz,
    ADD COLUMN recount_round integer NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_f08_reason_note_length
        CHECK (reason_note IS NULL OR length(reason_note) <= 2000),
    ADD CONSTRAINT inventory_count_items_f08_recount_round_nonnegative
        CHECK (recount_round >= 0);

CREATE INDEX inventory_counts_f08_status_created_idx
    ON public.inventory_counts (status, created_at DESC);
CREATE INDEX inventory_count_items_f08_reason_idx
    ON public.inventory_count_items (reason_code_id)
    WHERE reason_code_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_counts.legacy_completed IS
    'True for a completed pre-F08 record; does not indicate Manager-reviewed approval.';
COMMENT ON COLUMN public.inventory_count_items.reason_code_id IS
    'Manager-selected COUNT_VARIANCE reason, verified by F08 posting backend.';

-- Seed proposed per-line discrepancy reasons, preserving existing reason codes.
-- If existing (movement_type, code) pairs exist, leave them unchanged.
INSERT INTO public.reason_codes (movement_type, code, label, requires_note, active)
SELECT v.movement_type, v.code, v.label, v.requires_note, true
FROM (VALUES
    ('COUNT_VARIANCE', 'PHYSICAL_SHORTAGE', 'Physical stock shortage', false),
    ('COUNT_VARIANCE', 'PHYSICAL_SURPLUS', 'Physical stock surplus', false),
    ('COUNT_VARIANCE', 'DAMAGED_STOCK', 'Damaged stock', false),
    ('COUNT_VARIANCE', 'RECORDING_ERROR', 'Inventory recording error', false),
    ('COUNT_VARIANCE', 'UNACCOUNTED_MOVEMENT', 'Unrecorded stock movement', false),
    ('COUNT_VARIANCE', 'OTHER', 'Other discrepancy', true)
) AS v(movement_type, code, label, requires_note)
WHERE NOT EXISTS (
    SELECT 1 FROM public.reason_codes r
    WHERE r.movement_type = v.movement_type AND r.code = v.code
);

COMMIT;
