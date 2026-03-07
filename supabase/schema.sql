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
  last_service_date date,                              -- date of most recent completed service
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

-- ---------------------------------------------------------------------------
-- 6. outbound_campaigns
--    SMS retention messages queued by the daily retention cron job.
--    Each row represents one personalized message ready for Twilio dispatch.
-- ---------------------------------------------------------------------------
do $$ begin
  create type outbound_campaign_status as enum ('QUEUED', 'SENT', 'FAILED');
exception when duplicate_object then null;
end $$;

create table if not exists outbound_campaigns (
  id                uuid                      primary key default uuid_generate_v4(),
  tenant_id         uuid                      not null references tenants (id) on delete cascade,
  tenant_vehicle_id uuid                      not null references tenant_vehicles (id) on delete cascade,
  client_id         uuid                      not null references clients (id) on delete cascade,
  to_phone          text                      not null,
  message_body      text                      not null,
  service_name      text                      not null,
  miles_until_due   integer,
  days_until_due    integer,
  status            outbound_campaign_status  not null default 'QUEUED',
  sent_at           timestamptz,
  created_at        timestamptz               not null default now(),
  updated_at        timestamptz               not null default now()
);

comment on table outbound_campaigns is
  'SMS retention messages queued by the daily cron job for Twilio dispatch.';

create index if not exists idx_outbound_campaigns_tenant_id
  on outbound_campaigns (tenant_id);
create index if not exists idx_outbound_campaigns_status
  on outbound_campaigns (status, created_at);
create index if not exists idx_outbound_campaigns_tenant_vehicle_id
  on outbound_campaigns (tenant_vehicle_id);

create trigger trg_outbound_campaigns_updated_at
  before update on outbound_campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. warranties
--    Tracks parts-level warranty windows per work-order line item (Phase 9).
--    expires_at is computed by a trigger because TIMESTAMPTZ + INTERVAL is
--    only STABLE (not IMMUTABLE), so GENERATED ALWAYS AS STORED cannot be used.
-- ---------------------------------------------------------------------------
create table if not exists warranties (
  id              uuid        primary key default uuid_generate_v4(),
  tenant_id       uuid        not null references tenants (id) on delete cascade,
  work_order_id   text        not null,  -- Prisma CUID from work_orders.id
  client_id       uuid        references clients (id) on delete set null,
  part_name       text        not null,
  part_number     text,
  supplier        text,
  installed_at    timestamptz not null default now(),
  warranty_months integer     not null default 12,
  expires_at      timestamptz,           -- computed by trigger below
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table warranties is
  'Parts-level warranty windows per work-order line item.';
comment on column warranties.expires_at is
  'Auto-computed by trg_warranties_compute_expires: installed_at + warranty_months months.';

create index if not exists idx_warranties_tenant_id
  on warranties (tenant_id);
create index if not exists idx_warranties_work_order_id
  on warranties (work_order_id);

-- Trigger function: TIMESTAMPTZ + INTERVAL is STABLE, not IMMUTABLE, so we
-- cannot use GENERATED ALWAYS AS STORED. A BEFORE trigger is the standard fix.
create or replace function compute_warranty_expires_at()
returns trigger language plpgsql as $$
begin
  new.expires_at := new.installed_at + (new.warranty_months * interval '1 month');
  return new;
end;
$$;

create trigger trg_warranties_compute_expires
  before insert or update of installed_at, warranty_months
  on warranties
  for each row
  execute function compute_warranty_expires_at();

create trigger trg_warranties_updated_at
  before update on warranties
  for each row execute function set_updated_at();
