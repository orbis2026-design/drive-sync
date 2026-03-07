-- =============================================================================
-- Migration: Phase 17 — Go-To-Market & Zero-Touch Onboarding
-- Issues #63-#66
--
-- Adds:
--   • mechanic_settings table  — per-user labor rate + tax preferences
--   • tenants.logo_url         — shop logo stored in Cloudflare R2
--   • tenants.onboarding_complete — flag flipped after wizard finishes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. mechanic_settings — per-mechanic billing preferences
--    Keyed by Supabase auth user_id so each mechanic on a Multi-Van plan
--    can independently configure their default hourly rate and local tax.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechanic_settings (
  id                BIGSERIAL     PRIMARY KEY,
  user_id           UUID          NOT NULL UNIQUE
                      REFERENCES auth.users (id) ON DELETE CASCADE,
  labor_rate_cents  INTEGER       NOT NULL DEFAULT 12000,  -- $120/hr
  parts_tax_rate    NUMERIC(6, 4) NOT NULL DEFAULT 0.0875, -- 8.75%
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast single-user lookups (used by onboarding + quote actions).
CREATE INDEX IF NOT EXISTS mechanic_settings_user_id_idx
  ON mechanic_settings (user_id);

-- ---------------------------------------------------------------------------
-- 2. tenants — onboarding supplement columns
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security on mechanic_settings
--    Each mechanic can only read/write their own row.
-- ---------------------------------------------------------------------------
ALTER TABLE mechanic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mechanic_settings_self ON mechanic_settings;
CREATE POLICY mechanic_settings_self
  ON mechanic_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service-role bypasses RLS by default; no additional admin policy needed.
