-- Migration: 20260307000000_add_paid_status
-- Adds the PAID status to WorkOrderStatus enum and supporting columns.

-- 1. Extend the work_order_status enum with the PAID value
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'PAID';

-- 2. Add closed_at timestamp (set when payment is recorded)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 3. Add payment_method text field (records how payment was made)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS payment_method text;
