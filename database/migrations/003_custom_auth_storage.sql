
-- Inventory Management System
-- Phase 1: Custom authentication storage
--
-- This migration is additive.
-- It does not remove Supabase Auth or existing users.
-- Run once after 001_initial_schema.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Password credentials
CREATE TABLE public.user_credentials (
    user_id uuid PRIMARY KEY
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    password_hash text NOT NULL,

    email_verified_at timestamptz,

    password_changed_at timestamptz
        NOT NULL DEFAULT now(),

    created_at timestamptz
        NOT NULL DEFAULT now(),

    updated_at timestamptz
        NOT NULL DEFAULT now(),

    CONSTRAINT credentials_password_hash_nonempty
        CHECK (length(btrim(password_hash)) > 0)
);

-- Reuse existing updated_at trigger function
CREATE TRIGGER user_credentials_updated_at
BEFORE UPDATE ON public.user_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- 2. Revocable authentication sessions
CREATE TABLE public.auth_sessions (
    session_id uuid PRIMARY KEY
        DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    -- SHA-256 digest of a random session token
    token_hash bytea NOT NULL UNIQUE,

    created_at timestamptz
        NOT NULL DEFAULT now(),

    expires_at timestamptz NOT NULL,

    last_used_at timestamptz,

    revoked_at timestamptz,

    CONSTRAINT auth_sessions_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT auth_sessions_revocation_check
        CHECK (
            revoked_at IS NULL
            OR revoked_at >= created_at
        )
);


-- 3. Email verification and password recovery
CREATE TABLE public.auth_action_tokens (
    action_id uuid PRIMARY KEY
        DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES public.users(user_id)
        ON DELETE RESTRICT,

    purpose varchar(32) NOT NULL,

    -- SHA-256 digest of a random one-time token
    token_hash bytea NOT NULL UNIQUE,

    created_at timestamptz
        NOT NULL DEFAULT now(),

    expires_at timestamptz NOT NULL,

    used_at timestamptz,

    CONSTRAINT auth_action_purpose_check
        CHECK (
            purpose IN (
                'email_verification',
                'password_reset'
            )
        ),

    CONSTRAINT auth_action_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT auth_action_used_check
        CHECK (
            used_at IS NULL
            OR used_at >= created_at
        )
);


-- 4. Performance indexes
CREATE INDEX idx_auth_sessions_user
ON public.auth_sessions(user_id);

CREATE INDEX idx_auth_sessions_expires
ON public.auth_sessions(expires_at);

CREATE INDEX idx_auth_action_tokens_user_purpose
ON public.auth_action_tokens(user_id, purpose);

CREATE INDEX idx_auth_action_tokens_expires
ON public.auth_action_tokens(expires_at);


-- 5. Restrict exposed API access
ALTER TABLE public.user_credentials
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_sessions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_action_tokens
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_credentials
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.auth_sessions
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.auth_action_tokens
FROM PUBLIC, anon, authenticated;

COMMIT;
