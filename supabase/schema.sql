-- =============================================================================
-- Drive Sync – Foundational PostgreSQL Schema
-- =============================================================================

-- Enable the pgcrypto extension for gen_random_uuid() on older Postgres versions
-- (On Postgres 13+ gen_random_uuid() is built-in; this is a safe no-op there.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tenants
-- The solo mechanics who subscribe to and operate the application.
-- -----------------------------------------------------------------------------
CREATE TABLE tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  phone      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- GlobalVehicles
-- Self-learning vehicle lexicon shared across all tenants.
-- Stores the authoritative Year / Make / Model / Engine combination along with
-- AI-enrichable maintenance schedules and known-fault catalogs.
-- -----------------------------------------------------------------------------
CREATE TABLE global_vehicles (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year                      SMALLINT    NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  make                      TEXT        NOT NULL,
  model                     TEXT        NOT NULL,
  engine                    TEXT        NOT NULL,
  maintenance_schedule_json JSONB       NOT NULL DEFAULT '{}',
  known_faults_json         JSONB       NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, make, model, engine)
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER global_vehicles_updated_at
  BEFORE UPDATE ON global_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Clients
-- Vehicle owners managed by a Tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE clients (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  email      TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clients_tenant_id_idx ON clients(tenant_id);

-- -----------------------------------------------------------------------------
-- TenantVehicles
-- Links a Client to a GlobalVehicle and captures vehicle-specific details
-- (license plate, VIN, current mileage) for a given Tenant's shop.
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_vehicles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id         UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  global_vehicle_id UUID        NOT NULL REFERENCES global_vehicles(id),
  license_plate     TEXT,
  vin               TEXT,
  mileage           INTEGER     CHECK (mileage >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenant_vehicles_tenant_id_idx ON tenant_vehicles(tenant_id);
CREATE INDEX tenant_vehicles_client_id_idx ON tenant_vehicles(client_id);
CREATE INDEX tenant_vehicles_global_vehicle_id_idx ON tenant_vehicles(global_vehicle_id);

CREATE TRIGGER tenant_vehicles_updated_at
  BEFORE UPDATE ON tenant_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- WorkOrders
-- Service jobs created by a Tenant for a specific TenantVehicle.
-- -----------------------------------------------------------------------------
CREATE TABLE work_orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_vehicle_id UUID        NOT NULL REFERENCES tenant_vehicles(id) ON DELETE CASCADE,
  description       TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  labor_cost        NUMERIC(10, 2),
  parts_cost        NUMERIC(10, 2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX work_orders_tenant_id_idx ON work_orders(tenant_id);
CREATE INDEX work_orders_tenant_vehicle_id_idx ON work_orders(tenant_vehicle_id);
CREATE INDEX work_orders_status_idx ON work_orders(status);

CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
