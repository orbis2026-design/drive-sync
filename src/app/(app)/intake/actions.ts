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
// Step B — Simulate multiple-trim disambiguation
// ---------------------------------------------------------------------------
// Some VINs can map to multiple engine/trim combos. We simulate this by
// returning multiple options for Honda Civic and Toyota Camry, which are
// historically offered with multiple engine choices.
// ---------------------------------------------------------------------------

const SUBMODEL_VARIANTS: Record<string, SubmodelOption[]> = {
  "Honda:Civic": [
    {
      engine: "1.5L Turbo 4-Cyl",
      trim: "Sport",
      oil_capacity_qts: 3.4,
      oil_weight_oem: "0W-20 Full Synthetic",
    },
    {
      engine: "2.0L Naturally Aspirated 4-Cyl",
      trim: "Si",
      oil_capacity_qts: 4.4,
      oil_weight_oem: "0W-20 Full Synthetic",
    },
  ],
  "Toyota:Camry": [
    {
      engine: "2.5L 4-Cyl",
      trim: "LE",
      oil_capacity_qts: 4.8,
      oil_weight_oem: "0W-16 Full Synthetic",
    },
    {
      engine: "3.5L V6",
      trim: "XSE V6",
      oil_capacity_qts: 6.4,
      oil_weight_oem: "0W-20 Full Synthetic",
    },
  ],
  "Ford:F-150": [
    {
      engine: "3.5L EcoBoost V6",
      trim: "XLT",
      oil_capacity_qts: 6.0,
      oil_weight_oem: "5W-30 Full Synthetic",
    },
    {
      engine: "5.0L V8",
      trim: "Lariat",
      oil_capacity_qts: 7.7,
      oil_weight_oem: "5W-20 Full Synthetic",
    },
  ],
};

/** Default single-option fluid specs for makes that don't have multi-trim variants. */
const DEFAULT_FLUID_SPECS: Record<string, SubmodelOption> = {
  "Chevrolet:Silverado 1500": {
    engine: "5.3L V8 EcoTec3",
    trim: "LTZ",
    oil_capacity_qts: 6.0,
    oil_weight_oem: "0W-20 Full Synthetic",
  },
  "Nissan:Altima": {
    engine: "2.5L 4-Cyl",
    trim: "S",
    oil_capacity_qts: 4.9,
    oil_weight_oem: "5W-30 Full Synthetic",
  },
  "Volkswagen:Jetta": {
    engine: "1.4L Turbo 4-Cyl",
    trim: "S",
    oil_capacity_qts: 4.5,
    oil_weight_oem: "5W-40 Full Synthetic",
  },
  "Chrysler:300": {
    engine: "3.6L Pentastar V6",
    trim: "Touring",
    oil_capacity_qts: 5.9,
    oil_weight_oem: "5W-20 Full Synthetic",
  },
  "Dodge:Charger": {
    engine: "3.6L Pentastar V6",
    trim: "SXT",
    oil_capacity_qts: 5.9,
    oil_weight_oem: "5W-20 Full Synthetic",
  },
  "Tesla:Model 3": {
    engine: "Electric Dual Motor",
    trim: "Long Range AWD",
    oil_capacity_qts: 0,
    oil_weight_oem: "N/A (Electric)",
  },
  "Lincoln:Navigator": {
    engine: "3.5L EcoBoost V6",
    trim: "Reserve",
    oil_capacity_qts: 6.0,
    oil_weight_oem: "5W-30 Full Synthetic",
  },
};

function simulateSubmodelOptions(make: string, model: string): SubmodelOption[] {
  const key = `${make}:${model}`;
  return SUBMODEL_VARIANTS[key] ?? [];
}

function simulateSingleSubmodel(make: string, model: string): SubmodelOption | null {
  const key = `${make}:${model}`;
  return DEFAULT_FLUID_SPECS[key] ?? null;
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

  // ── Step A2: Check whether this VIN maps to multiple engine/trim combos ──
  const submodelOptions = simulateSubmodelOptions(make, model);
  const hasMultipleSubmodels = submodelOptions.length > 1;

  // ── Step B: Query global_vehicles (cache lookup) ──────────────────────────
  const db = createServerClient();
  const { data: existing, error: queryError } = await db
    .from("global_vehicles")
    .select("id, year, make, model, engine, trim, oil_capacity_qts, oil_weight_oem, submodel_options_json, maintenance_schedule_json")
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
      ...(hasMultipleSubmodels ? { submodelOptions } : {}),
    };
  }

  // ── Step D: Cache MISS — simulate CarMD + insert into global_vehicles ─────
  const maintenanceSchedule = simulateCarMdSchedule(year, make, model);
  const singleSubmodel = simulateSingleSubmodel(make, model);

  const adminDb = createAdminClient();
  const { data: inserted, error: insertError } = await adminDb
    .from("global_vehicles")
    .insert({
      year,
      make,
      model,
      engine: null,
      trim: null,
      oil_capacity_qts: singleSubmodel?.oil_capacity_qts ?? null,
      oil_weight_oem: singleSubmodel?.oil_weight_oem ?? null,
      submodel_options_json: hasMultipleSubmodels ? submodelOptions : [],
      maintenance_schedule_json: maintenanceSchedule,
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
    ...(hasMultipleSubmodels ? { submodelOptions } : {}),
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
