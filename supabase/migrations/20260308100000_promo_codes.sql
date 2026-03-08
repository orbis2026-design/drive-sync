-- Phase 22: Promo Codes & Tier Engine (Issue #83)

CREATE TABLE IF NOT EXISTS promo_codes (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code             TEXT        NOT NULL UNIQUE,
  discount_percent INTEGER     NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  duration_months  INTEGER,
  applicable_tier  TEXT        NOT NULL DEFAULT 'SOLO_TECH',
  max_uses         INTEGER     NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses             INTEGER     NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE promo_codes IS
  'Gift codes and promotional discounts for the native checkout bypass (Issue #83).';

-- Seed a beta tester code (100% off, unlimited uses for now)
INSERT INTO promo_codes (code, discount_percent, duration_months, applicable_tier, max_uses, uses)
VALUES ('BETA2026', 100, 12, 'MULTI_VAN', 100, 0)
ON CONFLICT (code) DO NOTHING;
