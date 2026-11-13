-- DISPOSABLE SUPABASE TEST PROJECT ONLY. DO NOT RUN IN PRODUCTION.
-- Verify project name/ref in Supabase UI. One-time, explicit opt-in.
-- This marker authorizes the local Stage 2C scripts to write test records.
-- Remove table when finished with the test environment.
BEGIN;
-- Uncomment the next line ONLY after confirming you selected the disposable project.
-- SELECT set_config('ims.f00_demo_seed', 'ALLOW', true);
DO $$ BEGIN
  IF current_setting('ims.f00_demo_seed', true) IS DISTINCT FROM 'ALLOW' THEN
    RAISE EXCEPTION 'Refusing to install test provisioning marker without explicit disposable-project opt-in';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.f00_demo_environment_guard (
  singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  marker text NOT NULL CHECK (marker = 'F00_STAGE2C_DISPOSABLE_ONLY')
);
INSERT INTO public.f00_demo_environment_guard(singleton, marker)
VALUES(TRUE, 'F00_STAGE2C_DISPOSABLE_ONLY')
ON CONFLICT(singleton) DO NOTHING;
COMMIT;
