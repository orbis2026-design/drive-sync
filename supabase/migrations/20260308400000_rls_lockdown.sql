-- =============================================================================
-- Phase 26: Airtight RLS Lockdown (Issue #99)
--
-- Ensures every table listed below has Row Level Security explicitly enabled
-- and carries full CRUD policies tied to the authenticated user's tenant.
--
-- Tables with tenant-scoped CRUD:
--   tenants, clients, work_orders, consumables (Inventory), shop_messages
--
-- Tables with read-only (SELECT) access for authenticated users:
--   global_vehicles, promo_codes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Re-enable RLS on all target tables (idempotent; safe to run multiple times)
-- ---------------------------------------------------------------------------

ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- tenants
-- The owner_user_id column IS the link between auth.uid() and the tenant row.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select_own"   ON tenants;
DROP POLICY IF EXISTS "tenants_insert_own"   ON tenants;
DROP POLICY IF EXISTS "tenants_update_own"   ON tenants;
DROP POLICY IF EXISTS "tenants_delete_own"   ON tenants;

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "tenants_insert_own"
  ON tenants FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tenants_update_own"
  ON tenants FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tenants_delete_own"
  ON tenants FOR DELETE
  USING (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- clients
-- Scoped via current_tenant_id() which resolves the caller's tenant from
-- their user_roles row, supporting both SHOP_OWNER and FIELD_TECH paths.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "clients_select_rbac"  ON clients;
DROP POLICY IF EXISTS "clients_insert_rbac"  ON clients;
DROP POLICY IF EXISTS "clients_update_rbac"  ON clients;
DROP POLICY IF EXISTS "clients_delete_rbac"  ON clients;
DROP POLICY IF EXISTS "clients_mutate_rbac"  ON clients;

CREATE POLICY "clients_select_rbac"
  ON clients FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "clients_insert_rbac"
  ON clients FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "clients_update_rbac"
  ON clients FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "clients_delete_rbac"
  ON clients FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- work_orders (WorkOrders)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "work_orders_select_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_insert_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_update_rbac" ON work_orders;
DROP POLICY IF EXISTS "work_orders_delete_rbac" ON work_orders;

CREATE POLICY "work_orders_select_rbac"
  ON work_orders FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "work_orders_insert_rbac"
  ON work_orders FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "work_orders_update_rbac"
  ON work_orders FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "work_orders_delete_rbac"
  ON work_orders FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- consumables (Inventory)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "consumables_tenant_isolation" ON consumables;
DROP POLICY IF EXISTS "consumables_select"           ON consumables;
DROP POLICY IF EXISTS "consumables_insert"           ON consumables;
DROP POLICY IF EXISTS "consumables_update"           ON consumables;
DROP POLICY IF EXISTS "consumables_delete"           ON consumables;

CREATE POLICY "consumables_select"
  ON consumables FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "consumables_insert"
  ON consumables FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "consumables_update"
  ON consumables FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "consumables_delete"
  ON consumables FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- shop_messages (ShopMessages)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "shop_messages_select_own_tenant" ON shop_messages;
DROP POLICY IF EXISTS "shop_messages_insert_own_tenant" ON shop_messages;
DROP POLICY IF EXISTS "shop_messages_update_own_tenant" ON shop_messages;
DROP POLICY IF EXISTS "shop_messages_delete_own_tenant" ON shop_messages;

CREATE POLICY "shop_messages_select_own_tenant"
  ON shop_messages FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "shop_messages_insert_own_tenant"
  ON shop_messages FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = auth.uid());

CREATE POLICY "shop_messages_update_own_tenant"
  ON shop_messages FOR UPDATE
  USING (tenant_id = current_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = auth.uid());

CREATE POLICY "shop_messages_delete_own_tenant"
  ON shop_messages FOR DELETE
  USING (tenant_id = current_tenant_id() AND user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- global_vehicles (GlobalVehicles) — read-only Lexicon for authenticated users
-- Writes are reserved for service-role (the Lexicon ingestion CRON job).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "global_vehicles_read_authenticated"  ON global_vehicles;
DROP POLICY IF EXISTS "global_vehicles_write_service_role"  ON global_vehicles;

CREATE POLICY "global_vehicles_read_authenticated"
  ON global_vehicles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service-role bypasses RLS entirely, so no explicit write policy is needed.
-- The DROP above removes any stale write-permissive policy just in case.

-- ---------------------------------------------------------------------------
-- promo_codes — read-only for authenticated users (Lexicon-style access)
-- Writes are performed exclusively by service-role (admin seeding).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "promo_codes_read_authenticated" ON promo_codes;

CREATE POLICY "promo_codes_read_authenticated"
  ON promo_codes FOR SELECT
  USING (auth.uid() IS NOT NULL);
