-- =============================================================================
-- Migration: 20260307000003_phase8_billing_qbo.sql
-- Phase 8 — SaaS Billing (Stripe) + QuickBooks Online Integration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- subscription_status enum (Issue #29: Stripe Billing)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'subscription_status'
  ) THEN
    CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Stripe columns on tenants (Issue #29)
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status  subscription_status NOT NULL DEFAULT 'ACTIVE';

-- ---------------------------------------------------------------------------
-- QuickBooks Online OAuth columns on tenants (Issue #32)
-- Tokens are short-lived and should be rotated via the QBO refresh flow.
-- In production, consider storing these in a Supabase Vault secret instead.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS qbo_realm_id       TEXT,
  ADD COLUMN IF NOT EXISTS qbo_access_token   TEXT,
  ADD COLUMN IF NOT EXISTS qbo_refresh_token  TEXT;

-- ---------------------------------------------------------------------------
-- Index: fast look-up by Stripe customer ID (for webhook handler)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
