-- =============================================================================
-- Phase 12: Feature Toggles (Issue #49)
-- =============================================================================
-- Adds a features_json column to tenants so each mechanic can enable/disable
-- optional product features (Inventory, Automated Marketing, Fleet Clients).
-- The column defaults to all features enabled so existing tenants are
-- unaffected without a data migration.
-- =============================================================================

alter table tenants
  add column if not exists features_json jsonb not null default '{
    "inventory": true,
    "marketing": true,
    "fleet": true
  }'::jsonb;

comment on column tenants.features_json is
  'Feature-flag map for tenant-level product toggles. '
  'Shape: { "inventory": bool, "marketing": bool, "fleet": bool }';
