-- =============================================================================
-- Migration: Phase 6 — Operations & Expansion
-- =============================================================================
-- Adds support for:
--   #18 Touch-First Calendar     → work_orders.scheduled_at
--   #19 Client Intake Link        → REQUESTED status, intake_photo_url
--   #20 Consumables Tracker       → consumables table
--   #21 Fleet Management          → clients.is_commercial_fleet, zip_code
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add REQUESTED to work_order_status enum
--    Represents customer self-submitted requests awaiting shop review.
-- ---------------------------------------------------------------------------
do $$ begin
  alter type work_order_status add value if not exists 'REQUESTED' before 'INTAKE';
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Add scheduled_at to work_orders
--    Stores the calendar appointment datetime for the job.
-- ---------------------------------------------------------------------------
alter table work_orders
  add column if not exists scheduled_at timestamptz;

comment on column work_orders.scheduled_at is
  'Calendar appointment timestamp. NULL = unscheduled / backlog.';

create index if not exists idx_work_orders_scheduled_at
  on work_orders (tenant_id, scheduled_at)
  where scheduled_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Add intake_photo_url to work_orders
--    Supabase Storage public URL of photo submitted via the client intake link.
-- ---------------------------------------------------------------------------
alter table work_orders
  add column if not exists intake_photo_url text;

comment on column work_orders.intake_photo_url is
  'Supabase Storage URL of the photo uploaded via the self-service intake wizard.';

-- ---------------------------------------------------------------------------
-- 4. Add fleet & ZIP fields to clients
-- ---------------------------------------------------------------------------
alter table clients
  add column if not exists zip_code            text,
  add column if not exists is_commercial_fleet boolean not null default false;

comment on column clients.zip_code is
  'Client ZIP code used for drive-time padding calculation between appointments.';
comment on column clients.is_commercial_fleet is
  'True for commercial accounts (e.g. plumbing company with 5 vans). '
  'Enables Fleet Dashboard and Batch Invoice features.';

-- ---------------------------------------------------------------------------
-- 5. consumables
--    Tracks bulk shop supplies (oil drums, brake cleaner cases, shop rags, etc.)
--    Stock is auto-deducted when a WorkOrder is marked PAID based on the
--    vehicle's oil capacity stored in global_vehicles.maintenance_schedule_json.
-- ---------------------------------------------------------------------------
create table if not exists consumables (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references tenants (id) on delete cascade,
  name                text        not null,       -- e.g. "5W-30 Synthetic"
  unit                text        not null,       -- e.g. "Quart", "Can", "Sheet"
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

create index if not exists idx_consumables_tenant_id
  on consumables (tenant_id);

create trigger trg_consumables_updated_at
  before update on consumables
  for each row execute function set_updated_at();
