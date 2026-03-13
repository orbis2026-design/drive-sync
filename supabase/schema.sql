-- =============================================================================
-- DriveSync — PostgreSQL / Supabase Reference Schema
-- =============================================================================
-- Canonical schema reference matching the consolidated migration.
-- This file documents all tables, columns, enums, functions, and triggers.
-- It does NOT include RLS policies or pg_cron setup (those live in the migration).
--
-- Table hierarchy:
--   tenants
--     └─ clients               (tenant_id FK)
--     └─ global_vehicles       (shared lexicon, no tenant FK — append-only reference)
--         └─ tenant_vehicles   (client_id + global_vehicle_id + plate/VIN/mileage)
--             └─ work_orders   (tenant_vehicle_id FK)
--   user_roles                 (auth.users FK + tenants FK)
--   consumables                (tenant_id FK)
--   messages                   (tenant_id + client_id FK)
--   expenses                   (tenant_id FK)
--   user_passkeys              (auth.users FK)
--   warranties                 (tenant_id + client_id FK)
--   outbound_campaigns         (tenant_id + tenant_vehicle_id + client_id FK)
--   mechanic_settings          (auth.users FK)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type work_order_status as enum (
    'REQUESTED',
    'INTAKE',
    'ACTIVE',
    'PENDING_APPROVAL',
    'BLOCKED_WAITING_APPROVAL',
    'COMPLETE',
    'INVOICED',
    'PAID',
    'BATCHED_PENDING_PAYMENT',
    'CANCELLED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_role as enum ('SHOP_OWNER', 'FIELD_TECH', 'FLEET_CLIENT');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type outbound_campaign_status as enum ('QUEUED', 'SENT', 'FAILED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_status as enum ('ACTIVE', 'PAST_DUE', 'CANCELED');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: validate every element of a maintenance_schedule_json array.
-- Must be IMMUTABLE so Postgres allows it inside a CHECK constraint.
-- ---------------------------------------------------------------------------

create or replace function is_valid_maintenance_schedule(j jsonb)
  returns boolean
  language sql
  immutable
  strict
as $$
  select
    case
      when jsonb_typeof(j) <> 'array' then false
      when jsonb_array_length(j) = 0  then true
      else (
        select bool_and(
          jsonb_typeof(elem) = 'object'
          and (elem->>'mileage') is not null
          and (elem->>'mileage')::numeric > 0
          and jsonb_typeof(elem->'tasks') = 'array'
          and jsonb_array_length(elem->'tasks') > 0
        )
        from jsonb_array_elements(j) as elem
      )
    end
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: keep updated_at current on every row modification
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. tenants
--    Represents a single solo mechanic (or small shop) subscription.
--    All operational data is scoped to a tenant for full data isolation.
-- ---------------------------------------------------------------------------

create table if not exists tenants (
  id                  uuid                not null default gen_random_uuid() primary key,
  name                text                not null,
  slug                text                not null unique,
  email               text                unique,
  phone               text,
  owner_user_id       uuid                references auth.users(id) on delete set null,
  features_json       jsonb               not null default '{"inventory":true,"marketing":true,"fleet":true}'::jsonb,
  google_place_id     text,
  review_link         text,
  tax_matrix_json     jsonb               not null default '{
    "labor_tax_rate": 0.00,
    "parts_tax_rate": 0.085,
    "environmental_fee_flat": 5.00,
    "environmental_fee_percentage": 0.00
  }'::jsonb,
  stripe_customer_id  text                unique,
  subscription_status subscription_status not null default 'ACTIVE',
  qbo_realm_id        text,
  qbo_access_token    text,
  qbo_refresh_token   text,
  logo_url            text,
  onboarding_complete boolean             not null default false,
  created_at          timestamptz         not null default now(),
  updated_at          timestamptz         not null default now()
);

comment on table tenants is
  'Solo mechanics or small shops that subscribe to DriveSync.';
comment on column tenants.features_json is
  'Feature-flag map for tenant-level product toggles. '
  'Shape: { "inventory": bool, "marketing": bool, "fleet": bool }';
comment on column tenants.tax_matrix_json is
  'Shop-specific tax rules. Shape:
   {
     "labor_tax_rate": 0.00,
     "parts_tax_rate": 0.085,
     "environmental_fee_flat": 5.00,
     "environmental_fee_percentage": 0.00
   }
   environmental_fee_flat is appended when fluids appear in parts_json.';

