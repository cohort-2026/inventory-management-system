
-- F01: Seed reason codes.
-- Safe to execute more than once.
-- Does not overwrite existing reason-code configuration.

BEGIN;

INSERT INTO public.reason_codes (
    movement_type,
    code,
    label,
    requires_note
)
VALUES
    ('WRITE_OFF', 'SPOILED_EXPIRED', 'Spoiled/expired', true),
    ('WRITE_OFF', 'DAMAGED', 'Damaged', true),
    ('WRITE_OFF', 'THEFT_LOSS', 'Theft/loss', true),
    ('WRITE_OFF', 'INTERNAL_USE', 'Internal use', true),
    ('WRITE_OFF', 'DONATION', 'Donation', true),

    ('ADJUSTMENT', 'DATA_ENTRY_CORRECTION', 'Data-entry correction', true),
    ('ADJUSTMENT', 'FOUND_STOCK', 'Found stock', true),
    ('ADJUSTMENT', 'WRONG_PRODUCT_CAPTURED', 'Wrong product captured', true),

    ('CUSTOMER_RETURN', 'RESTOCK', 'Restock', false),
    ('CUSTOMER_RETURN', 'TO_QUARANTINE', 'To quarantine', false),

    ('SALE', 'TILL_SALE', 'Till sale', false),
    ('SALE', 'ACCOUNT_SALE', 'Account sale', false)

ON CONFLICT (movement_type, code) DO NOTHING;

COMMIT;
