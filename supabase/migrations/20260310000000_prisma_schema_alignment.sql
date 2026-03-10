-- =============================================================================
-- DriveSync — Prisma Schema Alignment Migration
-- Adds columns required to match the Prisma schema to the actual Supabase DB.
-- Safe to run multiple times (all statements use ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tenant_vehicles: add denormalised vehicle info columns
-- These are copied from global_vehicles at vehicle-creation time so that
-- Prisma queries can select make/model/year without an extra JOIN.
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_vehicles
  ADD COLUMN IF NOT EXISTS make      text,
  ADD COLUMN IF NOT EXISTS model     text,
  ADD COLUMN IF NOT EXISTS year      smallint,
  ADD COLUMN IF NOT EXISTS oil_type  text,
  ADD COLUMN IF NOT EXISTS tire_size text;

-- ---------------------------------------------------------------------------
-- clients: add SMS opt-out flag (Phase 33 retention engine)
-- ---------------------------------------------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opted_out_sms boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- tenants: add extra columns used by Prisma models
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS owner_phone            text,
  ADD COLUMN IF NOT EXISTS shop_zip_code          text,
  ADD COLUMN IF NOT EXISTS parts_tax_rate         numeric(6,4) NOT NULL DEFAULT 0.085,
  ADD COLUMN IF NOT EXISTS labor_tax_rate         numeric(6,4) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS auto_retention_enabled boolean NOT NULL DEFAULT true;