create index if not exists tenants_stripe_customer_id_idx
  on tenants (stripe_customer_id)
  where stripe_customer_id is not null;

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. global_vehicles
--    The self-learning vehicle lexicon shared across ALL tenants.
--    Populated on first VIN decode/manual entry; enriched over time.
-- ---------------------------------------------------------------------------

create table if not exists global_vehicles (
  id                        uuid        not null default gen_random_uuid() primary key,
  year                      smallint    not null check (year between 1886 and 2100),
  make                      text        not null,
  model                     text        not null,
  vin                       text        unique,
  engine                    text,
  trim                      text,
  maintenance_schedule_json jsonb       not null default '[]'::jsonb
    constraint chk_maintenance_schedule_json_shape
    check (is_valid_maintenance_schedule(maintenance_schedule_json)),
  known_faults_json         jsonb       not null default '[]'::jsonb,
  last_tsb_sync             timestamptz,
  oil_capacity_qts          numeric(4,2),
  oil_weight_oem            text,
  submodel_options_json     jsonb       not null default '[]'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint uq_global_vehicle unique (year, make, model, engine)
);

comment on table global_vehicles is
  'Shared vehicle lexicon: year/make/model/engine + evolving maintenance and fault data.';
comment on column global_vehicles.vin is
  'Full 17-character Vehicle Identification Number. Populated by the Lexicon '
  'Extractor Worker on a cache-miss; NULL for rows created before Phase 14.';
comment on column global_vehicles.engine is
  'Engine descriptor returned by CarMD /decode, e.g. "2.5L 4-Cylinder DOHC".';
comment on column global_vehicles.trim is
  'Trim level returned by CarMD /decode, e.g. "Sport", "Limited".';
comment on column global_vehicles.known_faults_json is
  'Array of TSB objects: [{ bulletin_id, description, component }]. '
  'Cost fields (estimated labor, parts cost) are stripped before insertion.';
comment on column global_vehicles.last_tsb_sync is
  'Timestamp of the most recent TSB refresh from the CarMD /tsb endpoint. '
  'Updated by the pg_cron job.';
comment on column global_vehicles.oil_capacity_qts is
  'Engine oil capacity in US quarts, e.g. 5.0';
comment on column global_vehicles.oil_weight_oem is
  'OEM-specified oil viscosity grade, e.g. "0W-20 Full Synthetic"';
comment on column global_vehicles.submodel_options_json is
  'Array of possible trim/engine combos returned by the VIN decoder, e.g.
   [{"engine":"1.5L Turbo","trim":"Sport","oil_capacity_qts":4.4,"oil_weight_oem":"0W-20 Full Synthetic"}]';
comment on constraint chk_maintenance_schedule_json_shape on global_vehicles is
  'Enforces the Phase 14/15 canonical maintenance matrix shape: '
  '[{ "mileage": <positive int>, "tasks": ["<string>", ...] }]. '
  'Validated via the is_valid_maintenance_schedule() immutable function '
  'to satisfy the PostgreSQL prohibition on subqueries in CHECK constraints.';

create index if not exists idx_global_vehicles_vin
  on global_vehicles (vin)
  where vin is not null;

create trigger trg_global_vehicles_updated_at
  before update on global_vehicles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. clients
--    A customer of a specific tenant.
-- ---------------------------------------------------------------------------

create table if not exists clients (
  id                  uuid        not null default gen_random_uuid() primary key,
  tenant_id           uuid        not null references tenants (id) on delete cascade,
  first_name          text        not null,
  last_name           text        not null,
  email               text,
  phone               text        not null,
  notes               text,
  zip_code            text,
  is_commercial_fleet boolean     not null default false,
  client_user_id      uuid        references auth.users(id),
  opted_out_sms       boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  is_archived         boolean     not null default false
);

comment on table clients is
  'Vehicle owners / customers, scoped to a tenant.';
comment on column clients.zip_code is
  'Client ZIP code used for drive-time padding calculation between appointments.';
comment on column clients.is_commercial_fleet is
  'True for commercial accounts (e.g. plumbing company with 5 vans). '
  'Enables Fleet Dashboard and Batch Invoice features.';
comment on column clients.client_user_id is
  'auth.uid() of the FLEET_CLIENT portal user associated with this client. '
  'Used by RBAC RLS to restrict read access to their own WorkOrders only.';

