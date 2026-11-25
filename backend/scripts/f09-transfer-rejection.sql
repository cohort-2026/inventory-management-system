
BEGIN;

-- Replace the original status constraint to support rejected transfers.
ALTER TABLE public.transfers
    DROP CONSTRAINT IF EXISTS transfers_status_check;

ALTER TABLE public.transfers
    ADD CONSTRAINT transfers_status_check
    CHECK (
        status IN (
            'DRAFT',
            'IN_TRANSIT',
            'RECEIVED',
            'CANCELLED',
            'REJECTED'
        )
    );

-- Store who rejected the transfer and why.
ALTER TABLE public.transfers
    ADD COLUMN IF NOT EXISTS rejected_by uuid
        REFERENCES public.users(user_id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason varchar(500),
    ADD COLUMN IF NOT EXISTS rejection_note text;

CREATE INDEX IF NOT EXISTS idx_transfers_rejected_at
    ON public.transfers(rejected_at DESC)
    WHERE status = 'REJECTED';

COMMIT;
