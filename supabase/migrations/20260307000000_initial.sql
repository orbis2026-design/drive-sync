-- =============================================================================
-- DriveSync — Consolidated Initial Migration
-- Replaces all incremental migration files with a single canonical schema.
-- Run with: supabase db reset
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension could not be created in schema extensions: %. Skipping.', SQLERRM;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'http extension could not be created in schema extensions: %. Skipping.', SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE work_order_status AS ENUM (
    'REQUESTED',
    'INTAKE',
    'ACTIVE',
    'PENDING_APPROVAL',
    'BLOCKED_WAITING_APPROVAL',
    'COMPLETE',
    'INVOICED',
    'PAID',
    'BATCHED_PENDING_PAYMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SHOP_OWNER', 'FIELD_TECH', 'FLEET_CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outbound_campaign_status AS ENUM ('QUEUED', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Helper: validate every element of a maintenance_schedule_json array.
-- Must be IMMUTABLE so Postgres allows it inside a CHECK constraint.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_valid_maintenance_schedule(j jsonb)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $$
  SELECT
    CASE
      WHEN jsonb_typeof(j) <> 'array' THEN false
      WHEN jsonb_array_length(j) = 0  THEN true   -- empty array is allowed
      ELSE (
        SELECT bool_and(
          jsonb_typeof(elem) = 'object'
          AND (elem->>'mileage') IS NOT NULL
          AND (elem->>'mileage')::numeric > 0
          AND jsonb_typeof(elem->'tasks') = 'array'
          AND jsonb_array_length(elem->'tasks') > 0
        )
        FROM jsonb_array_elements(j) AS elem
      )
    END
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: keep updated_at current on every row modification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. tenants
--    Represents a single solo mechanic (or small shop) subscription.
--    All operational data is scoped to a tenant for full data isolation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenants (
  id                  UUID                NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT                NOT NULL,
  slug                TEXT                NOT NULL UNIQUE,
  email               TEXT                UNIQUE,
  phone               TEXT,
  owner_user_id       UUID                REFERENCES auth.users(id) ON DELETE SET NULL,
  features_json       JSONB               NOT NULL DEFAULT '{"inventory":true,"marketing":true,"fleet":true}'::jsonb,
  google_place_id     TEXT,
  review_link         TEXT,
  tax_matrix_json     JSONB               NOT NULL DEFAULT '{
    "labor_tax_rate": 0.00,
    "parts_tax_rate": 0.085,
    "environmental_fee_flat": 5.00,
    "environmental_fee_percentage": 0.00
  }'::jsonb,
  stripe_customer_id  TEXT                UNIQUE,
  subscription_status subscription_status NOT NULL DEFAULT 'ACTIVE',
  qbo_realm_id        TEXT,
  qbo_access_token    TEXT,
  qbo_refresh_token   TEXT,
  logo_url            TEXT,
  onboarding_complete BOOLEAN             NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenants IS
  'Solo mechanics or small shops that subscribe to DriveSync.';
COMMENT ON COLUMN tenants.features_json IS
  'Feature-flag map for tenant-level product toggles. '
  'Shape: { "inventory": bool, "marketing": bool, "fleet": bool }';
COMMENT ON COLUMN tenants.tax_matrix_json IS
  'Shop-specific tax rules. Shape:
   {
     "labor_tax_rate": 0.00,
     "parts_tax_rate": 0.085,
     "environmental_fee_flat": 5.00,
     "environmental_fee_percentage": 0.00
   }
   environmental_fee_flat is appended when fluids appear in parts_json.';

CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. global_vehicles
--    The self-learning vehicle lexicon shared across ALL tenants.
--    Populated on first VIN decode/manual entry; enriched over time.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS global_vehicles (
  id                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year                      SMALLINT    NOT NULL CHECK (year BETWEEN 1886 AND 2100),
  make                      TEXT        NOT NULL,
  model                     TEXT        NOT NULL,
  vin                       TEXT        UNIQUE,
  engine                    TEXT,
  trim                      TEXT,
  maintenance_schedule_json JSONB       NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT chk_maintenance_schedule_json_shape
    CHECK (is_valid_maintenance_schedule(maintenance_schedule_json)),
  known_faults_json         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  last_tsb_sync             TIMESTAMPTZ,
  oil_capacity_qts          NUMERIC(4,2),
  oil_weight_oem            TEXT,
  submodel_options_json     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_global_vehicle UNIQUE (year, make, model, engine)
);

