-- Migration: add parts_cost_cents to work_orders
--
-- Adds the wholesale parts-cost column that is already modelled in the Prisma
-- schema (WorkOrder.partsCostCents) but was missing from the Supabase table
-- definition.  Without this column, Prisma queries that SELECT partsCostCents
-- (e.g. analytics/actions.ts fetchAnalytics) crash with an "Unknown column"
-- error, breaking the Financials dashboard and Active Jobs board.
--
-- The column is nullable so that existing rows are unaffected: the analytics
-- engine falls back to a 55% wholesale-cost estimate when the value is NULL.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS parts_cost_cents INTEGER CHECK (parts_cost_cents >= 0);

COMMENT ON COLUMN work_orders.parts_cost_cents IS
  'Wholesale (COGS) cost of parts in cents. When NULL the analytics engine
   assumes a 55% cost ratio against parts_cents for gross-margin reporting.';
