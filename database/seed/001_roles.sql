-- F00 deterministic reference seed; safe on a fresh rebuilt database.
-- No user accounts or password hashes are fabricated.
-- Provision demo users through the real auth registration/invite workflow separately.
BEGIN;
INSERT INTO public.roles (name, description) VALUES
  ('Manager', 'Inventory management and oversight'),
  ('Inventory Staff', 'Day-to-day inventory operations'),
  ('Viewer', 'Read-only inventory access')
ON CONFLICT (name) DO NOTHING;
COMMIT;
