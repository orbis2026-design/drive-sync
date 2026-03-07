-- =============================================================================
-- Migration: outbound_campaigns + tenant_vehicles.last_service_date
-- =============================================================================
-- Adds the last_service_date column to tenant_vehicles so the retention cron
-- can estimate how close a vehicle is to its next scheduled service interval.
-- Creates the outbound_campaigns table used as the SMS send queue.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add last_service_date to tenant_vehicles
--    Records the date of the most recent completed service for this vehicle.
--    Used by the retention cron to compute time-based service proximity.
-- ---------------------------------------------------------------------------
alter table tenant_vehicles
  add column if not exists last_service_date date;

comment on column tenant_vehicles.last_service_date is
  'Date of the most recent completed service. Used by the retention cron to '
  'estimate days until the next scheduled interval.';

-- ---------------------------------------------------------------------------
-- 2. outbound_campaign_status enum
-- ---------------------------------------------------------------------------
do $$ begin
  create type outbound_campaign_status as enum ('QUEUED', 'SENT', 'FAILED');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. outbound_campaigns
--    SMS send queue written by the daily retention cron job.
--    Each row represents one personalized message ready for Twilio dispatch.
-- ---------------------------------------------------------------------------
create table if not exists outbound_campaigns (
  id                uuid                      primary key default gen_random_uuid(),
  tenant_id         uuid                      not null references tenants (id) on delete cascade,
  tenant_vehicle_id uuid                      not null references tenant_vehicles (id) on delete cascade,
  client_id         uuid                      not null references clients (id) on delete cascade,
  -- Destination phone number in E.164 format (e.g. "+15105551234").
  to_phone          text                      not null,
  -- Pre-rendered SMS body ready for Twilio's Messages API.
  message_body      text                      not null,
  -- Which maintenance task triggered this message (e.g. "Oil Change").
  service_name      text                      not null,
  -- Estimated miles remaining before service is due (may be negative = overdue).
  miles_until_due   integer,
  -- Estimated days remaining before service is due (may be negative = overdue).
  days_until_due    integer,
  status            outbound_campaign_status  not null default 'QUEUED',
  -- Timestamp set by the sender worker when the message is dispatched.
  sent_at           timestamptz,
  created_at        timestamptz               not null default now(),
  updated_at        timestamptz               not null default now()
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

-- updated_at trigger
create trigger trg_outbound_campaigns_updated_at
  before update on outbound_campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
--    Tenant isolation: each row is visible only to the owning tenant.
-- ---------------------------------------------------------------------------
alter table outbound_campaigns enable row level security;

drop policy if exists "outbound_campaigns_tenant_isolation" on outbound_campaigns;

create policy "outbound_campaigns_tenant_isolation"
  on outbound_campaigns for all
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
