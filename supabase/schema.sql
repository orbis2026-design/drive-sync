-- =============================================================================
-- DriveSync — PostgreSQL / Supabase Schema
-- =============================================================================
-- Run with: supabase db reset  (or paste into the Supabase SQL editor)
--
-- Table hierarchy:
--   tenants
--     └─ clients          (tenant_id FK)
--     └─ global_vehicles  (shared lexicon, no tenant FK — append-only reference)
--         └─ tenant_vehicles  (client_id + global_vehicle_id + plate/VIN/mileage)
--             └─ work_orders  (tenant_vehicle_id FK)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. tenants
--    Represents a single solo mechanic (or small shop) subscription.
--    All operational data is scoped to a tenant for full data isolation.
-- ---------------------------------------------------------------------------
create table if not exists tenants (
  id          uuid        primary key default uuid_generate_v4(),
  name        text        not null,
  slug        text        not null unique,          -- URL-friendly identifier
  email       text        unique,
  phone       text,
  -- Feature flags for optional product modules (Issue #49).
  -- Shape: { "inventory": bool, "marketing": bool, "fleet": bool }
  features_json jsonb     not null default '{"inventory":true,"marketing":true,"fleet":true}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table tenants is
  'Solo mechanics or small shops that subscribe to DriveSync.';

-- ---------------------------------------------------------------------------
-- 2. global_vehicles
--    The self-learning vehicle lexicon shared across ALL tenants.
--    Populated on first VIN decode/manual entry; enriched over time with
--    maintenance schedules and known-fault data from real-world work orders.
--
--    Uniqueness constraint on (year, make, model, engine) prevents duplicates
--    while still allowing the same body line with different engines.
-- ---------------------------------------------------------------------------
create table if not exists global_vehicles (
  id                       uuid        primary key default uuid_generate_v4(),
  year                     smallint    not null check (year between 1886 and 2100),
  make                     text        not null,    -- e.g. "Ford"
  model                    text        not null,    -- e.g. "F-150"
  engine                   text,                   -- e.g. "3.5L EcoBoost V6"
  trim                     text,                   -- e.g. "XLT"
  -- JSONB blobs for flexible, evolving knowledge ─────────────────────────
  maintenance_schedule_json jsonb       not null default '[]'::jsonb,
  -- [{ "interval_miles": 5000, "interval_months": 6, "task": "Oil Change", "parts": [...] }]
  known_faults_json         jsonb       not null default '[]'::jsonb,
  -- [{ "code": "P0301", "description": "Cylinder 1 Misfire", "likelihood": 0.87 }]
  -- Fluid capacity & OEM oil weight (Issue #41) ─────────────────────────
  oil_capacity_qts          numeric(4,2),           -- e.g. 5.0 (US quarts)
  oil_weight_oem            text,                   -- e.g. "0W-20 Full Synthetic"
  -- Array of trim/engine combos when VIN returns multiple possibilities ──
  submodel_options_json     jsonb       not null default '[]'::jsonb,
  -- [{ "engine": "1.5L Turbo", "trim": "Sport", "oil_capacity_qts": 4.4, "oil_weight_oem": "0W-20 Full Synthetic" }]
  -- ───────────────────────────────────────────────────────────────────────
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint uq_global_vehicle unique (year, make, model, engine)
);

comment on table global_vehicles is
  'Shared vehicle lexicon: year/make/model/engine + evolving maintenance and fault data.';
comment on column global_vehicles.maintenance_schedule_json is
  'Array of scheduled service intervals, e.g. [{interval_miles,interval_months,task,parts}].';
comment on column global_vehicles.known_faults_json is
  'Array of common fault codes with likelihood scores, e.g. [{code,description,likelihood}].';

-- ---------------------------------------------------------------------------
-- 3. clients
--    A customer of a specific tenant. Contact information is stored here;
--    vehicle ownership is represented in tenant_vehicles.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id          uuid        primary key default uuid_generate_v4(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  first_name  text        not null,
  last_name   text        not null,
  email       text,
  phone       text        not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table clients is
  'Vehicle owners / customers, scoped to a tenant.';

create index if not exists idx_clients_tenant_id on clients (tenant_id);

-- ---------------------------------------------------------------------------
-- 4. tenant_vehicles
--    Joins a client to a global_vehicle entry and adds the vehicle-specific
--    details that vary per physical unit: license plate, VIN, current mileage.
--
--    A single global_vehicle (e.g. "2019 Ford F-150 3.5L EcoBoost") can be
--    associated with many physical vehicles owned by different clients.
-- ---------------------------------------------------------------------------
create table if not exists tenant_vehicles (
  id                uuid        primary key default uuid_generate_v4(),
  tenant_id         uuid        not null references tenants (id) on delete cascade,
  client_id         uuid        not null references clients (id) on delete cascade,
  global_vehicle_id uuid        not null references global_vehicles (id),
  license_plate     text,
  vin               text        unique check (vin is null or length(vin) = 17),  -- standard 17-char VIN
  mileage           integer     check (mileage >= 0),  -- last known odometer reading
  color             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table tenant_vehicles is
  'Links a client to a global_vehicle; stores per-unit details (plate, VIN, mileage).';

create index if not exists idx_tenant_vehicles_tenant_id         on tenant_vehicles (tenant_id);
create index if not exists idx_tenant_vehicles_client_id         on tenant_vehicles (client_id);
create index if not exists idx_tenant_vehicles_global_vehicle_id on tenant_vehicles (global_vehicle_id);

-- ---------------------------------------------------------------------------
-- 5. work_orders
--    The core operational record for a job.  Each work order targets a
--    specific tenant_vehicle so it inherits the full vehicle context.
-- ---------------------------------------------------------------------------
create type work_order_status as enum (
  'INTAKE',
  'ACTIVE',
  'PENDING_APPROVAL',
  'BLOCKED_WAITING_APPROVAL',  -- mechanic awaiting client sign-off on a change order
  'COMPLETE',
  'INVOICED',
  'PAID'
);

create table if not exists work_orders (
  id                uuid               primary key default uuid_generate_v4(),
  tenant_id         uuid               not null references tenants (id) on delete cascade,
  tenant_vehicle_id uuid               not null references tenant_vehicles (id) on delete cascade,
  status            work_order_status  not null default 'INTAKE',
  title             text               not null,
  description       text               not null,
  notes             text,
  mileage_at_intake integer            check (mileage_at_intake >= 0),
  labor_cents       integer            not null default 0 check (labor_cents >= 0),
  parts_cents       integer            not null default 0 check (parts_cents >= 0),
  -- Multi-point inspection results persisted as a JSON blob.
  -- Shape: { fluids, tires, brakes, belts } each with { status, note }
  -- status is one of 'PASS' | 'MONITOR' | 'FAIL' | null
  inspection_json   jsonb,
  -- Finalised parts list written by the Parts Sourcing step.
  -- Shape: SelectedPart[] — see src/app/(app)/quotes/[workOrderId]/actions.ts
  parts_json        jsonb,
  -- When true, parts are billed at cost (no retail markup). Liability flag shown.
  customer_supplied_parts boolean not null default false,
  -- Change-order (DeltaQuote) parts added AFTER initial approval.
  -- Shape: SelectedPart[]
  delta_parts_json  jsonb,
  -- Unique token for the client to approve the delta change order.
  delta_approval_token uuid unique,
  -- True once the mandatory pre-inspection walkaround (Issue #43) is completed.
  pre_check_complete boolean not null default false,
  -- Secure token sent to client for approval portal access.
  approval_token    uuid               unique,
  -- Timestamp when payment was recorded and the job was closed.
  closed_at         timestamptz,
  -- Records how the payment was made (e.g. 'card_tap', 'card_manual', 'cash', 'check').
  payment_method    text,
  created_at        timestamptz        not null default now(),
  updated_at        timestamptz        not null default now()
);

comment on table work_orders is
  'Operational job records linked to a tenant_vehicle.';

create index if not exists idx_work_orders_tenant_id          on work_orders (tenant_id);
create index if not exists idx_work_orders_tenant_vehicle_id  on work_orders (tenant_vehicle_id);
create index if not exists idx_work_orders_status             on work_orders (tenant_id, status);

-- ---------------------------------------------------------------------------
-- updated_at trigger — keep updated_at current on every row modification
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create trigger trg_global_vehicles_updated_at
  before update on global_vehicles
  for each row execute function set_updated_at();

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create trigger trg_tenant_vehicles_updated_at
  before update on tenant_vehicles
  for each row execute function set_updated_at();

create trigger trg_work_orders_updated_at
  before update on work_orders
  for each row execute function set_updated_at();
