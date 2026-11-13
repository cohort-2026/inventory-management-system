-- F00: CURRENT-STATE BASELINE (13 November 2026 Supabase public-schema catalog export)
-- FOR NEW EMPTY DATABASE ONLY. NEVER EXECUTE AGAINST THE LIVE PRODUCTION DATABASE.
-- This is a consolidated baseline, NOT an incremental migration on top of 003/004/005.
-- pg_dump was unavailable. Permissions/grants, object ownership, extension schemas,
-- non-public objects, inherited privileges and exact constraint names are not reconstructed.
-- Legacy auth.functions are retained as exported; no auth.users triggers are reconstructed.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public."auth_action_tokens" (
    "action_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "purpose" varchar(32) NOT NULL,
    "token_hash" bytea NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "expires_at" timestamptz NOT NULL,
    "used_at" timestamptz
);

CREATE TABLE public."auth_sessions" (
    "session_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "token_hash" bytea NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "expires_at" timestamptz NOT NULL,
    "last_used_at" timestamptz,
    "revoked_at" timestamptz
);

CREATE TABLE public."categories" (
    "category_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "description" text,
    "status" varchar DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."inventory" (
    "inventory_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "product_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."inventory_count_items" (
    "item_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "count_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "expected_quantity" numeric DEFAULT 0 NOT NULL,
    "counted_quantity" numeric
);

CREATE TABLE public."inventory_counts" (
    "count_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "location_id" uuid NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "note" text,
    "user_id" uuid,
    "completed_by" uuid,
    "completed_at" timestamptz,
    "created_at" timestamptz DEFAULT now()
);

CREATE TABLE public."locations" (
    "location_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "code" varchar NOT NULL,
    "description" text,
    "address" text,
    "status" varchar DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."products" (
    "product_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "category_id" uuid NOT NULL,
    "name" varchar NOT NULL,
    "sku" varchar NOT NULL,
    "description" text,
    "unit_of_measure" varchar DEFAULT 'each'::character varying NOT NULL,
    "reorder_level" numeric DEFAULT 0 NOT NULL,
    "status" varchar DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."roles" (
    "role_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_movements" (
    "movement_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "product_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "movement_type" varchar NOT NULL,
    "quantity_change" numeric NOT NULL,
    "quantity_before" numeric NOT NULL,
    "quantity_after" numeric NOT NULL,
    "reference_id" uuid,
    "reason" varchar,
    "notes" text,
    "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."user_credentials" (
    "user_id" uuid NOT NULL,
    "password_hash" text NOT NULL,
    "email_verified_at" timestamptz,
    "password_changed_at" timestamptz DEFAULT now() NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public."users" (
    "user_id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "role_id" uuid NOT NULL,
    "first_name" varchar,
    "last_name" varchar,
    "email" varchar NOT NULL,
    "status" varchar DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Constraints are applied after every referenced table has been created.
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_chk_01" CHECK (((used_at IS NULL) OR (used_at >= created_at)));
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_fk_02" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_chk_03" CHECK ((expires_at > created_at));
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_chk_04" CHECK (((purpose)::text = ANY ((ARRAY['email_verification'::character varying, 'password_reset'::character varying])::text[])));
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_pk_05" PRIMARY KEY (action_id);
ALTER TABLE public."auth_action_tokens" ADD CONSTRAINT "f00_auth_action_tokens_uniq_06" UNIQUE (token_hash);
ALTER TABLE public."auth_sessions" ADD CONSTRAINT "f00_auth_sessions_pk_01" PRIMARY KEY (session_id);
ALTER TABLE public."auth_sessions" ADD CONSTRAINT "f00_auth_sessions_chk_02" CHECK ((expires_at > created_at));
ALTER TABLE public."auth_sessions" ADD CONSTRAINT "f00_auth_sessions_chk_03" CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)));
ALTER TABLE public."auth_sessions" ADD CONSTRAINT "f00_auth_sessions_uniq_04" UNIQUE (token_hash);
ALTER TABLE public."auth_sessions" ADD CONSTRAINT "f00_auth_sessions_fk_05" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE public."categories" ADD CONSTRAINT "f00_categories_chk_01" CHECK ((length(btrim((name)::text)) > 0));
ALTER TABLE public."categories" ADD CONSTRAINT "f00_categories_chk_02" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])));
ALTER TABLE public."categories" ADD CONSTRAINT "f00_categories_pk_03" PRIMARY KEY (category_id);
ALTER TABLE public."categories" ADD CONSTRAINT "f00_categories_uniq_04" UNIQUE (name);
ALTER TABLE public."inventory" ADD CONSTRAINT "f00_inventory_pk_01" PRIMARY KEY (inventory_id);
ALTER TABLE public."inventory" ADD CONSTRAINT "f00_inventory_fk_02" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT;
ALTER TABLE public."inventory" ADD CONSTRAINT "f00_inventory_uniq_03" UNIQUE (product_id, location_id);
ALTER TABLE public."inventory" ADD CONSTRAINT "f00_inventory_chk_04" CHECK ((quantity >= (0)::numeric));
ALTER TABLE public."inventory" ADD CONSTRAINT "f00_inventory_fk_05" FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE RESTRICT;
ALTER TABLE public."inventory_count_items" ADD CONSTRAINT "f00_inventory_count_items_pk_01" PRIMARY KEY (item_id);
ALTER TABLE public."inventory_count_items" ADD CONSTRAINT "f00_inventory_count_items_fk_02" FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE;
ALTER TABLE public."inventory_count_items" ADD CONSTRAINT "f00_inventory_count_items_uniq_03" UNIQUE (count_id, product_id);
ALTER TABLE public."inventory_counts" ADD CONSTRAINT "f00_inventory_counts_pk_01" PRIMARY KEY (count_id);
ALTER TABLE public."inventory_counts" ADD CONSTRAINT "f00_inventory_counts_fk_02" FOREIGN KEY (location_id) REFERENCES locations(location_id);
ALTER TABLE public."locations" ADD CONSTRAINT "f00_locations_chk_01" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])));
ALTER TABLE public."locations" ADD CONSTRAINT "f00_locations_pk_02" PRIMARY KEY (location_id);
ALTER TABLE public."locations" ADD CONSTRAINT "f00_locations_uniq_03" UNIQUE (code);
ALTER TABLE public."locations" ADD CONSTRAINT "f00_locations_chk_04" CHECK ((length(btrim((name)::text)) > 0));
ALTER TABLE public."locations" ADD CONSTRAINT "f00_locations_chk_05" CHECK ((length(btrim((code)::text)) > 0));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_uniq_01" UNIQUE (sku);
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_pk_02" PRIMARY KEY (product_id);
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_chk_03" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_chk_04" CHECK ((reorder_level >= (0)::numeric));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_chk_05" CHECK ((length(btrim((unit_of_measure)::text)) > 0));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_chk_06" CHECK ((length(btrim((sku)::text)) > 0));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_chk_07" CHECK ((length(btrim((name)::text)) > 0));
ALTER TABLE public."products" ADD CONSTRAINT "f00_products_fk_08" FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT;
ALTER TABLE public."roles" ADD CONSTRAINT "f00_roles_chk_01" CHECK ((length(btrim((name)::text)) > 0));
ALTER TABLE public."roles" ADD CONSTRAINT "f00_roles_pk_02" PRIMARY KEY (role_id);
ALTER TABLE public."roles" ADD CONSTRAINT "f00_roles_uniq_03" UNIQUE (name);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_01" CHECK (((((movement_type)::text = 'TRANSFER_OUT'::text) AND (quantity_change < (0)::numeric)) OR (((movement_type)::text = 'TRANSFER_IN'::text) AND (quantity_change > (0)::numeric)) OR ((movement_type)::text = ANY ((ARRAY['ADJUSTMENT'::character varying, 'COUNT'::character varying])::text[]))));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_02" CHECK (((movement_type)::text = ANY ((ARRAY['ADJUSTMENT'::character varying, 'TRANSFER_IN'::character varying, 'TRANSFER_OUT'::character varying, 'COUNT'::character varying])::text[])));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_03" CHECK ((quantity_before >= (0)::numeric));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_04" CHECK ((quantity_after >= (0)::numeric));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_05" CHECK ((quantity_change <> (0)::numeric));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_chk_06" CHECK ((quantity_after = (quantity_before + quantity_change)));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_pk_07" PRIMARY KEY (movement_id);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_fk_08" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_fk_09" FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE RESTRICT;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "f00_stock_movements_fk_10" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE public."user_credentials" ADD CONSTRAINT "f00_user_credentials_fk_01" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE public."user_credentials" ADD CONSTRAINT "f00_user_credentials_pk_02" PRIMARY KEY (user_id);
ALTER TABLE public."user_credentials" ADD CONSTRAINT "f00_user_credentials_chk_03" CHECK ((length(btrim(password_hash)) > 0));
ALTER TABLE public."users" ADD CONSTRAINT "f00_users_fk_01" FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT;
ALTER TABLE public."users" ADD CONSTRAINT "f00_users_uniq_02" UNIQUE (email);
ALTER TABLE public."users" ADD CONSTRAINT "f00_users_pk_03" PRIMARY KEY (user_id);
ALTER TABLE public."users" ADD CONSTRAINT "f00_users_chk_04" CHECK ((length(btrim((email)::text)) > 0));
ALTER TABLE public."users" ADD CONSTRAINT "f00_users_chk_05" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])));

