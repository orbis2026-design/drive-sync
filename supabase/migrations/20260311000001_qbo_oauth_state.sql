-- CSRF protection for QuickBooks OAuth: store state bound to tenant before redirect.
-- Callback validates state and consumes it once.
CREATE TABLE IF NOT EXISTS qbo_oauth_state (
  state     TEXT        NOT NULL PRIMARY KEY,
  tenant_id UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbo_oauth_state_created_at
  ON qbo_oauth_state (created_at);

COMMENT ON TABLE qbo_oauth_state IS
  'Short-lived OAuth state for QBO callback CSRF protection. Delete after use or expiry.';
