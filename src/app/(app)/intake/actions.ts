"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeVinWithNhtsa } from "@/lib/api-adapters/nhtsa";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceInterval {
  interval_miles: number;
  interval_months: number;
  task: string;
  parts: string[];
}

/** One possible engine/trim combination returned by the VIN decoder. */
export interface SubmodelOption {
  engine: string;
  trim: string;
  oil_capacity_qts: number;
  oil_weight_oem: string;
}

export interface GlobalVehicleData {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  trim: string | null;
  oil_capacity_qts: number | null;
  oil_weight_oem: string | null;
  submodel_options_json: SubmodelOption[];
  maintenance_schedule_json: MaintenanceInterval[];
}

export interface DecodeVinResult {
  globalVehicle: GlobalVehicleData;
  /** true when the record already existed in global_vehicles */
  cacheHit: boolean;
  /**
   * When the NHTSA API returns more than one possible engine/trim, this list
   * is populated and the UI must show a Disambiguation Modal before proceeding.
   */
  submodelOptions?: SubmodelOption[];
}

export interface DecodeVinError {
  error: string;
}

// ---------------------------------------------------------------------------
// Main Server Action — decodeVin
// ---------------------------------------------------------------------------

export async function decodeVin(
  vin: string,
): Promise<DecodeVinResult | DecodeVinError> {
  // ── Basic VIN validation ──────────────────────────────────────────────────
  const cleaned = vin.trim().toUpperCase();
  if (cleaned.length !== 17) {
    return { error: "VIN must be exactly 17 characters." };
  }
  // VINs never contain I, O, or Q (to avoid confusion with 1, 0)
  if (/[IOQ]/.test(cleaned)) {
    return { error: "Invalid VIN: cannot contain the letters I, O, or Q." };
  }

  // ── Step A: Call real NHTSA vPIC API ──────────────────────────────────────
  let year: number;
  let make: string;
  let model: string;
  let engine: string | null;
  let trim: string | null;

  try {
    const nhtsa = await decodeVinWithNhtsa(cleaned);
    year = nhtsa.year;
    make = nhtsa.make;
    model = nhtsa.model;
    engine = nhtsa.engine;
    trim = nhtsa.trim;
  } catch (err) {
    // Last-resort fallback: return an error so the UI can inform the user.
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `VIN decode failed: ${msg}` };
  }

  // ── Step B: Query global_vehicles (cache lookup) ──────────────────────────
  const db = await createServerClient();
  const { data: existing, error: queryError } = await db
    .from("global_vehicles")
    .select("id, year, make, model, engine, trim, oil_capacity_qts, oil_weight_oem, submodel_options_json, maintenance_schedule_json")
    .eq("year", year)
    .eq("make", make)
    .eq("model", model)
    .maybeSingle();

  if (queryError) {
    return { error: `Database query failed: ${queryError.message}` };
  }

  // ── Step C: Cache HIT ─────────────────────────────────────────────────────
  if (existing) {
    const globalVehicle = existing as GlobalVehicleData;
    const submodelOptions = globalVehicle.submodel_options_json ?? [];
    return {
      globalVehicle,
      cacheHit: true,
      ...(submodelOptions.length > 1 ? { submodelOptions } : {}),
    };
  }

  // ── Step D: Cache MISS — insert into global_vehicles ─────────────────────
  const adminDb = createAdminClient();
  const { data: inserted, error: insertError } = await adminDb
    .from("global_vehicles")
    .insert({
      year,
      make,
      model,
      engine: engine ?? null,
      trim: trim ?? null,
      oil_capacity_qts: null,
      oil_weight_oem: null,
      submodel_options_json: [],
      maintenance_schedule_json: [],
      known_faults_json: [],
    })
    .select("id, year, make, model, engine, trim, oil_capacity_qts, oil_weight_oem, submodel_options_json, maintenance_schedule_json")
    .single();

  if (insertError) {
    return { error: `Failed to cache vehicle data: ${insertError.message}` };
  }

  return {
    globalVehicle: inserted as GlobalVehicleData,
    cacheHit: false,
  };
}

// ---------------------------------------------------------------------------
// Server Action — createTenantVehicle
// ---------------------------------------------------------------------------

export interface CreateTenantVehicleInput {
  tenantId: string;
  clientId: string;
  globalVehicleId: string;
  vin: string;
  licensePlate?: string;
  mileage?: number;
  color?: string;
}

export interface TenantVehicleResult {
  id: string;
  tenantId: string;
  clientId: string;
  globalVehicleId: string;
}

export async function createTenantVehicle(
  input: CreateTenantVehicleInput,
): Promise<TenantVehicleResult | DecodeVinError> {
  // Validate VIN: must be non-empty and 17 characters when provided
  const vin = input.vin.trim();
  if (vin && vin.length !== 17) {
    return { error: "VIN must be exactly 17 characters." };
  }

  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from("tenant_vehicles")
    .insert({
      tenant_id: input.tenantId,
      client_id: input.clientId,
      global_vehicle_id: input.globalVehicleId,
      vin: vin || null,
      license_plate: input.licensePlate?.trim() || null,
      mileage: input.mileage ?? null,
      color: input.color?.trim() || null,
    })
    .select("id, tenant_id, client_id, global_vehicle_id")
    .single();

  if (error) {
    return { error: `Failed to create vehicle record: ${error.message}` };
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    clientId: data.client_id,
    globalVehicleId: data.global_vehicle_id,
  };
}
