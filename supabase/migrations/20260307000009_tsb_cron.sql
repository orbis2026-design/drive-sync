-- =============================================================================
-- Phase 14 Migration — Automated TSB & Recall Sync via pg_cron (Issue #56)
-- =============================================================================
-- Creates a pg_cron job that runs every 6 months to refresh TSB data for the
-- 100 most frequently referenced vehicles across all tenants.
--
-- Prerequisites:
--   • pg_cron extension enabled in Supabase (Dashboard → Extensions).
--   • The Supabase Edge Function "sync-tsb" is deployed and callable from
--     within the database using the http extension.
--   • SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_URL are configured as
--     Supabase secrets accessible to the Edge Function runtime.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable required extensions (idempotent, exception-safe)
-- pg_cron and http may already exist in a different schema on some Supabase
-- configurations; the EXCEPTION block prevents a hard failure in that case.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron extension could not be created in schema extensions: %. Skipping.', sqlerrm;
end;
$$;

do $$
begin
  create extension if not exists http with schema extensions;
exception when others then
  raise notice 'http extension could not be created in schema extensions: %. Skipping.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper function — identify the top-N most-referenced GlobalVehicle IDs
-- ---------------------------------------------------------------------------

create or replace function get_top_referenced_global_vehicle_ids(
  p_limit integer default 100
)
returns table (global_vehicle_id uuid, reference_count bigint)
language sql stable security definer
as $$
  -- Join tenant_vehicles → global_vehicles, rank by how many tenant rows
  -- reference each global vehicle (a proxy for cross-tenant popularity).
  select
    v.global_vehicle_id,
    count(*) as reference_count
  from tenant_vehicles v
  where v.global_vehicle_id is not null
  group by v.global_vehicle_id
  order by reference_count desc
  limit p_limit;
$$;

comment on function get_top_referenced_global_vehicle_ids(integer) is
  'Returns the top-N GlobalVehicle IDs ordered by the number of tenant '
  'vehicles that reference them. Used by the TSB sync cron job (Issue #56).';

-- ---------------------------------------------------------------------------
-- Core TSB sync procedure — called by the cron job
-- ---------------------------------------------------------------------------

create or replace procedure run_tsb_sync()
language plpgsql security definer
as $$
declare
  edge_fn_url  text;
  payload      jsonb;
  gv_ids       uuid[] := '{}';
begin
  -- Collect the top-100 global vehicle IDs.
  select array_agg(t.global_vehicle_id order by t.reference_count desc)
    into gv_ids
  from get_top_referenced_global_vehicle_ids(100) t;

  if gv_ids is null or array_length(gv_ids, 1) = 0 then
    raise notice 'TSB sync: no global_vehicle_id references found; skipping.';
    return;
  end if;

  -- Derive the Edge Function URL from the Supabase project URL.
  -- In Supabase, project URL follows: https://<ref>.supabase.co
  -- Edge Functions are at:           https://<ref>.supabase.co/functions/v1/<name>
  edge_fn_url := current_setting('app.supabase_url', true)
                 || '/functions/v1/sync-tsb';

  payload := jsonb_build_object('vehicle_ids', to_jsonb(gv_ids));

  -- Fire the Edge Function asynchronously. http_post returns immediately;
  -- the function handles the upstream CarMD /tsb calls and writes back to
  -- global_vehicles.known_faults_json and last_tsb_sync.
  perform extensions.http_post(
    edge_fn_url,
    payload::text,
    'application/json'
  );

  raise notice 'TSB sync: triggered Edge Function for % vehicles.', array_length(gv_ids, 1);
end;
$$;

comment on procedure run_tsb_sync() is
  'Calls the sync-tsb Edge Function with the top-100 most-referenced '
  'GlobalVehicle IDs so that known_faults_json and last_tsb_sync are kept '
  'current without manual intervention. Invoked by pg_cron every 6 months.';

-- ---------------------------------------------------------------------------
-- Schedule the cron job — runs at 02:00 UTC on the 1st of Jan and Jul
-- Wrapped in an exception-safe DO block so a missing/inaccessible pg_cron
-- installation does not abort the entire migration.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Unschedule any pre-existing job with the same name (idempotent).
  begin
    perform cron.unschedule('tsb-sync-biannual');
  exception when others then
    null; -- job did not exist or cron schema not accessible; continue
  end;

  -- Schedule the biannual TSB sync job.
  begin
    perform cron.schedule(
      'tsb-sync-biannual',
      '0 2 1 1,7 *',   -- 02:00 UTC on 1 Jan and 1 Jul (every 6 months)
      $cmd$call run_tsb_sync();$cmd$
    );
  exception when others then
    raise notice 'TSB cron job could not be scheduled: %. Migration continues without it.', sqlerrm;
  end;
end;
$$;
