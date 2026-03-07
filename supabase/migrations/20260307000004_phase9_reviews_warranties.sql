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
  expires_at     TIMESTAMPTZ GENERATED ALWAYS AS
                   (installed_at + (warranty_months || ' months')::INTERVAL) STORED,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS warranties_tenant_id_idx ON warranties(tenant_id);
CREATE INDEX IF NOT EXISTS warranties_work_order_id_idx ON warranties(work_order_id);

-- RLS policies mirror the pattern established in the rls_hardening migration.
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage warranties"
  ON warranties
  FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
