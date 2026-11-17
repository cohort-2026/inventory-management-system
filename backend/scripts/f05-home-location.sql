BEGIN;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS home_location_id uuid
REFERENCES public.locations(location_id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_home_location_id
ON public.users(home_location_id);

UPDATE public.users
SET home_location_id = 'c7b79ad6-4556-4498-b73e-3bbd515df57f'
WHERE user_id = '40ae378d-7742-48c5-a7d1-c97a85463bf0'
  AND role_id = (
      SELECT role_id
      FROM public.roles
      WHERE name = 'Inventory Staff'
  )
  AND status = 'active';

COMMIT;