-- Migration: Multi-Tier RBAC & Row Level Security (Issue #59, #61, #62)
-- Mirrors supabase/migrations/20260307000010_rbac_rls.sql for Prisma history.

-- Add FIELD_TECH assignment column to work_orders
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "assignedTechId" TEXT;

-- Add FLEET_CLIENT portal user link to clients
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "clientUserId" TEXT;

-- Add QA damage flag to work_orders
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "hasDamageFlag" BOOLEAN NOT NULL DEFAULT FALSE;

-- Add BATCHED_PENDING_PAYMENT to the WorkOrderStatus enum
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'BATCHED_PENDING_PAYMENT';
