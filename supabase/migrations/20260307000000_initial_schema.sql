-- =============================================================================
-- Migration: Initial Schema
-- =============================================================================
-- Creates the base tables required by all subsequent migrations:
--   tenants, global_vehicles, clients, tenant_vehicles, work_orders
-- Also installs the set_updated_at() trigger function used by every table
-- that carries an updated_at column.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenants
--    Represents a single solo mechanic (or small shop) subscription.
--    All operational data is scoped to a tenant for full data isolation.
-- ---------------------------------------------------------------------------
create table if not exists tenants (
  id          uuid        primary key default gen_random_uuid(),
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
-- ---------------------------------------------------------------------------
create table if not exists global_vehicles (
  id                       uuid        primary key default gen_random_uuid(),
  year                     smallint    not null check (year between 1886 and 2100),
  make                     text        not null,
  model                    text        not null,
  engine                   text,
  trim                     text,
  maintenance_schedule_json jsonb      not null default '[]'::jsonb,
  known_faults_json         jsonb      not null default '[]'::jsonb,
  oil_capacity_qts          numeric(4,2),
  oil_weight_oem            text,
  submodel_options_json     jsonb      not null default '[]'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint uq_global_vehicle unique (year, make, model, engine)
);

comment on table global_vehicles is
  'Shared vehicle lexicon: year/make/model/engine + evolving maintenance and fault data.';

-- ---------------------------------------------------------------------------
-- 3. clients
--    A customer of a specific tenant.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id          uuid        primary key default gen_random_uuid(),
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
--    Joins a client to a global_vehicle entry and adds per-unit details.
-- ---------------------------------------------------------------------------
create table if not exists tenant_vehicles (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants (id) on delete cascade,
  client_id         uuid        not null references clients (id) on delete cascade,
  global_vehicle_id uuid        not null references global_vehicles (id),
  license_plate     text,
  vin               text        unique check (vin is null or length(vin) = 17),
  mileage           integer     check (mileage >= 0),
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
--    The core operational record for a job.
-- ---------------------------------------------------------------------------
do $$ begin
  create type work_order_status as enum (
    'INTAKE',
    'ACTIVE',
    'PENDING_APPROVAL',
    'BLOCKED_WAITING_APPROVAL',
    'COMPLETE',
    'INVOICED',
    'PAID'
  );
exception when duplicate_object then null;
end $$;

create table if not exists work_orders (
  id                uuid               primary key default gen_random_uuid(),
  tenant_id         uuid               not null references tenants (id) on delete cascade,
  tenant_vehicle_id uuid               not null references tenant_vehicles (id) on delete cascade,
  status            work_order_status  not null default 'INTAKE',
  title             text               not null,
  description       text               not null,
  notes             text,
  mileage_at_intake integer            check (mileage_at_intake >= 0),
  labor_cents       integer            not null default 0 check (labor_cents >= 0),
  parts_cents       integer            not null default 0 check (parts_cents >= 0),
  inspection_json   jsonb,
  parts_json        jsonb,
  customer_supplied_parts boolean      not null default false,
  delta_parts_json  jsonb,
  delta_approval_token uuid            unique,
  pre_check_complete boolean           not null default false,
  approval_token    uuid               unique,
  closed_at         timestamptz,
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
-- updated_at trigger function — keep updated_at current on every row change
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
