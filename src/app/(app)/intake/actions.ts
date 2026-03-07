"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceInterval {
  interval_miles: number;
  interval_months: number;
  task: string;
  parts: string[];
}

export interface GlobalVehicleData {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  trim: string | null;
  maintenance_schedule_json: MaintenanceInterval[];
}

export interface DecodeVinResult {
  globalVehicle: GlobalVehicleData;
  /** true when the record already existed in global_vehicles */
  cacheHit: boolean;
}

export interface DecodeVinError {
  error: string;
}

// ---------------------------------------------------------------------------
// Step A — Simulate NHTSA VIN decode
// ---------------------------------------------------------------------------
// In production this would be: https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{vin}?format=json
// For the prototype we derive plausible values from deterministic VIN structure:
//   • Positions 1–3 (WMI)  → manufacturer/make
//   • Position  10          → model year
//   • Positions 4–8 (VDS)  → vehicle descriptor (model approximation)
// ---------------------------------------------------------------------------

const WMI_MAKE_MAP: Record<string, string> = {
  "1FT": "Ford",
  "1FA": "Ford",
  "1GC": "Chevrolet",
  "1G1": "Chevrolet",
  "1HG": "Honda",
  "2HG": "Honda",
  "JHM": "Honda",
  "1N4": "Nissan",
  JN1: "Nissan",
  "2T1": "Toyota",
  "4T1": "Toyota",
  JTD: "Toyota",
  "3VW": "Volkswagen",
  WVW: "Volkswagen",
  "1C4": "Chrysler",
  "2C3": "Dodge",
  "5YJ": "Tesla",
  "1LN": "Lincoln",
};

// VIN position 10 encodes the model year using a 30-character cycle that
// started in 1980. The same character maps to two possible years 30 years
// apart (e.g. 'A' → 1980 or 2010). We return the most recent year that is
// not in the future.
//
// Cycle order (I, O, Q, U, Z not used):
//   A B C D E F G H J K L M N P R S T V W X Y 1 2 3 4 5 6 7 8 9
//   (29 unique positions, repeating every 30 model years)
const YEAR_CYCLE = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N",
  "P", "R", "S", "T", "V", "W", "X", "Y",
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;

function decodeModelYear(vin: string): number {
  const ch = vin[9].toUpperCase();
  const idx = YEAR_CYCLE.indexOf(ch as (typeof YEAR_CYCLE)[number]);
  if (idx === -1) {
    // Fallback for unrecognised characters
    return new Date().getFullYear() - 1;
  }
  // Base of the cycle starting in 1980; offset by how many 30-year periods
  // place the result closest to (but not exceeding) the current year.
  const currentYear = new Date().getFullYear();
  let year = 1980 + idx;
  while (year + 30 <= currentYear) {
    year += 30;
  }
  return year;
}

function deduceMake(vin: string): string {
  const wmi = vin.slice(0, 3).toUpperCase();
  // Try full 3-char WMI first, then 2-char prefix
  return WMI_MAKE_MAP[wmi] ?? WMI_MAKE_MAP[wmi.slice(0, 2)] ?? "Unknown";
}

const GENERIC_MODELS: Record<string, string> = {
  Ford: "F-150",
  Chevrolet: "Silverado 1500",
  Honda: "Civic",
  Nissan: "Altima",
  Toyota: "Camry",
  Volkswagen: "Jetta",
  Chrysler: "300",
  Dodge: "Charger",
  Tesla: "Model 3",
  Lincoln: "Navigator",
};

interface NhtsaResult {
  year: number;
  make: string;
  model: string;
}

function simulateNhtsaDecode(vin: string): NhtsaResult {
  const make = deduceMake(vin);
  const model = GENERIC_MODELS[make] ?? "Unknown Model";
  const year = decodeModelYear(vin);
  return { year, make, model };
}

// ---------------------------------------------------------------------------
// Step D — Simulate CarMD maintenance schedule response
// ---------------------------------------------------------------------------

