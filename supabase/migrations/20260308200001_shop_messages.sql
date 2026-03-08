-- Phase 23: Internal Shop Communications (Issue #88)

CREATE TABLE IF NOT EXISTS shop_messages (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel     TEXT        NOT NULL DEFAULT '#general' CHECK (channel IN ('#dispatch', '#general', '#insights')),
  body        TEXT        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  is_ai       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_messages_tenant_channel
  ON shop_messages (tenant_id, channel, created_at DESC);

ALTER TABLE shop_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_messages_select_own_tenant"
  ON shop_messages FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "shop_messages_insert_own_tenant"
  ON shop_messages FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE shop_messages;

COMMENT ON TABLE shop_messages IS
  'Internal Slack-style messaging for multi-van shops. Zero cost via Supabase Real-Time (Issue #88).';
