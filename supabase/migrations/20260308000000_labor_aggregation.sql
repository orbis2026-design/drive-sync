-- Migration: 20260308000000_labor_aggregation.sql
--
-- Adds a Postgres RPC function `get_avg_labor_hours` that aggregates
-- community labor time data from completed (PAID) work orders in the Global
-- Lexicon.  The function powers the LaborEngine fallback so solo mechanics
-- get crowd-sourced time estimates without a Mitchell 1 subscription.
--
-- Tables involved:
--   work_orders      — source of labor_json JSONB and status
--   tenant_vehicles  — bridge table (work_orders.tenant_vehicle_id → global_vehicle_id)
--   global_vehicles  — canonical make/model reference

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------

-- Speed up status filtering on the hot work_orders query.
CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON work_orders (status);

-- Speed up the join from tenant_vehicles to global_vehicles.
CREATE INDEX IF NOT EXISTS idx_tenant_vehicles_global_vehicle_id
  ON tenant_vehicles (global_vehicle_id);

-- Speed up vehicle submodel lookups on global_vehicles.
CREATE INDEX IF NOT EXISTS idx_global_vehicles_make_model
  ON global_vehicles (make, model);

-- ---------------------------------------------------------------------------
-- RPC function: get_avg_labor_hours
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_avg_labor_hours(
  p_service_type     TEXT,
  p_vehicle_submodel TEXT
)
RETURNS TABLE (
  avg_hours    NUMERIC,
  sample_count INTEGER,
  min_hours    NUMERIC,
  max_hours    NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH labor_lines AS (
    -- Unnest the labor_json array so each labor line becomes its own row.
    -- labor_json shape: [{ "description": "...", "hours": N }]
    SELECT
      (line->>'hours')::NUMERIC AS hours
    FROM
      work_orders wo
      JOIN tenant_vehicles tv ON tv.id = wo.tenant_vehicle_id
      JOIN global_vehicles  gv ON gv.id = tv.global_vehicle_id,
      LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.labor_json) = 'array' THEN wo.labor_json
          ELSE '[]'::jsonb
        END
      ) AS line
    WHERE
      -- Only aggregate verified, completed jobs.
      wo.status = 'PAID'
      -- Match the service type against each line's description (case-insensitive).
      AND (line->>'description') ILIKE ('%' || p_service_type || '%')
      -- Match the vehicle submodel against "make model" concatenation.
      AND (gv.make || ' ' || gv.model) ILIKE ('%' || p_vehicle_submodel || '%')
      -- Guard against malformed / null labor rows.
      AND (line->>'hours') IS NOT NULL
      AND (line->>'hours')::NUMERIC > 0
  )
  SELECT
    ROUND(AVG(hours), 2)  AS avg_hours,
    COUNT(*)::INTEGER     AS sample_count,
    ROUND(MIN(hours), 2)  AS min_hours,
    ROUND(MAX(hours), 2)  AS max_hours
  FROM labor_lines;
END;
$$;

-- Grant execute permission to the authenticated role used by the API.
GRANT EXECUTE ON FUNCTION get_avg_labor_hours(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_avg_labor_hours(TEXT, TEXT) TO authenticated;
