-- Inventory Management System - GitHub Issue #1
-- PostgreSQL / Supabase initial application schema
-- Run once on a new Supabase project. Keep in source control.
-- Issue #2 will add workload-specific performance indexes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Application roles
CREATE TABLE public.roles (
    role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roles_name_nonempty CHECK (length(btrim(name)) > 0)
);

INSERT INTO public.roles (name, description) VALUES
    ('Manager', 'Inventory management and oversight'),
    ('Inventory Staff', 'Day-to-day inventory operations'),
    ('Viewer', 'Read-only inventory access');

-- 2. Application profiles (Supabase Auth owns credentials)
CREATE TABLE public.users (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES public.roles(role_id) ON DELETE RESTRICT,
    first_name varchar,
    last_name varchar,
    email varchar NOT NULL UNIQUE,
    status varchar NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT users_email_nonempty CHECK (length(btrim(email)) > 0)
);

-- 3. Categories
CREATE TABLE public.categories (
    category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL UNIQUE,
    description text,
    status varchar NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_name_nonempty CHECK (length(btrim(name)) > 0),
    CONSTRAINT categories_status_check CHECK (status IN ('active', 'inactive'))
);

-- 4. Products
CREATE TABLE public.products (
    product_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES public.categories(category_id) ON DELETE RESTRICT,
    name varchar NOT NULL,
    sku varchar NOT NULL UNIQUE,
    description text,
    unit_of_measure varchar NOT NULL DEFAULT 'each',
    reorder_level numeric NOT NULL DEFAULT 0,
    status varchar NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_name_nonempty CHECK (length(btrim(name)) > 0),
    CONSTRAINT products_sku_nonempty CHECK (length(btrim(sku)) > 0),
    CONSTRAINT products_unit_nonempty CHECK (length(btrim(unit_of_measure)) > 0),
    CONSTRAINT products_reorder_level_nonnegative CHECK (reorder_level >= 0),
    CONSTRAINT products_status_check CHECK (status IN ('active', 'archived'))
);

-- 5. Storage locations
CREATE TABLE public.locations (
    location_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    code varchar NOT NULL UNIQUE,
    description text,
    address text,
    status varchar NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT locations_name_nonempty CHECK (length(btrim(name)) > 0),
    CONSTRAINT locations_code_nonempty CHECK (length(btrim(code)) > 0),
    CONSTRAINT locations_status_check CHECK (status IN ('active', 'inactive'))
);

-- 6. Current quantity, once per product/location combination
CREATE TABLE public.inventory (
    inventory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
    location_id uuid NOT NULL REFERENCES public.locations(location_id) ON DELETE RESTRICT,
    quantity numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_quantity_nonnegative CHECK (quantity >= 0),
    CONSTRAINT inventory_product_location_unique UNIQUE (product_id, location_id)
);

-- 7. Audit trail of stock-changing operations
CREATE TABLE public.stock_movements (
    movement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
    location_id uuid NOT NULL REFERENCES public.locations(location_id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    movement_type varchar NOT NULL,
    quantity_change numeric NOT NULL,
    quantity_before numeric NOT NULL,
    quantity_after numeric NOT NULL,
    reference_id uuid,
    reason varchar,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_type_check CHECK (
        movement_type IN ('ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'COUNT')
    ),
    CONSTRAINT stock_movements_before_nonnegative CHECK (quantity_before >= 0),
    CONSTRAINT stock_movements_after_nonnegative CHECK (quantity_after >= 0),
    CONSTRAINT stock_movements_nonzero_change CHECK (quantity_change <> 0),
    CONSTRAINT stock_movements_arithmetic_check CHECK (
        quantity_after = quantity_before + quantity_change
    ),
    CONSTRAINT stock_movements_transfer_direction_check CHECK (
        (movement_type = 'TRANSFER_OUT' AND quantity_change < 0)
        OR (movement_type = 'TRANSFER_IN' AND quantity_change > 0)
        OR (movement_type IN ('ADJUSTMENT', 'COUNT'))
    )
);

-- 8. Physical counting sessions
CREATE TABLE public.inventory_counts (
    count_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id uuid NOT NULL REFERENCES public.locations(location_id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    status varchar NOT NULL DEFAULT 'draft',
    notes text,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT inventory_counts_status_check CHECK (
        status IN ('draft', 'in_progress', 'completed')
    ),
    CONSTRAINT inventory_counts_time_check CHECK (
        completed_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT inventory_counts_completed_time_check CHECK (
        status <> 'completed' OR completed_at IS NOT NULL
    )
);

-- 9. Individual observations within a count
CREATE TABLE public.inventory_count_items (
    count_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    count_id uuid NOT NULL REFERENCES public.inventory_counts(count_id) ON DELETE RESTRICT,
    product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
    recorded_quantity numeric NOT NULL,
    counted_quantity numeric,
    difference numeric,
    status varchar NOT NULL DEFAULT 'pending',
    notes text,
    CONSTRAINT inventory_count_items_unique_product UNIQUE (count_id, product_id),
    CONSTRAINT inventory_count_items_recorded_nonnegative CHECK (recorded_quantity >= 0),
    CONSTRAINT inventory_count_items_counted_nonnegative CHECK (
        counted_quantity IS NULL OR counted_quantity >= 0
    ),
    CONSTRAINT inventory_count_items_status_check CHECK (
        status IN ('pending', 'counted', 'reconciled')
    ),
    CONSTRAINT inventory_count_items_difference_check CHECK (
        (counted_quantity IS NULL AND difference IS NULL)
        OR (counted_quantity IS NOT NULL AND difference = counted_quantity - recorded_quantity)
    ),
    CONSTRAINT inventory_count_items_status_quantity_check CHECK (
        status = 'pending' OR counted_quantity IS NOT NULL
    )
);

-- Keep update timestamps accurate for direct database writes.
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER locations_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER inventory_updated_at
BEFORE UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Provision a restricted application profile on successful Auth user creation.
-- Never trust the user's metadata for role selection.
CREATE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    viewer_role_id uuid;
BEGIN
    SELECT role_id INTO viewer_role_id
    FROM public.roles
    WHERE name = 'Viewer';

    IF viewer_role_id IS NULL THEN
        RAISE EXCEPTION 'Required Viewer role is missing';
    END IF;

    INSERT INTO public.users (user_id, role_id, first_name, last_name, email)
    VALUES (
        NEW.id,
        viewer_role_id,
        NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_ims
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Keep the public profile email consistent with Supabase Auth changes.
CREATE FUNCTION public.sync_auth_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        UPDATE public.users SET email = NEW.email WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_updated_ims
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_email();

-- Trigger helpers must not be directly executable via exposed API roles.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_auth_user_email() FROM PUBLIC, anon, authenticated;

-- Supabase public schema is API-exposed: default deny until access design is agreed.
-- Service-role backend accesses bypass RLS; do not expose that key to browsers.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

COMMIT;