-- Additional (non-constraint) indexes from the catalog.
CREATE INDEX idx_auth_action_tokens_expires ON public.auth_action_tokens USING btree (expires_at);
CREATE INDEX idx_auth_action_tokens_user_purpose ON public.auth_action_tokens USING btree (user_id, purpose);
CREATE INDEX idx_auth_sessions_expires ON public.auth_sessions USING btree (expires_at);
CREATE INDEX idx_auth_sessions_user ON public.auth_sessions USING btree (user_id);
CREATE INDEX idx_inventory_location_id ON public.inventory USING btree (location_id);
CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);
CREATE INDEX idx_products_name ON public.products USING btree (name);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements USING btree (created_at DESC);
CREATE INDEX idx_stock_movements_location_created_at ON public.stock_movements USING btree (location_id, created_at DESC);
CREATE INDEX idx_stock_movements_product_created_at ON public.stock_movements USING btree (product_id, created_at DESC);
CREATE INDEX idx_stock_movements_reference_id ON public.stock_movements USING btree (reference_id) WHERE (reference_id IS NOT NULL);
CREATE INDEX idx_stock_movements_user_created_at ON public.stock_movements USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX idx_users_email_lower_unique ON public.users USING btree (lower((email)::text));
CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);

-- Retain the exported public-schema functions (includes unused legacy auth helpers).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        UPDATE public.users SET email = NEW.email WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;


-- Recreate triggers on public tables.
CREATE TRIGGER "categories_updated_at" BEFORE UPDATE ON public."categories" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER "inventory_updated_at" BEFORE UPDATE ON public."inventory" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER "locations_updated_at" BEFORE UPDATE ON public."locations" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER "products_updated_at" BEFORE UPDATE ON public."products" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER "user_credentials_updated_at" BEFORE UPDATE ON public."user_credentials" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER "users_updated_at" BEFORE UPDATE ON public."users" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS flags exported from pg_class; no public policies returned.
ALTER TABLE public.auth_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Baseline revokes explicit access to credential/session/token tables.
-- Full grants and privilege parity must be verified separately.
REVOKE ALL ON public.user_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.auth_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.auth_action_tokens FROM PUBLIC, anon, authenticated;

COMMIT;