create index if not exists idx_clients_tenant_id on clients (tenant_id);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. tenant_vehicles
--    Joins a client to a global_vehicle entry and adds per-unit details.
-- ---------------------------------------------------------------------------

create table if not exists tenant_vehicles (
  id                uuid        not null default gen_random_uuid() primary key,
  tenant_id         uuid        not null references tenants (id) on delete cascade,
  client_id         uuid        not null references clients (id) on delete cascade,
  global_vehicle_id uuid        not null references global_vehicles (id),
  license_plate     text,
  vin               text        unique check (vin is null or length(vin) = 17),
  mileage           integer     check (mileage >= 0),
  color             text,
  last_service_date date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table tenant_vehicles is
  'Links a client to a global_vehicle; stores per-unit details (plate, VIN, mileage).';
comment on column tenant_vehicles.last_service_date is
  'Date of the most recent completed service. Used by the retention cron to '
  'estimate days until the next scheduled interval.';

create index if not exists idx_tenant_vehicles_tenant_id         on tenant_vehicles (tenant_id);
create index if not exists idx_tenant_vehicles_client_id         on tenant_vehicles (client_id);
create index if not exists idx_tenant_vehicles_global_vehicle_id on tenant_vehicles (global_vehicle_id);

create trigger trg_tenant_vehicles_updated_at
  before update on tenant_vehicles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. work_orders
--    The core operational record for a job.
-- ---------------------------------------------------------------------------

-- Trigger function: rotate version_hash and enforce is_locked on update.
create or replace function rotate_work_order_version()
returns trigger language plpgsql as $$
begin
  new.version_hash := gen_random_uuid();
  if new.status in ('COMPLETE', 'INVOICED', 'PAID') then
    new.is_locked := true;
  end if;
  return new;
end;
$$;

create table if not exists work_orders (
  id                      uuid              not null default gen_random_uuid() primary key,
  tenant_id               uuid              not null references tenants (id) on delete cascade,
  tenant_vehicle_id       uuid              not null references tenant_vehicles (id) on delete cascade,
  status                  work_order_status not null default 'INTAKE',
  title                   text              not null,
  description             text              not null,
  notes                   text,
  mileage_at_intake       integer           check (mileage_at_intake >= 0),
  labor_cents             integer           not null default 0 check (labor_cents >= 0),
  parts_cents             integer           not null default 0 check (parts_cents >= 0),
  parts_cost_cents        integer           check (parts_cost_cents >= 0),
  scheduled_at            timestamptz,
  intake_photo_url        text,
  inspection_json         jsonb,
  parts_json              jsonb,
  customer_supplied_parts boolean           not null default false,
  delta_parts_json        jsonb,
  delta_approval_token    uuid              unique,
  pre_check_complete      boolean           not null default false,
  approval_token          uuid              unique,
  closed_at               timestamptz,
  payment_method          text,
  qbo_invoice_id          text,
  version_hash            uuid              not null default gen_random_uuid(),
  is_locked               boolean           not null default false,
  labor_json              jsonb,
  is_diagnostic           boolean           not null default false,
  diagnostic_fee_cents    integer           not null default 0 check (diagnostic_fee_cents >= 0),
  roll_diagnostic_fee     boolean           not null default false,
  assigned_tech_id        uuid              references auth.users(id),
  has_damage_flag         boolean           not null default false,
  created_at              timestamptz       not null default now(),
  updated_at              timestamptz       not null default now()
);

comment on table work_orders is
  'Operational job records linked to a tenant_vehicle.';
comment on column work_orders.parts_cost_cents is
  'Wholesale (COGS) cost of parts in cents. When NULL the analytics engine
   assumes a 55% cost ratio against parts_cents for gross-margin reporting.';
comment on column work_orders.scheduled_at is
  'Calendar appointment timestamp. NULL = unscheduled / backlog.';
comment on column work_orders.intake_photo_url is
  'Supabase Storage URL of the photo uploaded via the self-service intake wizard.';
comment on column work_orders.customer_supplied_parts is
  'When true, parts are billed at cost (no retail markup). Liability flag shown.';
comment on column work_orders.delta_parts_json is
  'Change-order (DeltaQuote) parts added after initial APPROVED status.
   Same shape as parts_json: SelectedPart[].';
comment on column work_orders.delta_approval_token is
  'Unique token for the client to review and sign the DeltaQuote change order.';
comment on column work_orders.pre_check_complete is
  'True once the mandatory pre-inspection walkaround (Issue #43) is completed.';
comment on column work_orders.version_hash is
  'Rotated on every server-side mutation. The offline sync engine compares
   this value before flushing local patches; a mismatch means a conflict.';
comment on column work_orders.is_locked is
  'Set to TRUE when the WorkOrder reaches COMPLETE or PAID status so that
   any offline patch targeting total_price, parts_json, or labor_json is
   rejected by the /api/sync endpoint.';
comment on column work_orders.labor_json is
  'Structured labour line-items. Shape: LaborLine[]:
   [{ "description": "Engine removal", "hours": 3.0 }]
   Populated by the Quote Builder; used for tax-matrix calculations.';
comment on column work_orders.is_diagnostic is
  'True when this work order was created via the Diagnostic-Only intake flow.';
comment on column work_orders.diagnostic_fee_cents is
  'Flat diagnostic fee charged upfront before any repair quote is issued.';
comment on column work_orders.roll_diagnostic_fee is
  'When true the diagnostic fee is credited against the final repair total.';
comment on column work_orders.assigned_tech_id is
  'auth.uid() of the FIELD_TECH user assigned to this job. '
  'Used by RBAC RLS policies to enforce per-tech data isolation.';
comment on column work_orders.has_damage_flag is
  'Set to TRUE by a FIELD_TECH when pre-existing damage is documented '
  'during the walkaround inspection. Drops the WorkOrder into the '
  'Shop Owner''s QA & Dispatch queue for liability review before billing.';

create index if not exists idx_work_orders_tenant_id         on work_orders (tenant_id);
create index if not exists idx_work_orders_tenant_vehicle_id on work_orders (tenant_vehicle_id);
create index if not exists idx_work_orders_status            on work_orders (tenant_id, status);
create index if not exists idx_work_orders_scheduled_at
  on work_orders (tenant_id, scheduled_at)
  where scheduled_at is not null;

create trigger trg_work_orders_version
  before update on work_orders
  for each row execute function rotate_work_order_version();

create trigger trg_work_orders_updated_at
  before update on work_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. user_roles
--    One row per auth user specifying their role and tenant scope.
-- ---------------------------------------------------------------------------

create table if not exists user_roles (
  user_id    uuid        not null primary key references auth.users(id) on delete cascade,
  role       user_role   not null default 'SHOP_OWNER',
  tenant_id  uuid        references tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_roles_tenant_id_idx on user_roles (tenant_id);

comment on table user_roles is
  'Maps each Supabase Auth user to their application role '
  '(SHOP_OWNER, FIELD_TECH, or FLEET_CLIENT).';

-- ---------------------------------------------------------------------------
-- Helper functions that depend on user_roles / tenants
-- ---------------------------------------------------------------------------

-- Resolves the tenant_id for the current authenticated user:
--   1. Via user_roles.tenant_id  (SHOP_OWNER / FIELD_TECH path)
--   2. Fallback: tenants.owner_user_id  (legacy / owner direct path)
create or replace function current_tenant_id()
returns uuid
language sql stable security definer
as $$
  select coalesce(
    (select tenant_id from user_roles where user_id = auth.uid() limit 1),
    (select id        from tenants     where owner_user_id = auth.uid() limit 1)
  );
$$;

create or replace function current_user_role()
returns user_role
language sql stable security definer
as $$
  select role from user_roles where user_id = auth.uid() limit 1;
$$;

comment on function current_user_role() is
  'Returns the application role (SHOP_OWNER | FIELD_TECH | FLEET_CLIENT) of '
  'the currently authenticated user. Returns NULL when the user has no role '
  'assignment, which causes all RLS policies to deny access by default.';

-- ---------------------------------------------------------------------------
-- 7. consumables
--    Bulk shop supplies tracked against completed jobs.
-- ---------------------------------------------------------------------------

create table if not exists consumables (
  id                  uuid        not null default gen_random_uuid() primary key,
  tenant_id           uuid        not null references tenants (id) on delete cascade,
  name                text        not null,
  unit                text        not null,
  current_stock       numeric     not null default 0 check (current_stock >= 0),
  low_stock_threshold numeric     not null default 5 check (low_stock_threshold >= 0),
  cost_per_unit_cents integer     not null default 0 check (cost_per_unit_cents >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table consumables is
  'Bulk shop supplies tracked against completed jobs to prevent profit leakage.';
comment on column consumables.current_stock is
  'Remaining stock in the named unit (e.g. 42.5 Quarts of 5W-30).';
comment on column consumables.low_stock_threshold is
  'Stock level below which a glowing red Low Stock badge is rendered in the UI.';

create index if not exists idx_consumables_tenant_id on consumables (tenant_id);

create trigger trg_consumables_updated_at
  before update on consumables
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. messages  (SMS inbox with Realtime)
-- ---------------------------------------------------------------------------

create table if not exists messages (
  id          uuid        not null default gen_random_uuid() primary key,
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  client_id   uuid        references clients(id) on delete set null,
  body        text        not null check (char_length(body) > 0 and char_length(body) <= 1600),
  direction   text        not null check (direction in ('INBOUND', 'OUTBOUND')),
  from_number text,
  created_at  timestamptz not null default now()
);

create index if not exists messages_tenant_id_idx on messages (tenant_id, created_at desc);
create index if not exists messages_client_id_idx on messages (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. expenses  (OCR receipt tracker)
-- ---------------------------------------------------------------------------

create table if not exists expenses (
  id                uuid           not null default gen_random_uuid() primary key,
  tenant_id         uuid           not null references tenants(id) on delete cascade,
  amount            numeric(10, 2) not null check (amount > 0),
  vendor            text           not null,
  category          text           not null default 'General',
  receipt_image_url text,
  created_at        timestamptz    not null default now()
);

create index if not exists expenses_tenant_id_idx on expenses (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. user_passkeys  (WebAuthn credential store)
-- ---------------------------------------------------------------------------

create table if not exists user_passkeys (
  id             uuid        not null default gen_random_uuid() primary key,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  credential_id  text        not null unique,
  public_key_der text        not null,
  device_label   text,
  created_at     timestamptz not null default now()
);

create index if not exists user_passkeys_user_id_idx on user_passkeys (user_id);

-- ---------------------------------------------------------------------------
-- 11. warranties  (parts-level warranty windows)
-- ---------------------------------------------------------------------------

create or replace function compute_warranty_expires_at()
returns trigger language plpgsql as $$
begin
  new.expires_at := new.installed_at + (new.warranty_months * interval '1 month');
  return new;
end;
$$;

create table if not exists warranties (
  id              uuid        not null default gen_random_uuid() primary key,
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  work_order_id   text        not null,
  client_id       uuid        references clients(id) on delete set null,
  part_name       text        not null,
  part_number     text,
  supplier        text,
  installed_at    timestamptz not null default now(),
  warranty_months integer     not null default 12,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table warranties is
  'Parts-level warranty windows per work-order line item.';
comment on column warranties.expires_at is
  'Auto-computed by trg_warranties_compute_expires: installed_at + warranty_months months.';

create index if not exists warranties_tenant_id_idx     on warranties(tenant_id);
create index if not exists warranties_work_order_id_idx on warranties(work_order_id);

create trigger trg_warranties_compute_expires
  before insert or update of installed_at, warranty_months
  on warranties
  for each row
  execute function compute_warranty_expires_at();

create trigger trg_warranties_updated_at
  before update on warranties
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. work_order_documents  (contract / inspection / invoice PDFs per job)
-- ---------------------------------------------------------------------------

create table if not exists work_order_documents (
  id            uuid        not null default gen_random_uuid() primary key,
  tenant_id     uuid        not null references tenants(id) on delete cascade,
  work_order_id uuid        not null references work_orders(id) on delete cascade,
  type          text        not null,
  storage_key   text        not null,
  bucket        text        not null default 'contracts',
  filename      text        not null,
  metadata_json jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists work_order_documents_tenant_id_idx
  on work_order_documents (tenant_id, created_at desc);

create index if not exists work_order_documents_work_order_id_idx
  on work_order_documents (work_order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 12. outbound_campaigns  (SMS retention send queue)
-- ---------------------------------------------------------------------------

create table if not exists outbound_campaigns (
  id                uuid                     not null default gen_random_uuid() primary key,
  tenant_id         uuid                     not null references tenants (id) on delete cascade,
  tenant_vehicle_id uuid                     not null references tenant_vehicles (id) on delete cascade,
  client_id         uuid                     not null references clients (id) on delete cascade,
  to_phone          text                     not null,
  message_body      text                     not null,
  service_name      text                     not null,
  miles_until_due   integer,
  days_until_due    integer,
  status            outbound_campaign_status not null default 'QUEUED',
  sent_at           timestamptz,
  created_at        timestamptz              not null default now(),
  updated_at        timestamptz              not null default now()
);

comment on table outbound_campaigns is
  'SMS retention messages queued by the daily cron job for Twilio dispatch.';
comment on column outbound_campaigns.to_phone is
  'Destination phone in E.164 format as required by Twilio.';
comment on column outbound_campaigns.message_body is
  'Fully rendered SMS text ready to POST to the Twilio Messages API.';

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
-- 13. work_order_events  (job timeline events)
-- ---------------------------------------------------------------------------

create table if not exists work_order_events (
  id            uuid                not null default gen_random_uuid() primary key,
  tenant_id     uuid                not null references tenants(id) on delete cascade,
  work_order_id uuid                not null references work_orders(id) on delete cascade,
  scope         text                not null,
  stage         work_order_status   not null,
  kind          text                not null,
  title         text                not null,
  body          text,
  metadata_json jsonb,
  author_user_id uuid               references auth.users(id) on delete set null,
  created_at    timestamptz         not null default now()
);

create index if not exists work_order_events_tenant_id_idx
  on work_order_events (tenant_id, work_order_id, created_at desc);

alter table work_order_events enable row level security;

drop policy if exists "work_order_events_tenant_isolation" on work_order_events;

create policy "work_order_events_tenant_isolation"
  on work_order_events for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 14. mechanic_settings  (per-mechanic billing preferences)
-- ---------------------------------------------------------------------------

create table if not exists mechanic_settings (
  id               bigserial     primary key,
  user_id          uuid          not null unique references auth.users (id) on delete cascade,
  labor_rate_cents integer       not null default 12000,
  parts_tax_rate   numeric(6, 4) not null default 0.0875,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

create index if not exists mechanic_settings_user_id_idx on mechanic_settings (user_id);

create trigger trg_mechanic_settings_updated_at
  before update on mechanic_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: top-N most-referenced GlobalVehicle IDs  (for TSB sync)
-- ---------------------------------------------------------------------------

create or replace function get_top_referenced_global_vehicle_ids(
  p_limit integer default 100
)
returns table (global_vehicle_id uuid, reference_count bigint)
language sql stable security definer
as $$
  select
    v.global_vehicle_id,
    count(*) as reference_count
  from tenant_vehicles v
  where v.global_vehicle_id is not null
  group by v.global_vehicle_id
  order by reference_count desc
  limit p_limit;
$$;

comment on function get_top_referenced_global_vehicle_ids(integer) is
  'Returns the top-N GlobalVehicle IDs ordered by the number of tenant '
  'vehicles that reference them. Used by the TSB sync cron job.';

-- ---------------------------------------------------------------------------
-- TSB sync procedure
-- ---------------------------------------------------------------------------

create or replace procedure run_tsb_sync()
language plpgsql security definer
as $$
declare
  edge_fn_url text;
  payload     jsonb;
  gv_ids      uuid[] := '{}';
begin
  select array_agg(t.global_vehicle_id order by t.reference_count desc)
    into gv_ids
  from get_top_referenced_global_vehicle_ids(100) t;

  if gv_ids is null or array_length(gv_ids, 1) = 0 then
    raise notice 'TSB sync: no global_vehicle_id references found; skipping.';
    return;
  end if;

  edge_fn_url := current_setting('app.supabase_url', true)
                 || '/functions/v1/sync-tsb';

  payload := jsonb_build_object('vehicle_ids', to_jsonb(gv_ids));

  perform extensions.http_post(
    edge_fn_url,
    payload::text,
    'application/json'
  );

  raise notice 'TSB sync: triggered Edge Function for % vehicles.', array_length(gv_ids, 1);
end;
$$;

comment on procedure run_tsb_sync() is
  'Calls the sync-tsb Edge Function with the top-100 most-referenced '
  'GlobalVehicle IDs so that known_faults_json and last_tsb_sync are kept '
  'current without manual intervention. Invoked by pg_cron every 6 months.';
