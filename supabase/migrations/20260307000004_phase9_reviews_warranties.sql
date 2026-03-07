-- Phase 9: Reviews & Warranties
-- Adds Google Business fields to tenants and creates the warranties table.

-- ---------------------------------------------------------------------------
-- Tenants: Google Business integration
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS review_link      TEXT;

-- ---------------------------------------------------------------------------
-- Warranties table
-- Tracks parts-level warranty windows per work-order line item.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warranties (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id  TEXT        NOT NULL, -- Prisma CUID from work_orders.id
  client_id      UUID        REFERENCES clients(id) ON DELETE SET NULL,
  part_name      TEXT        NOT NULL,
  part_number    TEXT,
  supplier       TEXT,
  installed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  warranty_months INT        NOT NULL DEFAULT 12,
  expires_at     TIMESTAMPTZ,  -- computed by trigger, NOT a generated column
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger function to auto-compute expires_at on INSERT or UPDATE.
-- TIMESTAMPTZ + INTERVAL is only STABLE (not IMMUTABLE) so a generated column
-- cannot be used; a BEFORE trigger is the standard PostgreSQL workaround.
CREATE OR REPLACE FUNCTION compute_warranty_expires_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.expires_at := NEW.installed_at + (NEW.warranty_months * INTERVAL '1 month');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranties_compute_expires
  BEFORE INSERT OR UPDATE OF installed_at, warranty_months
  ON warranties
  FOR EACH ROW
  EXECUTE FUNCTION compute_warranty_expires_at();

CREATE INDEX IF NOT EXISTS warranties_tenant_id_idx ON warranties(tenant_id);
CREATE INDEX IF NOT EXISTS warranties_work_order_id_idx ON warranties(work_order_id);

-- RLS policies mirror the pattern established in the rls_hardening migration.
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage warranties"
  ON warranties
  FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
