-- Phase 23: Professional Diagnostic Checklist (Issue #86)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS checklists_json JSONB;

COMMENT ON COLUMN work_orders.checklists_json IS
  'Structured multi-point inspection matrix. Shape: ChecklistItem[]:
   [{ "id": "tires_lf", "category": "Tires", "label": "Left Front Tire", "status": "PASS" | "CAUTION" | "FAIL", "note": "...", "photoUrl": "..." }]
   FAIL items require a photo and note before save is permitted.';
