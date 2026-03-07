-- =============================================================================
-- Phase 11 Migration — VIN Resolver, Fluid Capacities & Change Orders
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Issue #41 — Add fluid capacity & submodel fields to global_vehicles
-- ---------------------------------------------------------------------------
alter table global_vehicles
  add column if not exists oil_capacity_qts     numeric(4,2),
  add column if not exists oil_weight_oem       text,
  add column if not exists submodel_options_json jsonb not null default '[]'::jsonb;

comment on column global_vehicles.oil_capacity_qts is
  'Engine oil capacity in US quarts, e.g. 5.0';
comment on column global_vehicles.oil_weight_oem is
  'OEM-specified oil viscosity grade, e.g. "0W-20 Full Synthetic"';
comment on column global_vehicles.submodel_options_json is
  'Array of possible trim/engine combos returned by the VIN decoder, e.g.
   [{"engine":"1.5L Turbo","trim":"Sport","oil_capacity_qts":4.4,"oil_weight_oem":"0W-20 Full Synthetic"}]';

-- ---------------------------------------------------------------------------
-- Issue #45 — Extend work_order_status with BLOCKED_WAITING_APPROVAL
-- and add change-order support columns
-- ---------------------------------------------------------------------------
alter type work_order_status add value if not exists 'BLOCKED_WAITING_APPROVAL';

alter table work_orders
  add column if not exists customer_supplied_parts boolean not null default false,
  add column if not exists delta_parts_json        jsonb,
  add column if not exists delta_approval_token    uuid unique,
  add column if not exists pre_check_complete      boolean not null default false;

comment on column work_orders.customer_supplied_parts is
  'When true, parts are billed at cost (no retail markup). Liability flag shown.';
comment on column work_orders.delta_parts_json is
  'Change-order (DeltaQuote) parts added after initial APPROVED status.
   Same shape as parts_json: SelectedPart[].';
comment on column work_orders.delta_approval_token is
  'Unique token for the client to review and sign the DeltaQuote change order.';
comment on column work_orders.pre_check_complete is
  'True once the mandatory pre-inspection walkaround (Issue #43) is completed.';
