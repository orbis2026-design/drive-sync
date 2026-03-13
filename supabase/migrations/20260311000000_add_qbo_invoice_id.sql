-- Add qbo_invoice_id to work_orders for QuickBooks sync idempotency.
-- When set, the work order has already been synced to QBO; sync skips it.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qbo_invoice_id text;

COMMENT ON COLUMN work_orders.qbo_invoice_id IS
  'QuickBooks Online Invoice Id after sync. NULL = not yet synced.';
