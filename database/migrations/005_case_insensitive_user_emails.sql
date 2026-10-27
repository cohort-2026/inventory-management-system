
-- IMS custom authentication
-- Prevent duplicate email accounts differing only by case.
-- Non-destructive: fails if conflicting data already exists.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_email_lower_unique
ON public.users (lower(email));

COMMIT;
