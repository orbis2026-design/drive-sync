-- =============================================================================
-- Migration: Multi-Tenant RLS Security Hardening
-- Issue #27 — Phase 7
--
-- This migration enables strict Row-Level Security on every tenant-scoped
-- table so that a user can ONLY access rows belonging to their own shop.
-- GlobalVehicles is read-only for all authenticated users but write-only
-- for the service role.
--
-- Also adds the Messages and Expenses tables required by issues #24 and #26.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.  Messages table  (Issue #24)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  body         TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 1600),
  direction    TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  from_number  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_tenant_id_idx
  ON messages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_client_id_idx
  ON messages (client_id, created_at DESC);

-- Enable Realtime for the messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ---------------------------------------------------------------------------
-- 2.  Expenses table  (Issue #26)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount              NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  vendor              TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'General',
  receipt_image_url   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_tenant_id_idx
  ON expenses (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3.  user_passkeys table  (Issue #25 — WebAuthn credential store)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_passkeys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id    TEXT NOT NULL UNIQUE,
  public_key_der   TEXT NOT NULL,
  device_label     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx
  ON user_passkeys (user_id);

-- ---------------------------------------------------------------------------
-- 4.  Enable RLS on every tenant-scoped table
-- ---------------------------------------------------------------------------

ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passkeys    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5.  Helper function: resolve the tenant_id for the current authenticated user
--
--     Each row in the `tenants` table is linked to an auth.uid() via the
--     `owner_user_id` column (added below if it doesn't already exist).
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 6.  tenants — each mechanic can only manage their own shop
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select_own"  ON tenants;
DROP POLICY IF EXISTS "tenants_update_own"  ON tenants;

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "tenants_update_own"
  ON tenants FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7.  clients
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "clients_tenant_isolation" ON clients;

CREATE POLICY "clients_tenant_isolation"
  ON clients FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 8.  tenant_vehicles
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenant_vehicles_tenant_isolation" ON tenant_vehicles;

CREATE POLICY "tenant_vehicles_tenant_isolation"
  ON tenant_vehicles FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 9.  work_orders
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "work_orders_tenant_isolation" ON work_orders;

CREATE POLICY "work_orders_tenant_isolation"
  ON work_orders FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 10. outbound_campaigns
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "outbound_campaigns_tenant_isolation" ON outbound_campaigns;

CREATE POLICY "outbound_campaigns_tenant_isolation"
  ON outbound_campaigns FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 11. consumables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "consumables_tenant_isolation" ON consumables;

CREATE POLICY "consumables_tenant_isolation"
  ON consumables FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 12. messages
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "messages_tenant_isolation" ON messages;

CREATE POLICY "messages_tenant_isolation"
  ON messages FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 13. expenses
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expenses_tenant_isolation" ON expenses;

CREATE POLICY "expenses_tenant_isolation"
  ON expenses FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 14. global_vehicles — read-only for all authenticated users;
--     INSERT/UPDATE/DELETE restricted to service role only.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "global_vehicles_read_authenticated"   ON global_vehicles;
DROP POLICY IF EXISTS "global_vehicles_write_service_role"   ON global_vehicles;

-- Any authenticated user may SELECT
CREATE POLICY "global_vehicles_read_authenticated"
  ON global_vehicles FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Only the service role may write (no policy = deny for regular users)
-- Service-role bypasses RLS by default when using the admin client, so no
-- explicit write policy is needed; we explicitly block regular users:
CREATE POLICY "global_vehicles_write_service_role"
  ON global_vehicles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 15. user_passkeys — each user can only manage their own credentials
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_passkeys_own" ON user_passkeys;

CREATE POLICY "user_passkeys_own"
  ON user_passkeys FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 16. Service-role bypass comment
--
--     The admin Supabase client (created with SUPABASE_SERVICE_ROLE_KEY) already
--     bypasses RLS by default. No additional policies are needed for server-side
--     operations that use createAdminClient().
-- ---------------------------------------------------------------------------

-- =============================================================================
-- TEST / VERIFICATION INSTRUCTIONS
-- =============================================================================
--
-- To mathematically verify data isolation between two mechanic accounts:
--
-- 1. Create two Supabase Auth users (e.g. mechanic_a@example.com and
--    mechanic_b@example.com) via the Supabase Dashboard → Authentication.
--
-- 2. Create two tenant rows, linking each to the respective user.
--    To find a user's UID, query: SELECT id FROM auth.users WHERE email = 'mechanic_a@example.com';
--      INSERT INTO tenants (name, slug, email, owner_user_id)
--      VALUES ('Shop A', 'shop-a', 'mechanic_a@example.com', '<uid_a>'),
--             ('Shop B', 'shop-b', 'mechanic_b@example.com', '<uid_b>');
--
-- 3. Insert a client row for each tenant:
--      INSERT INTO clients (tenant_id, first_name, last_name, phone)
--      SELECT id, 'Alice', 'Smith', '+15105550001' FROM tenants WHERE slug = 'shop-a';
--
--      INSERT INTO clients (tenant_id, first_name, last_name, phone)
--      SELECT id, 'Bob', 'Jones', '+15105550002' FROM tenants WHERE slug = 'shop-b';
--
-- 4. In the Supabase SQL editor, set the role context to mechanic_a and query:
--      SET LOCAL role TO authenticated;
--      SET LOCAL "request.jwt.claims" TO '{"sub": "<uid_a>"}';
--      SELECT * FROM clients;   -- Should return ONLY Alice, NOT Bob.
--
-- 5. Repeat with uid_b to confirm Bob's data is isolated.
--
-- Expected result: Each mechanic sees ONLY their own tenant's rows. Any attempt
-- to access cross-tenant data returns an empty result set (not an error), which
-- is the correct RLS behaviour.
-- =============================================================================
