-- Inventory Management System - GitHub Issue #2
-- Secondary indexes based on the queries described in the project data model.
-- Prerequisite: 001_initial_schema.sql has completed successfully.
-- Safe to rerun: CREATE INDEX IF NOT EXISTS. Review existing definitions if names already exist.
-- PK and UNIQUE constraints in Issue #1 already create their own indexes.

BEGIN;

-- Product browsing / filtering.
CREATE INDEX IF NOT EXISTS idx_products_name
    ON public.products (name);
CREATE INDEX IF NOT EXISTS idx_products_category_id
    ON public.products (category_id);

-- Profile lookup by role; the user_id PK and email UNIQUE already have indexes.
CREATE INDEX IF NOT EXISTS idx_users_role_id
    ON public.users (role_id);

-- Inventory has UNIQUE(product_id, location_id), which already indexes
-- product-first lookups. Add the reverse access path for location listings.
CREATE INDEX IF NOT EXISTS idx_inventory_location_id
    ON public.inventory (location_id);

-- Movement-history screens: equality-filter on product/location/actor,
-- then fetch recent history in descending time order.
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created_at
    ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_location_created_at
    ON public.stock_movements (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user_created_at
    ON public.stock_movements (user_id, created_at DESC);

-- Global movement feed and transfer-pair correlation.
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at
    ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id
    ON public.stock_movements (reference_id)
    WHERE reference_id IS NOT NULL;

-- Counting sessions can be viewed by location, creator or status.
CREATE INDEX IF NOT EXISTS idx_inventory_counts_location_started_at
    ON public.inventory_counts (location_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_user_id
    ON public.inventory_counts (user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status_started_at
    ON public.inventory_counts (status, started_at DESC);

-- UNIQUE(count_id, product_id) already indexes count_id-first queries.
-- This adds the reverse path for product counting history.
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_product_id
    ON public.inventory_count_items (product_id);

COMMIT;
