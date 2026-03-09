-- Phase 33 & 34: Auth Gating, UI Purge, and Predictive Retention Engine
-- Issue #137: Add autoRetentionEnabled to Tenant model
-- Issue #138: Add opted_out_sms to Client model

-- Add autoRetentionEnabled to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "autoRetentionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Add opted_out_sms to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "opted_out_sms" BOOLEAN NOT NULL DEFAULT false;