COMMENT ON TABLE global_vehicles IS
  'Shared vehicle lexicon: year/make/model/engine + evolving maintenance and fault data.';
COMMENT ON COLUMN global_vehicles.vin IS
  'Full 17-character Vehicle Identification Number. Populated by the Lexicon '
  'Extractor Worker on a cache-miss; NULL for rows created before Phase 14.';
COMMENT ON COLUMN global_vehicles.engine IS
  'Engine descriptor returned by CarMD /decode, e.g. "2.5L 4-Cylinder DOHC".';
COMMENT ON COLUMN global_vehicles.trim IS
  'Trim level returned by CarMD /decode, e.g. "Sport", "Limited".';
COMMENT ON COLUMN global_vehicles.known_faults_json IS
  'Array of TSB objects: [{ bulletin_id, description, component }]. '
  'Cost fields (estimated labor, parts cost) are stripped before insertion.';
COMMENT ON COLUMN global_vehicles.last_tsb_sync IS
  'Timestamp of the most recent TSB refresh from the CarMD /tsb endpoint. '
  'Updated by the pg_cron job.';
COMMENT ON COLUMN global_vehicles.oil_capacity_qts IS
  'Engine oil capacity in US quarts, e.g. 5.0';
COMMENT ON COLUMN global_vehicles.oil_weight_oem IS
  'OEM-specified oil viscosity grade, e.g. "0W-20 Full Synthetic"';
COMMENT ON COLUMN global_vehicles.submodel_options_json IS
  'Array of possible trim/engine combos returned by the VIN decoder, e.g.
   [{"engine":"1.5L Turbo","trim":"Sport","oil_capacity_qts":4.4,"oil_weight_oem":"0W-20 Full Synthetic"}]';
COMMENT ON CONSTRAINT chk_maintenance_schedule_json_shape ON global_vehicles IS
  'Enforces the Phase 14/15 canonical maintenance matrix shape: '
  '[{ "mileage": <positive int>, "tasks": ["<string>", ...] }]. '
  'Validated via the is_valid_maintenance_schedule() immutable function '
  'to satisfy the PostgreSQL prohibition on subqueries in CHECK constraints.';

CREATE INDEX IF NOT EXISTS idx_global_vehicles_vin
  ON global_vehicles (vin)
  WHERE vin IS NOT NULL;

CREATE TRIGGER trg_global_vehicles_updated_at
  BEFORE UPDATE ON global_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. clients
--    A customer of a specific tenant.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  first_name          TEXT        NOT NULL,
  last_name           TEXT        NOT NULL,
  email               TEXT,
  phone               TEXT        NOT NULL,
  notes               TEXT,
  zip_code            TEXT,
  is_commercial_fleet BOOLEAN     NOT NULL DEFAULT FALSE,
  client_user_id      UUID        REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clients IS
  'Vehicle owners / customers, scoped to a tenant.';
COMMENT ON COLUMN clients.zip_code IS
  'Client ZIP code used for drive-time padding calculation between appointments.';
COMMENT ON COLUMN clients.is_commercial_fleet IS
  'True for commercial accounts (e.g. plumbing company with 5 vans). '
  'Enables Fleet Dashboard and Batch Invoice features.';
COMMENT ON COLUMN clients.client_user_id IS
  'auth.uid() of the FLEET_CLIENT portal user associated with this client. '
  'Used by RBAC RLS to restrict read access to their own WorkOrders only.';

CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients (tenant_id);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. tenant_vehicles
--    Joins a client to a global_vehicle entry and adds per-unit details.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_vehicles (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  client_id         UUID        NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  global_vehicle_id UUID        NOT NULL REFERENCES global_vehicles (id),
  license_plate     TEXT,
  vin               TEXT        UNIQUE CHECK (vin IS NULL OR length(vin) = 17),
  mileage           INTEGER     CHECK (mileage >= 0),
  color             TEXT,
  last_service_date DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_vehicles IS
  'Links a client to a global_vehicle; stores per-unit details (plate, VIN, mileage).';
COMMENT ON COLUMN tenant_vehicles.last_service_date IS
  'Date of the most recent completed service. Used by the retention cron to '
  'estimate days until the next scheduled interval.';

CREATE INDEX IF NOT EXISTS idx_tenant_vehicles_tenant_id         ON tenant_vehicles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_vehicles_client_id         ON tenant_vehicles (client_id);
CREATE INDEX IF NOT EXISTS idx_tenant_vehicles_global_vehicle_id ON tenant_vehicles (global_vehicle_id);

CREATE TRIGGER trg_tenant_vehicles_updated_at
  BEFORE UPDATE ON tenant_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. work_orders
--    The core operational record for a job.
-- ---------------------------------------------------------------------------

-- Trigger function: rotate version_hash and enforce is_locked on update.
CREATE OR REPLACE FUNCTION rotate_work_order_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := gen_random_uuid();
  IF NEW.status IN ('COMPLETE', 'INVOICED', 'PAID') THEN
    NEW.is_locked := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS work_orders (
  id                      UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               UUID              NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  tenant_vehicle_id       UUID              NOT NULL REFERENCES tenant_vehicles (id) ON DELETE CASCADE,
  status                  work_order_status NOT NULL DEFAULT 'INTAKE',
  title                   TEXT              NOT NULL,
  description             TEXT              NOT NULL,
  notes                   TEXT,
  mileage_at_intake       INTEGER           CHECK (mileage_at_intake >= 0),
  labor_cents             INTEGER           NOT NULL DEFAULT 0 CHECK (labor_cents >= 0),
  parts_cents             INTEGER           NOT NULL DEFAULT 0 CHECK (parts_cents >= 0),
  parts_cost_cents        INTEGER           CHECK (parts_cost_cents >= 0),
  scheduled_at            TIMESTAMPTZ,
  intake_photo_url        TEXT,
  inspection_json         JSONB,
  parts_json              JSONB,
  customer_supplied_parts BOOLEAN           NOT NULL DEFAULT FALSE,
  delta_parts_json        JSONB,
  delta_approval_token    UUID              UNIQUE,
  pre_check_complete      BOOLEAN           NOT NULL DEFAULT FALSE,
  approval_token          UUID              UNIQUE,
  closed_at               TIMESTAMPTZ,
  payment_method          TEXT,
  version_hash            UUID              NOT NULL DEFAULT gen_random_uuid(),
  is_locked               BOOLEAN           NOT NULL DEFAULT FALSE,
  labor_json              JSONB,
  is_diagnostic           BOOLEAN           NOT NULL DEFAULT FALSE,
  diagnostic_fee_cents    INTEGER           NOT NULL DEFAULT 0 CHECK (diagnostic_fee_cents >= 0),
  roll_diagnostic_fee     BOOLEAN           NOT NULL DEFAULT FALSE,
  assigned_tech_id        UUID              REFERENCES auth.users(id),
  has_damage_flag         BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE work_orders IS
  'Operational job records linked to a tenant_vehicle.';
COMMENT ON COLUMN work_orders.parts_cost_cents IS
  'Wholesale (COGS) cost of parts in cents. When NULL the analytics engine
   assumes a 55% cost ratio against parts_cents for gross-margin reporting.';
COMMENT ON COLUMN work_orders.scheduled_at IS
  'Calendar appointment timestamp. NULL = unscheduled / backlog.';
COMMENT ON COLUMN work_orders.intake_photo_url IS
  'Supabase Storage URL of the photo uploaded via the self-service intake wizard.';
COMMENT ON COLUMN work_orders.customer_supplied_parts IS
  'When true, parts are billed at cost (no retail markup). Liability flag shown.';
COMMENT ON COLUMN work_orders.delta_parts_json IS
  'Change-order (DeltaQuote) parts added after initial APPROVED status.
   Same shape as parts_json: SelectedPart[].';
COMMENT ON COLUMN work_orders.delta_approval_token IS
  'Unique token for the client to review and sign the DeltaQuote change order.';
COMMENT ON COLUMN work_orders.pre_check_complete IS
  'True once the mandatory pre-inspection walkaround (Issue #43) is completed.';
COMMENT ON COLUMN work_orders.version_hash IS
  'Rotated on every server-side mutation. The offline sync engine compares
   this value before flushing local patches; a mismatch means a conflict.';
COMMENT ON COLUMN work_orders.is_locked IS
  'Set to TRUE when the WorkOrder reaches COMPLETE or PAID status so that
   any offline patch targeting total_price, parts_json, or labor_json is
   rejected by the /api/sync endpoint.';
COMMENT ON COLUMN work_orders.labor_json IS
  'Structured labour line-items. Shape: LaborLine[]:
   [{ "description": "Engine removal", "hours": 3.0 }]
   Populated by the Quote Builder; used for tax-matrix calculations.';
COMMENT ON COLUMN work_orders.is_diagnostic IS
  'True when this work order was created via the Diagnostic-Only intake flow.';
COMMENT ON COLUMN work_orders.diagnostic_fee_cents IS
  'Flat diagnostic fee charged upfront before any repair quote is issued.';
COMMENT ON COLUMN work_orders.roll_diagnostic_fee IS
  'When true the diagnostic fee is credited against the final repair total.';
COMMENT ON COLUMN work_orders.assigned_tech_id IS
  'auth.uid() of the FIELD_TECH user assigned to this job. '
  'Used by RBAC RLS policies to enforce per-tech data isolation.';
COMMENT ON COLUMN work_orders.has_damage_flag IS
  'Set to TRUE by a FIELD_TECH when pre-existing damage is documented '
  'during the walkaround inspection. Drops the WorkOrder into the '
  'Shop Owner''s QA & Dispatch queue for liability review before billing.';

CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_id         ON work_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_vehicle_id ON work_orders (tenant_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status            ON work_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled_at
  ON work_orders (tenant_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE TRIGGER trg_work_orders_version
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION rotate_work_order_version();

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. user_roles
--    One row per auth user specifying their role and tenant scope.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role   NOT NULL DEFAULT 'SHOP_OWNER',
  tenant_id  UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_roles_tenant_id_idx ON user_roles (tenant_id);

COMMENT ON TABLE user_roles IS
  'Maps each Supabase Auth user to their application role '
  '(SHOP_OWNER, FIELD_TECH, or FLEET_CLIENT).';

-- ---------------------------------------------------------------------------
-- Helper functions that depend on user_roles / tenants
-- ---------------------------------------------------------------------------

-- Resolves the tenant_id for the current authenticated user:
--   1. Via user_roles.tenant_id  (SHOP_OWNER / FIELD_TECH path)
--   2. Fallback: tenants.owner_user_id  (legacy / owner direct path)
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1),
    (SELECT id        FROM tenants     WHERE owner_user_id = auth.uid() LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION current_user_role() IS
  'Returns the application role (SHOP_OWNER | FIELD_TECH | FLEET_CLIENT) of '
  'the currently authenticated user. Returns NULL when the user has no role '
  'assignment, which causes all RLS policies to deny access by default.';

-- ---------------------------------------------------------------------------
-- 7. consumables
--    Bulk shop supplies tracked against completed jobs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consumables (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  unit                TEXT        NOT NULL,
  current_stock       NUMERIC     NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold NUMERIC     NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  cost_per_unit_cents INTEGER     NOT NULL DEFAULT 0 CHECK (cost_per_unit_cents >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE consumables IS
  'Bulk shop supplies tracked against completed jobs to prevent profit leakage.';
COMMENT ON COLUMN consumables.current_stock IS
  'Remaining stock in the named unit (e.g. 42.5 Quarts of 5W-30).';
COMMENT ON COLUMN consumables.low_stock_threshold IS
  'Stock level below which a glowing red Low Stock badge is rendered in the UI.';

CREATE INDEX IF NOT EXISTS idx_consumables_tenant_id ON consumables (tenant_id);

CREATE TRIGGER trg_consumables_updated_at
  BEFORE UPDATE ON consumables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. messages  (Issue #24 — SMS inbox with Realtime)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   UUID        REFERENCES clients(id) ON DELETE SET NULL,
  body        TEXT        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 1600),
  direction   TEXT        NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  from_number TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_tenant_id_idx ON messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_client_id_idx ON messages (client_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ---------------------------------------------------------------------------
-- 9. expenses  (Issue #26 — OCR receipt tracker)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expenses (
  id                UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  vendor            TEXT           NOT NULL,
  category          TEXT           NOT NULL DEFAULT 'General',
  receipt_image_url TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_tenant_id_idx ON expenses (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. user_passkeys  (Issue #25 — WebAuthn credential store)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_passkeys (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id  TEXT        NOT NULL UNIQUE,
  public_key_der TEXT        NOT NULL,
  device_label   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx ON user_passkeys (user_id);

-- ---------------------------------------------------------------------------
-- 11. warranties  (Phase 9 — parts-level warranty windows)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_warranty_expires_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.expires_at := NEW.installed_at + (NEW.warranty_months * INTERVAL '1 month');
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS warranties (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id   TEXT        NOT NULL,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  part_name       TEXT        NOT NULL,
  part_number     TEXT,
  supplier        TEXT,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  warranty_months INTEGER     NOT NULL DEFAULT 12,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE warranties IS
  'Parts-level warranty windows per work-order line item.';
COMMENT ON COLUMN warranties.expires_at IS
  'Auto-computed by trg_warranties_compute_expires: installed_at + warranty_months months.';

CREATE INDEX IF NOT EXISTS warranties_tenant_id_idx     ON warranties(tenant_id);
CREATE INDEX IF NOT EXISTS warranties_work_order_id_idx ON warranties(work_order_id);

CREATE TRIGGER trg_warranties_compute_expires
  BEFORE INSERT OR UPDATE OF installed_at, warranty_months
  ON warranties
  FOR EACH ROW
  EXECUTE FUNCTION compute_warranty_expires_at();

CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. outbound_campaigns  (SMS retention send queue)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id                UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID                     NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  tenant_vehicle_id UUID                     NOT NULL REFERENCES tenant_vehicles (id) ON DELETE CASCADE,
  client_id         UUID                     NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  to_phone          TEXT                     NOT NULL,
  message_body      TEXT                     NOT NULL,
  service_name      TEXT                     NOT NULL,
  miles_until_due   INTEGER,
  days_until_due    INTEGER,
  status            outbound_campaign_status NOT NULL DEFAULT 'QUEUED',
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE outbound_campaigns IS
  'SMS retention messages queued by the daily cron job for Twilio dispatch.';
COMMENT ON COLUMN outbound_campaigns.to_phone IS
  'Destination phone in E.164 format as required by Twilio.';
COMMENT ON COLUMN outbound_campaigns.message_body IS
  'Fully rendered SMS text ready to POST to the Twilio Messages API.';

CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_tenant_id
  ON outbound_campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_status
  ON outbound_campaigns (status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_tenant_vehicle_id
  ON outbound_campaigns (tenant_vehicle_id);

CREATE TRIGGER trg_outbound_campaigns_updated_at
  BEFORE UPDATE ON outbound_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. mechanic_settings  (Phase 17 — per-mechanic billing preferences)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mechanic_settings (
  id               BIGSERIAL     PRIMARY KEY,
  user_id          UUID          NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  labor_rate_cents INTEGER       NOT NULL DEFAULT 12000,
  parts_tax_rate   NUMERIC(6, 4) NOT NULL DEFAULT 0.0875,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mechanic_settings_user_id_idx ON mechanic_settings (user_id);

CREATE TRIGGER trg_mechanic_settings_updated_at
  BEFORE UPDATE ON mechanic_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: top-N most-referenced GlobalVehicle IDs  (for TSB sync)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_top_referenced_global_vehicle_ids(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (global_vehicle_id uuid, reference_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    v.global_vehicle_id,
    count(*) AS reference_count
  FROM tenant_vehicles v
  WHERE v.global_vehicle_id IS NOT NULL
  GROUP BY v.global_vehicle_id
  ORDER BY reference_count DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_top_referenced_global_vehicle_ids(integer) IS
  'Returns the top-N GlobalVehicle IDs ordered by the number of tenant '
  'vehicles that reference them. Used by the TSB sync cron job.';

-- ---------------------------------------------------------------------------
-- TSB sync procedure — called by the pg_cron job every 6 months
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE run_tsb_sync()
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  edge_fn_url TEXT;
  payload     JSONB;
  gv_ids      UUID[] := '{}';
BEGIN
  SELECT array_agg(t.global_vehicle_id ORDER BY t.reference_count DESC)
    INTO gv_ids
  FROM get_top_referenced_global_vehicle_ids(100) t;

  IF gv_ids IS NULL OR array_length(gv_ids, 1) = 0 THEN
    RAISE NOTICE 'TSB sync: no global_vehicle_id references found; skipping.';
    RETURN;
  END IF;

  edge_fn_url := current_setting('app.supabase_url', TRUE)
                 || '/functions/v1/sync-tsb';

  payload := jsonb_build_object('vehicle_ids', to_jsonb(gv_ids));

  PERFORM extensions.http_post(
    edge_fn_url,
    payload::text,
    'application/json'
  );

  RAISE NOTICE 'TSB sync: triggered Edge Function for % vehicles.', array_length(gv_ids, 1);
END;
$$;

COMMENT ON PROCEDURE run_tsb_sync() IS
  'Calls the sync-tsb Edge Function with the top-100 most-referenced '
  'GlobalVehicle IDs so that known_faults_json and last_tsb_sync are kept '
  'current without manual intervention. Invoked by pg_cron every 6 months.';

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_vehicles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vehicles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passkeys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- tenants: each mechanic can only manage their own shop
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
DROP POLICY IF EXISTS "tenants_update_own" ON tenants;

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (owner_user_id = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "tenants_update_own"
  ON tenants FOR UPDATE
  USING  (owner_user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (owner_user_id = auth.uid() OR auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- global_vehicles: read-only for authenticated; writes restricted to service_role
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "global_vehicles_read_authenticated" ON global_vehicles;
DROP POLICY IF EXISTS "global_vehicles_write_service_role" ON global_vehicles;

CREATE POLICY "global_vehicles_read_authenticated"
  ON global_vehicles FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "global_vehicles_write_service_role"
  ON global_vehicles FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- clients — RBAC policies
--   SHOP_OWNER   → all clients in their tenant
--   FIELD_TECH   → all clients in their tenant (read-only context for job data)
--   FLEET_CLIENT → only the client row linked to their auth user
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "clients_select_rbac" ON clients;
DROP POLICY IF EXISTS "clients_mutate_rbac"  ON clients;

CREATE POLICY "clients_select_rbac"
  ON clients FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FLEET_CLIENT'
      AND client_user_id = auth.uid()
    )
  );

CREATE POLICY "clients_mutate_rbac"
  ON clients FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- tenant_vehicles: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenant_vehicles_tenant_isolation" ON tenant_vehicles;

CREATE POLICY "tenant_vehicles_tenant_isolation"
  ON tenant_vehicles FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- work_orders — RBAC policies
--   SHOP_OWNER   → SELECT/INSERT/UPDATE/DELETE all within their tenant
--   FIELD_TECH   → SELECT/UPDATE only WorkOrders assigned to them
--   FLEET_CLIENT → SELECT (read-only) WorkOrders for their vehicles
--
-- CRITICAL FIX: FLEET_CLIENT SELECT must JOIN through tenant_vehicles
-- because work_orders has no direct client_id column.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "work_orders_select_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_insert_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_update_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_delete_rbac" ON work_orders;

CREATE POLICY "work_orders_select_rbac"
  ON work_orders FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
    OR (
      current_user_role() = 'FLEET_CLIENT'
      AND tenant_vehicle_id IN (
        SELECT tv.id FROM tenant_vehicles tv
        JOIN clients c ON c.id = tv.client_id
        WHERE c.client_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "work_orders_insert_rbac"
  ON work_orders FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

CREATE POLICY "work_orders_update_rbac"
  ON work_orders FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
  );

CREATE POLICY "work_orders_delete_rbac"
  ON work_orders FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- consumables: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "consumables_tenant_isolation" ON consumables;

CREATE POLICY "consumables_tenant_isolation"
  ON consumables FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- messages: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "messages_tenant_isolation" ON messages;

CREATE POLICY "messages_tenant_isolation"
  ON messages FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- expenses: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expenses_tenant_isolation" ON expenses;

CREATE POLICY "expenses_tenant_isolation"
  ON expenses FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- user_passkeys: each user can only manage their own credentials
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_passkeys_own" ON user_passkeys;

CREATE POLICY "user_passkeys_own"
  ON user_passkeys FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- warranties: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant members can manage warranties" ON warranties;

CREATE POLICY "Tenant members can manage warranties"
  ON warranties FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- outbound_campaigns: tenant isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "outbound_campaigns_tenant_isolation" ON outbound_campaigns;

CREATE POLICY "outbound_campaigns_tenant_isolation"
  ON outbound_campaigns FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- user_roles: user can read own row; service_role has full access
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_roles_read_own"      ON user_roles;
DROP POLICY IF EXISTS "user_roles_write_service"  ON user_roles;

CREATE POLICY "user_roles_read_own"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "user_roles_write_service"
  ON user_roles FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- mechanic_settings: each mechanic can only read/write their own row
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS mechanic_settings_self ON mechanic_settings;

CREATE POLICY mechanic_settings_self
  ON mechanic_settings FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- pg_cron — schedule TSB sync at 02:00 UTC on 1 Jan and 1 Jul (every 6 months)
-- =============================================================================

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('tsb-sync-biannual');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job did not exist or cron schema not accessible; continue
  END;

  BEGIN
    PERFORM cron.schedule(
      'tsb-sync-biannual',
      '0 2 1 1,7 *',
      $cmd$CALL run_tsb_sync();$cmd$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TSB cron job could not be scheduled: %. Migration continues without it.', SQLERRM;
  END;
END;
$$;
