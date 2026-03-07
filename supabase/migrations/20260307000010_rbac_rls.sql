-- =============================================================================
-- Migration: Multi-Tier RBAC & Row Level Security
-- Issue #59 — Phase 16
--
-- Adds a UserRole enum and user_roles table, then replaces the existing
-- tenant-scoped RLS policies on work_orders and clients with fine-grained
-- RBAC policies:
--
--   SHOP_OWNER   → SELECT/UPDATE all WorkOrders within their Tenant
--   FIELD_TECH   → SELECT/UPDATE only WorkOrders assigned directly to them
--   FLEET_CLIENT → SELECT (read-only) WorkOrders tied to their specific Client
--
-- Also adds:
--   • assigned_tech_id  on work_orders (links a WorkOrder to a FIELD_TECH)
--   • client_user_id    on clients     (links a Client row to a FLEET_CLIENT)
--   • BATCHED_PENDING_PAYMENT status   (Issue #61 — Batch Fleet Invoicing)
--   • has_damage_flag   on work_orders (Issue #62 — QA & Dispatch queue)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.  UserRole enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('SHOP_OWNER', 'FIELD_TECH', 'FLEET_CLIENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2.  user_roles table
--     One row per auth user, specifying their role and tenant/client scope.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID       PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role  NOT NULL DEFAULT 'SHOP_OWNER',
  -- For SHOP_OWNER and FIELD_TECH: the tenant they belong to.
  -- For FLEET_CLIENT: typically null (scope comes from clients.client_user_id).
  tenant_id  UUID       REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_roles_tenant_id_idx ON user_roles (tenant_id);

COMMENT ON TABLE user_roles IS
  'Maps each Supabase Auth user to their application role '
  '(SHOP_OWNER, FIELD_TECH, or FLEET_CLIENT).';

-- ---------------------------------------------------------------------------
-- 3.  Schema additions for role-based data scoping
-- ---------------------------------------------------------------------------

-- Link WorkOrders to the specific FIELD_TECH assigned to the job.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS assigned_tech_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN work_orders.assigned_tech_id IS
  'auth.uid() of the FIELD_TECH user assigned to this job. '
  'Used by RBAC RLS policies to enforce per-tech data isolation.';

-- Link a Client row to the Supabase Auth user who is the fleet portal user.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN clients.client_user_id IS
  'auth.uid() of the FLEET_CLIENT portal user associated with this client. '
  'Used by RBAC RLS to restrict read access to their own WorkOrders only.';

-- ---------------------------------------------------------------------------
-- 4.  BATCHED_PENDING_PAYMENT status  (Issue #61 — Batch Fleet Invoicing)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'BATCHED_PENDING_PAYMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5.  QA & Dispatch queue flag  (Issue #62)
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS has_damage_flag BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN work_orders.has_damage_flag IS
  'Set to TRUE by a FIELD_TECH when pre-existing damage is documented '
  'during the walkaround inspection. Drops the WorkOrder into the '
  'Shop Owner''s QA & Dispatch queue for liability review before billing.';

-- ---------------------------------------------------------------------------
-- 6.  Helper function — look up the current user's role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION current_user_role() IS
  'Returns the application role (SHOP_OWNER | FIELD_TECH | FLEET_CLIENT) of '
  'the currently authenticated user. Returns NULL when the user has no role '
  'assignment, which causes all RLS policies to deny access by default.';

-- ---------------------------------------------------------------------------
-- 7.  Drop existing broad tenant-isolation policies on work_orders & clients
-- ---------------------------------------------------------------------------

-- Remove the Phase-7 catch-all policy; replaced by per-command RBAC policies.
DROP POLICY IF EXISTS "work_orders_tenant_isolation" ON work_orders;
DROP POLICY IF EXISTS "clients_tenant_isolation"     ON clients;

-- ---------------------------------------------------------------------------
-- 8.  work_orders — RBAC SELECT policy
--
--   SHOP_OWNER   → all rows for their tenant
--   FIELD_TECH   → only rows assigned to them
--   FLEET_CLIENT → only rows belonging to their linked client
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_orders_select_rbac" ON work_orders;
CREATE POLICY "work_orders_select_rbac"
  ON work_orders FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
    OR (
      current_user_role() = 'FLEET_CLIENT'
      AND client_id IN (
        SELECT id FROM clients WHERE client_user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 9.  work_orders — RBAC INSERT policy
--
--   Only SHOP_OWNER (or service_role) may create WorkOrders.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_orders_insert_rbac" ON work_orders;
CREATE POLICY "work_orders_insert_rbac"
  ON work_orders FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 10. work_orders — RBAC UPDATE policy
--
--   SHOP_OWNER → any WorkOrder in their tenant
--   FIELD_TECH → only WorkOrders directly assigned to them
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_orders_update_rbac" ON work_orders;
CREATE POLICY "work_orders_update_rbac"
  ON work_orders FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND assigned_tech_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 11. work_orders — RBAC DELETE policy
--
--   Only SHOP_OWNER (or service_role) may delete WorkOrders.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_orders_delete_rbac" ON work_orders;
CREATE POLICY "work_orders_delete_rbac"
  ON work_orders FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 12. clients — RBAC SELECT policy
--
--   SHOP_OWNER   → all clients in their tenant
--   FIELD_TECH   → all clients in their tenant (read-only context for job data)
--   FLEET_CLIENT → only the client row linked to their auth user
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_select_rbac" ON clients;
CREATE POLICY "clients_select_rbac"
  ON clients FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FIELD_TECH'
      AND tenant_id = current_tenant_id()
    )
    OR (
      current_user_role() = 'FLEET_CLIENT'
      AND client_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 13. clients — RBAC mutate policy (INSERT / UPDATE / DELETE)
--
--   Only SHOP_OWNER (or service_role) may write client records.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_mutate_rbac" ON clients;
CREATE POLICY "clients_mutate_rbac"
  ON clients
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_user_role() = 'SHOP_OWNER'
      AND tenant_id = current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 14. user_roles — RLS (users may only read their own role row)
-- ---------------------------------------------------------------------------
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_read_own"       ON user_roles;
DROP POLICY IF EXISTS "user_roles_write_service"   ON user_roles;

CREATE POLICY "user_roles_read_own"
  ON user_roles FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Only the service role may insert / update / delete role assignments.
CREATE POLICY "user_roles_write_service"
  ON user_roles FOR ALL
  USING   (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- VERIFICATION INSTRUCTIONS
-- =============================================================================
--
-- Use the Supabase SQL editor to simulate queries under each role.
-- Replace placeholder UUIDs with real auth.users IDs from your project.
--
-- 1. SETUP: Create role assignments.
--
--    INSERT INTO user_roles (user_id, role, tenant_id) VALUES
--      ('<uid_owner>', 'SHOP_OWNER',   '<tenant_id>'),
--      ('<uid_tech>',  'FIELD_TECH',   '<tenant_id>');
--    INSERT INTO user_roles (user_id, role) VALUES
--      ('<uid_fleet>', 'FLEET_CLIENT');
--
--    -- Link the fleet client's auth user to their Client row.
--    UPDATE clients SET client_user_id = '<uid_fleet>' WHERE id = '<client_id>';
--
--    -- Assign a FIELD_TECH to a specific WorkOrder.
--    UPDATE work_orders SET assigned_tech_id = '<uid_tech>' WHERE id = '<wo_id>';
--
-- 2. VERIFY SHOP_OWNER — sees all tenant WorkOrders:
--
--    SET LOCAL role TO authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub": "<uid_owner>"}';
--    SELECT id, title, tenant_id FROM work_orders;
--    -- Expected: all WorkOrders belonging to '<tenant_id>'.
--
-- 3. VERIFY FIELD_TECH — sees only assigned WorkOrders:
--
--    SET LOCAL "request.jwt.claims" TO '{"sub": "<uid_tech>"}';
--    SELECT id, title, assigned_tech_id FROM work_orders;
--    -- Expected: only rows where assigned_tech_id = '<uid_tech>'.
--
-- 4. VERIFY FLEET_CLIENT — read-only access to their client's WorkOrders:
--
--    SET LOCAL "request.jwt.claims" TO '{"sub": "<uid_fleet>"}';
--    SELECT id, title, client_id FROM work_orders;
--    -- Expected: only rows where client_id = '<client_id>'.
--
--    UPDATE work_orders SET notes = 'test' WHERE id = '<wo_id>';
--    -- Expected: ERROR — policy "work_orders_update_rbac" denies FLEET_CLIENT writes.
--
-- =============================================================================
