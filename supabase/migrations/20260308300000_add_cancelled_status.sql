-- Phase 23: Add CANCELLED status to work_order_status enum (Issue #87 Elastic Dispatch)
-- Allows the CalendarClient to mark a job as CANCELLED and trigger gap detection.

ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'CANCELLED';

COMMENT ON TYPE work_order_status IS
  'CANCELLED added in Phase 23: when a mechanic cancels a scheduled job the
   elastic dispatch engine checks the next queued job and optionally sends an
   earlier-ETA SMS to that client via /api/dispatch/notify-eta.';