function simulateCarMdSchedule(
  year: number,
  make: string,
  model: string,
): MaintenanceInterval[] {
  const baseSchedule: MaintenanceInterval[] = [
    {
      interval_miles: 5000,
      interval_months: 6,
      task: "Engine Oil & Filter Change",
      parts: ["Oil Filter", "5W-30 Synthetic Motor Oil (5 qt)"],
    },
    {
      interval_miles: 15000,
      interval_months: 12,
      task: "Tire Rotation & Inspection",
      parts: [],
    },
    {
      interval_miles: 30000,
      interval_months: 24,
      task: "Air Filter Replacement",
      parts: ["Engine Air Filter"],
    },
    {
      interval_miles: 30000,
      interval_months: 24,
      task: "Cabin Air Filter Replacement",
      parts: ["Cabin Air Filter"],
    },
    {
      interval_miles: 60000,
      interval_months: 48,
      task: "Spark Plug Replacement",
      parts: ["Iridium Spark Plugs (set of 4)"],
    },
    {
      interval_miles: 60000,
      interval_months: 48,
      task: "Brake Fluid Flush",
      parts: ["DOT 3 Brake Fluid (1 qt)"],
    },
    {
      interval_miles: 90000,
      interval_months: 72,
      task: "Transmission Fluid Change",
      parts: ["Automatic Transmission Fluid (6 qt)"],
    },
    {
      interval_miles: 100000,
      interval_months: 96,
      task: "Timing Belt/Chain Inspection",
      parts: [],
    },
  ];

  // Newer vehicles: add EV-specific tasks for Tesla or post-2019 models
  if (make === "Tesla") {
    return [
      {
        interval_miles: 12500,
        interval_months: 12,
        task: "Tire Rotation",
        parts: [],
      },
      {
        interval_miles: 25000,
        interval_months: 24,
        task: "Brake Caliper Cleaning & Lubrication",
        parts: ["Caliper Grease"],
      },
      {
        interval_miles: 50000,
        interval_months: 48,
        task: "Cabin Air Filter Replacement",
        parts: ["HEPA Cabin Air Filter"],
      },
      {
        interval_miles: 150000,
        interval_months: 120,
        task: "Battery Coolant Replacement",
        parts: ["Tesla Battery Coolant"],
      },
    ];
  }

  // Add model-year-specific task for older vehicles
  if (year < 2010) {
    baseSchedule.push({
      interval_miles: 15000,
      interval_months: 12,
      task: "Throttle Body Cleaning",
      parts: ["Throttle Body Cleaner"],
    });
  }

  void make; // used indirectly via make-specific branches above
  void model; // placeholder for future model-specific customization

  return baseSchedule;
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

  // ── Step A: Simulate NHTSA VIN decode ────────────────────────────────────
  const { year, make, model } = simulateNhtsaDecode(cleaned);

  // ── Step B: Query global_vehicles (cache lookup) ──────────────────────────
  const db = createServerClient();
  const { data: existing, error: queryError } = await db
    .from("global_vehicles")
    .select("id, year, make, model, engine, trim, maintenance_schedule_json")
    .eq("year", year)
    .eq("make", make)
    .eq("model", model)
    .is("engine", null) // match the null-engine variant first
    .maybeSingle();

  if (queryError) {
    return { error: `Database query failed: ${queryError.message}` };
  }

  // ── Step C: Cache HIT ─────────────────────────────────────────────────────
  if (existing) {
    return {
      globalVehicle: existing as GlobalVehicleData,
      cacheHit: true,
    };
  }

  // ── Step D: Cache MISS — simulate CarMD + insert into global_vehicles ─────
  const maintenanceSchedule = simulateCarMdSchedule(year, make, model);

  const adminDb = createAdminClient();
  const { data: inserted, error: insertError } = await adminDb
    .from("global_vehicles")
    .insert({
      year,
      make,
      model,
      engine: null,
      trim: null,
      maintenance_schedule_json: maintenanceSchedule,
      known_faults_json: [],
    })
    .select("id, year, make, model, engine, trim, maintenance_schedule_json")
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
