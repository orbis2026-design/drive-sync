-- 20260309002000_work_order_events.sql
-- Work order timeline events (notes, forms, media, system events).

create table if not exists work_order_events (
  id            uuid                not null default gen_random_uuid() primary key,
  tenant_id     uuid                not null references tenants(id) on delete cascade,
  work_order_id uuid                not null references work_orders(id) on delete cascade,
  scope         text                not null, -- CLIENT | VEHICLE | WORK_ORDER
  stage         work_order_status   not null,
  kind          text                not null, -- NOTE | FORM | MEDIA | SYSTEM
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

