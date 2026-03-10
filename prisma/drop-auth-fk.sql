-- Run this once in your database (e.g. Supabase SQL Editor) so Prisma can use
-- db push / migrate without managing the auth schema. Columns remain; only
-- DB-level FKs to auth.users are removed (app still stores the UIDs).
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_client_user_id_fkey;
ALTER TABLE public.mechanic_settings
  DROP CONSTRAINT IF EXISTS mechanic_settings_user_id_fkey;
ALTER TABLE public.shop_messages
  DROP CONSTRAINT IF EXISTS shop_messages_user_id_fkey;
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_owner_user_id_fkey;
ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_assigned_tech_id_fkey;
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_passkeys
  DROP CONSTRAINT IF EXISTS user_passkeys_user_id_fkey;
