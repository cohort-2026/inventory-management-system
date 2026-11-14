-- TEST DATABASE ONLY: Demo catalog. Never run in a production Supabase project.
-- Explicit opt-in: in the SQL Editor uncomment the set_config line below,
-- review the connected project name, then run this entire script at once.
BEGIN;
-- SELECT set_config('ims.f00_demo_seed', 'ALLOW', true);
DO $$ BEGIN IF current_setting('ims.f00_demo_seed', true) IS DISTINCT FROM 'ALLOW' THEN RAISE EXCEPTION 'Demo seed disabled. Read the instructions and explicitly opt in on a disposable database.'; END IF; END $$;

-- Existing catalogue records are never overwritten. Repeating the seed is safe.
INSERT INTO public.categories (name, description, status) VALUES
  ('Fruit & Vegetables', 'Fresh produce', 'active'),
  ('Groceries', 'Dry groceries and pantry goods', 'active'),
  ('Dairy', 'Milk and chilled dairy', 'active'),
  ('Bakery', 'Bread and baked goods', 'active'),
  ('Household', 'Cleaning and household products', 'active'),
  ('Beverages', 'Drinks', 'active'),
  ('Eggs', 'Egg products', 'active')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.locations (name, code, description, status) VALUES
  ('Soweto Warehouse', 'WH-SOW', 'Warehouse and central dispatch', 'active'),
  ('Soweto Shop', 'SHP-SOW', 'Retail shop', 'active'),
  ('Midrand Shop', 'SHP-MID', 'Retail shop', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.products (category_id, name, sku, unit_of_measure, reorder_level, status)
SELECT c.category_id, v.name, v.sku, v.unit_of_measure, v.reorder_level, 'active'
FROM (VALUES
  ('FRU-BAN-BCH', 'Bananas (bunch)', 'Fruit & Vegetables', 'each', 30::numeric),
  ('FRU-APL-1K5', 'Apples Golden Delicious 1.5kg', 'Fruit & Vegetables', 'pack', 10::numeric),
  ('VEG-POT-07', 'Potatoes 7kg pocket', 'Fruit & Vegetables', 'bag', 8::numeric),
  ('VEG-TOM-1K', 'Tomatoes 1kg', 'Fruit & Vegetables', 'kg', 10::numeric),
  ('DRY-ACE-10', 'Ace Super Maize Meal 10kg', 'Groceries', 'bag', 20::numeric),
  ('CAN-KOO-410', 'Koo Baked Beans 410g', 'Groceries', 'each', 24::numeric),
  ('DRY-TAS-2K', 'Tastic Rice 2kg', 'Groceries', 'bag', 15::numeric),
  ('DAI-CLV-2L', 'Clover Fresh Milk 2L', 'Dairy', 'each', 18::numeric),
  ('BAK-ALB-700', 'Albany Superior White 700g', 'Bakery', 'each', 20::numeric),
  ('HHD-SUN-750', 'Sunlight Dishwashing Liquid 750ml', 'Household', 'each', 12::numeric),
  ('BEV-COK-2L', 'Coca-Cola 2L', 'Beverages', 'each', 24::numeric),
  ('EGG-NUL-18', 'Nulaid Large Eggs 18', 'Eggs', 'pack', 12::numeric),
  ('FRU-ORG-1K', 'Oranges 1kg', 'Fruit & Vegetables', 'kg', 15::numeric),
  ('DAI-YOG-500', 'Plain Yoghurt 500g', 'Dairy', 'each', 12::numeric),
  ('HHD-SOP-1K', 'Washing Powder 1kg', 'Household', 'bag', 10::numeric)
) AS v(sku, name, category_name, unit_of_measure, reorder_level)
JOIN public.categories c ON c.name = v.category_name
ON CONFLICT (sku) DO NOTHING;

COMMIT;
