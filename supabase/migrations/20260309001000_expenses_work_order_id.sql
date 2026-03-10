-- 20260309001000_expenses_work_order_id.sql
-- Link expenses to work orders (optional work_order_id FK).

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_work_order_id_idx
  ON expenses (tenant_id, work_order_id, created_at DESC);

