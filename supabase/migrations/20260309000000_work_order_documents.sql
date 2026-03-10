-- 20260309000000_work_order_documents.sql
-- WorkOrderDocument table — contract, inspection, invoice PDFs/media per work order.

CREATE TABLE IF NOT EXISTS work_order_documents (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id UUID       NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,
  storage_key  TEXT        NOT NULL,
  bucket       TEXT        NOT NULL DEFAULT 'contracts',
  filename     TEXT        NOT NULL,
  metadata_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_order_documents_tenant_id_idx
  ON work_order_documents (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_order_documents_work_order_id_idx
  ON work_order_documents (work_order_id, created_at DESC);

ALTER TABLE work_order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_order_documents_tenant_isolation" ON work_order_documents;

CREATE POLICY "work_order_documents_tenant_isolation"
  ON work_order_documents FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

