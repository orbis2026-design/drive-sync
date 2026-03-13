drop extension if exists "pg_net";

alter table "public"."clients" drop constraint "clients_client_user_id_fkey";

alter table "public"."clients" drop constraint "clients_tenant_id_fkey";

alter table "public"."consumables" drop constraint "consumables_tenant_id_fkey";

alter table "public"."expenses" drop constraint "expenses_tenant_id_fkey";

alter table "public"."mechanic_settings" drop constraint "mechanic_settings_user_id_fkey";

alter table "public"."messages" drop constraint "messages_client_id_fkey";

alter table "public"."messages" drop constraint "messages_tenant_id_fkey";

alter table "public"."outbound_campaigns" drop constraint "outbound_campaigns_client_id_fkey";

alter table "public"."outbound_campaigns" drop constraint "outbound_campaigns_tenant_id_fkey";

alter table "public"."outbound_campaigns" drop constraint "outbound_campaigns_tenant_vehicle_id_fkey";

alter table "public"."shop_messages" drop constraint "shop_messages_tenant_id_fkey";

alter table "public"."shop_messages" drop constraint "shop_messages_user_id_fkey";

alter table "public"."tenant_vehicles" drop constraint "tenant_vehicles_client_id_fkey";

alter table "public"."tenant_vehicles" drop constraint "tenant_vehicles_global_vehicle_id_fkey";

alter table "public"."tenant_vehicles" drop constraint "tenant_vehicles_tenant_id_fkey";

alter table "public"."tenants" drop constraint "tenants_owner_user_id_fkey";

alter table "public"."user_passkeys" drop constraint "user_passkeys_user_id_fkey";

alter table "public"."user_roles" drop constraint "user_roles_tenant_id_fkey";

alter table "public"."user_roles" drop constraint "user_roles_user_id_fkey";

alter table "public"."warranties" drop constraint "warranties_client_id_fkey";

alter table "public"."warranties" drop constraint "warranties_tenant_id_fkey";

alter table "public"."work_orders" drop constraint "work_orders_assigned_tech_id_fkey";

alter table "public"."work_orders" drop constraint "work_orders_tenant_id_fkey";

alter table "public"."work_orders" drop constraint "work_orders_tenant_vehicle_id_fkey";

alter table "public"."consumables" drop constraint "consumables_current_stock_check";

alter table "public"."consumables" drop constraint "consumables_low_stock_threshold_check";

drop index if exists "public"."idx_global_vehicles_vin";

drop index if exists "public"."idx_outbound_campaigns_status";

drop index if exists "public"."idx_outbound_campaigns_tenant_vehicle_id";

drop index if exists "public"."idx_tenant_vehicles_global_vehicle_id";

drop index if exists "public"."idx_work_orders_tenant_vehicle_id";

drop index if exists "public"."tenants_stripe_customer_id_idx";

alter table "public"."outbound_campaigns" alter column "status" drop default;

alter type "public"."outbound_campaign_status" rename to "outbound_campaign_status__old_version_to_be_dropped";

create type "public"."outbound_campaign_status" as enum ('QUEUED', 'SENT', 'FAILED', 'DISCARDED');

alter table "public"."outbound_campaigns" alter column status type "public"."outbound_campaign_status" using status::text::"public"."outbound_campaign_status";

alter table "public"."outbound_campaigns" alter column "status" set default 'QUEUED'::public.outbound_campaign_status;

drop type "public"."outbound_campaign_status__old_version_to_be_dropped";

alter table "public"."clients" drop column "notes";

alter table "public"."clients" add column "is_archived" boolean not null default false;

alter table "public"."clients" alter column "client_user_id" set data type text using "client_user_id"::text;

alter table "public"."clients" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."clients" alter column "id" drop default;

alter table "public"."clients" alter column "updated_at" drop default;

alter table "public"."clients" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."consumables" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."consumables" alter column "current_stock" set data type double precision using "current_stock"::double precision;

alter table "public"."consumables" alter column "id" drop default;

alter table "public"."consumables" alter column "low_stock_threshold" set data type double precision using "low_stock_threshold"::double precision;

alter table "public"."consumables" alter column "updated_at" drop default;

alter table "public"."consumables" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."global_vehicles" drop column "last_tsb_sync";

alter table "public"."global_vehicles" add column "yearEnd" integer;

alter table "public"."global_vehicles" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."global_vehicles" alter column "id" drop default;

alter table "public"."global_vehicles" alter column "oil_capacity_qts" set data type double precision using "oil_capacity_qts"::double precision;

alter table "public"."global_vehicles" alter column "updated_at" drop default;

alter table "public"."global_vehicles" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."global_vehicles" alter column "year" set data type integer using "year"::integer;

alter table "public"."outbound_campaigns" add column "audience" text;

alter table "public"."outbound_campaigns" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."outbound_campaigns" alter column "id" drop default;

alter table "public"."outbound_campaigns" alter column "sent_at" set data type timestamp(3) without time zone using "sent_at"::timestamp(3) without time zone;

alter table "public"."outbound_campaigns" alter column "updated_at" drop default;

alter table "public"."outbound_campaigns" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."promo_codes" drop column "duration_months";

alter table "public"."promo_codes" add column "durationMonths" integer;

alter table "public"."promo_codes" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."promo_codes" alter column "id" drop default;

alter table "public"."tenant_vehicles" drop column "last_service_date";

alter table "public"."tenant_vehicles" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."tenant_vehicles" alter column "global_vehicle_id" drop not null;

alter table "public"."tenant_vehicles" alter column "id" drop default;

alter table "public"."tenant_vehicles" alter column "updated_at" drop default;

alter table "public"."tenant_vehicles" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."tenant_vehicles" alter column "year" set data type integer using "year"::integer;

alter table "public"."tenants" drop column "logo_url";

alter table "public"."tenants" drop column "phone";

alter table "public"."tenants" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."tenants" alter column "updated_at" drop default;

alter table "public"."tenants" alter column "updated_at" set data type timestamp(3) without time zone using "updated_at"::timestamp(3) without time zone;

alter table "public"."user_roles" alter column "created_at" set data type timestamp(3) without time zone using "created_at"::timestamp(3) without time zone;

alter table "public"."work_orders" add column "is_archived" boolean not null default false;

alter table "public"."consumables" add constraint "consumables_current_stock_check" CHECK ((current_stock >= ((0)::numeric)::double precision)) not valid;

alter table "public"."consumables" validate constraint "consumables_current_stock_check";

alter table "public"."consumables" add constraint "consumables_low_stock_threshold_check" CHECK ((low_stock_threshold >= ((0)::numeric)::double precision)) not valid;

alter table "public"."consumables" validate constraint "consumables_low_stock_threshold_check";


