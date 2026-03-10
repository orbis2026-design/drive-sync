-- =============================================================================
-- Phase XX: Inventory v2 — Parts, Stock, POs & Packages
-- =============================================================================
-- Introduces normalized inventory tables:
--   parts, inventory_locations, stock_levels, inventory_transactions,
--   vendors, purchase_orders, purchase_order_lines, labor_services,
--   packages, package_items.
--
-- All tables are tenant-scoped via tenant_id and protected by RLS policies
-- mirroring the existing consumables rules.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- parts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parts (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id              UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  part_number            TEXT,
  name                   TEXT        NOT NULL,
  brand                  TEXT,
  category               TEXT,
  subcategory            TEXT,
  unit                   TEXT,
  barcode                TEXT,
  default_markup_percent NUMERIC(5, 2),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_tenant_part_number
  ON parts (tenant_id, part_number)
  WHERE part_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parts_tenant_id
  ON parts (tenant_id);

CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_locations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_locations (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  code       TEXT,
  kind       TEXT        NOT NULL DEFAULT 'PRIMARY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_tenant_id
  ON inventory_locations (tenant_id);

CREATE TRIGGER trg_inventory_locations_updated_at
  BEFORE UPDATE ON inventory_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- stock_levels
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_levels (
  id                  UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  part_id             UUID           NOT NULL REFERENCES parts (id) ON DELETE CASCADE,
  location_id         UUID           NOT NULL REFERENCES inventory_locations (id) ON DELETE CASCADE,
  quantity            NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  cost_per_unit_cents INTEGER        NOT NULL DEFAULT 0 CHECK (cost_per_unit_cents >= 0),
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_levels_tenant_part_location
  ON stock_levels (tenant_id, part_id, location_id);

CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_location
  ON stock_levels (tenant_id, location_id);

CREATE TRIGGER trg_stock_levels_updated_at
  BEFORE UPDATE ON stock_levels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_transactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                  UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  part_id             UUID           NOT NULL REFERENCES parts (id) ON DELETE CASCADE,
  location_id         UUID           NOT NULL REFERENCES inventory_locations (id) ON DELETE CASCADE,
  quantity            NUMERIC(12, 2) NOT NULL CHECK (quantity >= 0),
  direction           TEXT           NOT NULL CHECK (direction IN ('IN', 'OUT')),
  reason              TEXT           NOT NULL,
  cost_per_unit_cents INTEGER,
  metadata_json       JSONB,
  occurred_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_tenant_occurred_at
  ON inventory_transactions (tenant_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendors (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_name
  ON vendors (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant_id
  ON vendors (tenant_id);

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- purchase_orders & purchase_order_lines
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vendor_id           UUID        REFERENCES vendors (id) ON DELETE SET NULL,
  supplier_po_number  TEXT,
  status              TEXT        NOT NULL DEFAULT 'CONFIRMED',
  delivery_type       TEXT        NOT NULL,
  estimated_ready_at  TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_id
  ON purchase_orders (tenant_id, created_at DESC);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                   UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  purchase_order_id    UUID           NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  part_id              UUID           REFERENCES parts (id) ON DELETE SET NULL,
  part_number          TEXT           NOT NULL,
  description          TEXT           NOT NULL,
  qty                  NUMERIC(12, 2) NOT NULL CHECK (qty > 0),
  wholesale_price_cents INTEGER       NOT NULL CHECK (wholesale_price_cents >= 0),
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_tenant_po
  ON purchase_order_lines (tenant_id, purchase_order_id);

-- ---------------------------------------------------------------------------
-- labor_services
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS labor_services (
  id            UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name          TEXT           NOT NULL,
  description   TEXT,
  labor_type    TEXT           NOT NULL,
  default_hours NUMERIC(5, 2)  NOT NULL,
  rate_cents    INTEGER,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_services_tenant_id
  ON labor_services (tenant_id);

CREATE TRIGGER trg_labor_services_updated_at
  BEFORE UPDATE ON labor_services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- packages & package_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS packages (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_tenant_id
  ON packages (tenant_id);

CREATE TRIGGER trg_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS package_items (
  id               UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  package_id       UUID           NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  kind             TEXT           NOT NULL,
  part_id          UUID           REFERENCES parts (id) ON DELETE SET NULL,
  labor_service_id UUID           REFERENCES labor_services (id) ON DELETE SET NULL,
  quantity         NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_items_tenant_package
  ON package_items (tenant_id, package_id);

-- ---------------------------------------------------------------------------
-- RLS: enable & tenant-scoped CRUD policies
-- ---------------------------------------------------------------------------

ALTER TABLE parts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items        ENABLE ROW LEVEL SECURITY;

-- Helper macro-like comment: all tenant_id columns are scoped via current_tenant_id()

DO $$
BEGIN
  -- parts
  DROP POLICY IF EXISTS parts_select  ON parts;
  DROP POLICY IF EXISTS parts_insert  ON parts;
  DROP POLICY IF EXISTS parts_update  ON parts;
  DROP POLICY IF EXISTS parts_delete  ON parts;

  CREATE POLICY parts_select
    ON parts FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY parts_insert
    ON parts FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY parts_update
    ON parts FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY parts_delete
    ON parts FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- inventory_locations
  DROP POLICY IF EXISTS inventory_locations_select ON inventory_locations;
  DROP POLICY IF EXISTS inventory_locations_insert ON inventory_locations;
  DROP POLICY IF EXISTS inventory_locations_update ON inventory_locations;
  DROP POLICY IF EXISTS inventory_locations_delete ON inventory_locations;

  CREATE POLICY inventory_locations_select
    ON inventory_locations FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY inventory_locations_insert
    ON inventory_locations FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY inventory_locations_update
    ON inventory_locations FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY inventory_locations_delete
    ON inventory_locations FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- stock_levels
  DROP POLICY IF EXISTS stock_levels_select ON stock_levels;
  DROP POLICY IF EXISTS stock_levels_insert ON stock_levels;
  DROP POLICY IF EXISTS stock_levels_update ON stock_levels;
  DROP POLICY IF EXISTS stock_levels_delete ON stock_levels;

  CREATE POLICY stock_levels_select
    ON stock_levels FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY stock_levels_insert
    ON stock_levels FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY stock_levels_update
    ON stock_levels FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY stock_levels_delete
    ON stock_levels FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- inventory_transactions (read-only to tenant; writes via backend service role)
  DROP POLICY IF EXISTS inventory_transactions_select ON inventory_transactions;

  CREATE POLICY inventory_transactions_select
    ON inventory_transactions FOR SELECT
    USING (tenant_id = current_tenant_id());

  -- vendors
  DROP POLICY IF EXISTS vendors_select ON vendors;
  DROP POLICY IF EXISTS vendors_insert ON vendors;
  DROP POLICY IF EXISTS vendors_update ON vendors;
  DROP POLICY IF EXISTS vendors_delete ON vendors;

  CREATE POLICY vendors_select
    ON vendors FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY vendors_insert
    ON vendors FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY vendors_update
    ON vendors FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY vendors_delete
    ON vendors FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- purchase_orders
  DROP POLICY IF EXISTS purchase_orders_select ON purchase_orders;
  DROP POLICY IF EXISTS purchase_orders_insert ON purchase_orders;
  DROP POLICY IF EXISTS purchase_orders_update ON purchase_orders;
  DROP POLICY IF EXISTS purchase_orders_delete ON purchase_orders;

  CREATE POLICY purchase_orders_select
    ON purchase_orders FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY purchase_orders_insert
    ON purchase_orders FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY purchase_orders_update
    ON purchase_orders FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY purchase_orders_delete
    ON purchase_orders FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- purchase_order_lines
  DROP POLICY IF EXISTS purchase_order_lines_select ON purchase_order_lines;

  CREATE POLICY purchase_order_lines_select
    ON purchase_order_lines FOR SELECT
    USING (tenant_id = current_tenant_id());

  -- labor_services
  DROP POLICY IF EXISTS labor_services_select ON labor_services;
  DROP POLICY IF EXISTS labor_services_insert ON labor_services;
  DROP POLICY IF EXISTS labor_services_update ON labor_services;
  DROP POLICY IF EXISTS labor_services_delete ON labor_services;

  CREATE POLICY labor_services_select
    ON labor_services FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY labor_services_insert
    ON labor_services FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY labor_services_update
    ON labor_services FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY labor_services_delete
    ON labor_services FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- packages
  DROP POLICY IF EXISTS packages_select ON packages;
  DROP POLICY IF EXISTS packages_insert ON packages;
  DROP POLICY IF EXISTS packages_update ON packages;
  DROP POLICY IF EXISTS packages_delete ON packages;

  CREATE POLICY packages_select
    ON packages FOR SELECT
    USING (tenant_id = current_tenant_id());

  CREATE POLICY packages_insert
    ON packages FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY packages_update
    ON packages FOR UPDATE
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE POLICY packages_delete
    ON packages FOR DELETE
    USING (tenant_id = current_tenant_id());

  -- package_items
  DROP POLICY IF EXISTS package_items_select ON package_items;

  CREATE POLICY package_items_select
    ON package_items FOR SELECT
    USING (tenant_id = current_tenant_id());
END $$;

