-- =============================================================================
-- Phase 13 Migration — Enterprise Liability & Edge-Case Architecture
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Issue #50 — Offline Collision & Version Control Lock
-- Add version_hash and is_locked to work_orders so the sync engine can
-- detect and reject stale offline writes on legally approved contracts.
-- ---------------------------------------------------------------------------
alter table work_orders
  add column if not exists version_hash uuid    not null default gen_random_uuid(),
  add column if not exists is_locked    boolean not null default false;

comment on column work_orders.version_hash is
  'Rotated on every server-side mutation. The offline sync engine compares
   this value before flushing local patches; a mismatch means a conflict.';
comment on column work_orders.is_locked is
  'Set to TRUE when the WorkOrder reaches COMPLETE or PAID status so that
   any offline patch targeting total_price, parts_json, or labor_json is
   rejected by the /api/sync endpoint.';

-- Automatically rotate version_hash and set is_locked on every update.
create or replace function rotate_work_order_version()
returns trigger language plpgsql as $$
begin
  new.version_hash := gen_random_uuid();
  -- Lock the work order once it reaches a legally approved state.
  if new.status in ('COMPLETE', 'INVOICED', 'PAID') then
    new.is_locked := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_orders_version on work_orders;
create trigger trg_work_orders_version
  before update on work_orders
  for each row execute function rotate_work_order_version();

-- ---------------------------------------------------------------------------
-- Issue #51 — Complex Tax & Environmental Fee Matrix
-- Add tax_matrix_json to tenants so each shop can define precise rules for
-- labor vs. parts taxation and flat/percentage environmental fees.
-- ---------------------------------------------------------------------------
alter table tenants
  add column if not exists tax_matrix_json jsonb not null default '{
    "labor_tax_rate": 0.00,
    "parts_tax_rate": 0.085,
    "environmental_fee_flat": 5.00,
    "environmental_fee_percentage": 0.00
  }'::jsonb;

comment on column tenants.tax_matrix_json is
  'Shop-specific tax rules. Shape:
   {
     "labor_tax_rate": 0.00,
     "parts_tax_rate": 0.085,
     "environmental_fee_flat": 5.00,
     "environmental_fee_percentage": 0.00
   }
   environmental_fee_flat is appended when fluids appear in parts_json.';

-- ---------------------------------------------------------------------------
-- Issue #52 — Supplemental Change Order (Broken Bolt)
-- Add labor_json column to track structured labor line items separately from
-- the flat laborCents total, enabling the DeltaQuote supplemental workflow.
-- ---------------------------------------------------------------------------
alter table work_orders
  add column if not exists labor_json jsonb;

comment on column work_orders.labor_json is
  'Structured labour line-items. Shape: LaborLine[]:
   [{ "description": "Engine removal", "hours": 3.0 }]
   Populated by the Quote Builder; used for tax-matrix calculations.';

-- ---------------------------------------------------------------------------
-- Issue #53 — Diagnostic-Only Intake
-- Add is_diagnostic and diagnostic_fee_cents columns so the parallel intake
-- flow can be stored without affecting the standard quote workflow.
-- ---------------------------------------------------------------------------
alter table work_orders
  add column if not exists is_diagnostic       boolean not null default false,
  add column if not exists diagnostic_fee_cents integer not null default 0
    check (diagnostic_fee_cents >= 0),
  add column if not exists roll_diagnostic_fee boolean not null default false;

comment on column work_orders.is_diagnostic is
  'True when this work order was created via the Diagnostic-Only intake flow.';
comment on column work_orders.diagnostic_fee_cents is
  'Flat diagnostic fee charged upfront before any repair quote is issued.';
comment on column work_orders.roll_diagnostic_fee is
  'When true the diagnostic fee is credited against the final repair total.';
