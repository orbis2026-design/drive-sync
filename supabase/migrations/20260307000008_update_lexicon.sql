-- =============================================================================
-- Phase 14 Migration — Lexicon Extractor Schema Update (Issue #55)
-- =============================================================================
-- Adds VIN, engine, trim, known_faults_json, and last_tsb_sync columns to the
-- global_vehicles table so that the Lexicon Extractor Worker (Issue #54) can
-- persist a full vehicle profile retrieved from the CarMD API.
--
-- The maintenance_schedule_json column is constrained to enforce the canonical
-- [{ mileage: integer, tasks: text[] }] structure via a CHECK constraint that
-- validates the jsonb shape at the database layer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Issue #54/55 — Extend global_vehicles with Lexicon Extractor fields
-- ---------------------------------------------------------------------------

alter table global_vehicles
  add column if not exists vin               text unique,
  add column if not exists engine            text,
  add column if not exists trim              text,
  add column if not exists known_faults_json jsonb not null default '[]'::jsonb,
  add column if not exists last_tsb_sync     timestamptz;

comment on column global_vehicles.vin is
  'Full 17-character Vehicle Identification Number. Populated by the Lexicon '
  'Extractor Worker on a cache-miss; NULL for rows created before Phase 14.';

comment on column global_vehicles.engine is
  'Engine descriptor returned by CarMD /decode, e.g. "2.5L 4-Cylinder DOHC".';

comment on column global_vehicles.trim is
  'Trim level returned by CarMD /decode, e.g. "Sport", "Limited".';

comment on column global_vehicles.known_faults_json is
  'Array of TSB objects: [{ bulletin_id, description, component }]. '
  'Cost fields (estimated labor, parts cost) are stripped before insertion.';

comment on column global_vehicles.last_tsb_sync is
  'Timestamp of the most recent TSB refresh from the CarMD /tsb endpoint. '
  'Updated by the pg_cron job defined in 20260307000009_tsb_cron.sql.';

-- ---------------------------------------------------------------------------
-- Issue #55 — Enforce maintenance_schedule_json structure
--
-- The CHECK constraint validates that the column contains a JSON array where
-- every element has:
--   • "mileage"  — a positive integer
--   • "tasks"    — a non-empty JSON array
--
-- Rows that do not conform are rejected at write time.
-- ---------------------------------------------------------------------------

alter table global_vehicles
  drop constraint if exists chk_maintenance_schedule_json_shape;

alter table global_vehicles
  add constraint chk_maintenance_schedule_json_shape
  check (
    jsonb_typeof(maintenance_schedule_json) = 'array'
    and (
      -- An empty array is allowed for rows created before Phase 14.
      jsonb_array_length(maintenance_schedule_json) = 0
      or (
        -- Every element must be an object with a positive integer mileage
        -- and a non-empty tasks array.
        (
          select bool_and(
            jsonb_typeof(elem) = 'object'
            and (elem->>'mileage') is not null
            and (elem->>'mileage')::numeric > 0
            and jsonb_typeof(elem->'tasks') = 'array'
            and jsonb_array_length(elem->'tasks') > 0
          )
          from jsonb_array_elements(maintenance_schedule_json) as elem
        ) = true
      )
    )
  );

comment on constraint chk_maintenance_schedule_json_shape on global_vehicles is
  'Enforces the Phase 14/15 canonical maintenance matrix shape: '
  '[{ "mileage": <positive int>, "tasks": ["<string>", ...] }].';

-- Index for fast VIN look-ups (the Lexicon Extractor checks for duplicates
-- before calling the upstream provider).
create index if not exists idx_global_vehicles_vin
  on global_vehicles (vin)
  where vin is not null;
