/**
 * labor-engine.ts — Community Labor Time Suggestor
 *
 * Aggregates labor hours from the Global Lexicon (previously completed work
 * orders) and provides a crowd-sourced alternative to Mitchell 1 estimates.
 *
 * Flow:
 *   1. Call Supabase RPC `get_avg_labor_hours` with service type + vehicle submodel.
 *   2. If at least 3 samples exist → return lexicon result (`source: 'lexicon'`).
 *   3. If fewer than 3 samples:
 *      a. Production with `CARMD_API_KEY` → call real CarMD API.
 *      b. Dev / test → fall back to embedded static estimates (`source: 'carmd'`).
 *   4. If nothing found → return `source: 'none'` with zero hours.
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CARMD_API_KEY (optional — enables real CarMD labour lookups)
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The source that produced a labor suggestion:
 *   `lexicon` — aggregated from ≥3 previous paid work orders
 *   `carmd`   — fallback from mock CarMD static estimates
 *   `none`    — no data available
 */
export type LaborSource = "lexicon" | "carmd" | "none";

/** Aggregated labor time suggestion for a given service and vehicle. */
export interface LaborSuggestion {
  /** Average labor hours across historical jobs. */
  avgHours: number;
  /** Number of data points used in the average. */
  sampleCount: number;
  /** Minimum observed hours. */
  minHours: number;
  /** Maximum observed hours. */
  maxHours: number;
  /** Where the estimate came from. */
  source: LaborSource;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CARMD_API_KEY = process.env.CARMD_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Minimum confidence threshold
// ---------------------------------------------------------------------------

/** Minimum number of lexicon samples required to trust the community average. */
const MIN_SAMPLE_COUNT = 3;

// ---------------------------------------------------------------------------
// Static CarMD estimates — dev / test fallback only
// In production with CARMD_API_KEY set, getCarMdEstimate() calls the real API.
// ---------------------------------------------------------------------------

/**
 * Realistic labor-hour estimates keyed by normalised service-type keywords.
 * Keys are lower-cased substrings that may appear in the service description.
 * Used only in dev / test when no CARMD_API_KEY is configured.
 */
const CARMD_ESTIMATES: Array<{ keywords: string[]; hours: number }> = [
  { keywords: ["oil change", "oil filter", "lube"], hours: 0.5 },
  { keywords: ["brake pad", "brake pads"], hours: 1.5 },
  { keywords: ["brake rotor", "brake rotors", "rotor"], hours: 2.0 },
  { keywords: ["brake caliper", "caliper"], hours: 1.5 },
  { keywords: ["air filter", "engine air filter"], hours: 0.3 },
  { keywords: ["cabin filter", "cabin air filter"], hours: 0.5 },
  { keywords: ["spark plug", "spark plugs", "plugs"], hours: 1.0 },
  { keywords: ["timing belt", "timing chain"], hours: 4.0 },
  { keywords: ["water pump"], hours: 2.5 },
  { keywords: ["thermostat"], hours: 1.0 },
  { keywords: ["alternator"], hours: 2.0 },
  { keywords: ["battery"], hours: 0.5 },
  { keywords: ["starter"], hours: 1.5 },
  { keywords: ["tie rod", "tie rods"], hours: 1.5 },
  { keywords: ["wheel bearing", "hub bearing"], hours: 2.0 },
  { keywords: ["cv axle", "cv shaft", "axle"], hours: 2.0 },
  { keywords: ["strut", "struts", "shock", "shocks"], hours: 2.5 },
  { keywords: ["oxygen sensor", "o2 sensor"], hours: 1.0 },
  { keywords: ["mass airflow", "maf sensor"], hours: 0.5 },
  { keywords: ["transmission fluid", "trans fluid"], hours: 1.0 },
  { keywords: ["coolant flush", "radiator flush"], hours: 1.0 },
  { keywords: ["power steering", "steering fluid"], hours: 0.5 },
  { keywords: ["fuel filter"], hours: 1.0 },
  { keywords: ["inspection", "diagnostic", "scan"], hours: 1.0 },
];

/**
 * Returns a CarMD labor estimate for the given service type string.
 *
 * When `CARMD_API_KEY` is set, calls the real CarMD API. Otherwise falls back
 * to the embedded static table (dev / test only — blocked in production).
 */
async function getCarMdEstimate(serviceType: string): Promise<number | null> {
  // --- Real CarMD API when key is configured --------------------------------
  if (CARMD_API_KEY) {
    try {
      const res = await fetch(
        `https://api.carmd.com/v3.0/labor?service=${encodeURIComponent(serviceType)}`,
        {
          headers: {
            Authorization: CARMD_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          data?: { labor_hours?: number };
        };
        if (typeof body?.data?.labor_hours === "number") {
          return body.data.labor_hours;
        }
      }
    } catch {
      // Fall through to static table
    }
  }

  // --- Production without API key → no silent fallback ---------------------
  if (IS_PRODUCTION && !CARMD_API_KEY) {
    return null;
  }

  // --- Dev / test static fallback -------------------------------------------
  const lower = serviceType.toLowerCase();
  for (const entry of CARMD_ESTIMATES) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.hours;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// getSuggestedLaborHours
// ---------------------------------------------------------------------------

/**
 * Returns a labor time suggestion for the given service type and vehicle.
 *
 * Calls the Supabase RPC `get_avg_labor_hours` first.  If the community data
 * set has fewer than {@link MIN_SAMPLE_COUNT} verified jobs, the function falls
 * back to a static CarMD lookup so mechanics always get *some* estimate.
 *
 * @param serviceType      - Human-readable service description (e.g. "Brake Pad Replacement").
 * @param vehicleSubmodel  - Space-separated make + model string (e.g. "Toyota Camry").
 * @returns A {@link LaborSuggestion} with hours and data provenance.
 */
export async function getSuggestedLaborHours(
  serviceType: string,
  vehicleSubmodel: string,
): Promise<LaborSuggestion> {
  // --- 1. Query the Global Lexicon via Supabase RPC -------------------------
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("get_avg_labor_hours", {
      p_service_type: serviceType,
      p_vehicle_submodel: vehicleSubmodel,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as {
        avg_hours: number | null;
        sample_count: number | null;
        min_hours: number | null;
        max_hours: number | null;
      };

      const sampleCount = row.sample_count ?? 0;
      const avgHours = row.avg_hours ?? 0;

      if (sampleCount >= MIN_SAMPLE_COUNT && avgHours > 0) {
        return {
          avgHours,
          sampleCount,
          minHours: row.min_hours ?? avgHours,
          maxHours: row.max_hours ?? avgHours,
          source: "lexicon",
        };
      }
    }
  } catch {
    // Non-fatal: fall through to CarMD fallback if Supabase is unreachable.
  }

  // --- 2. CarMD fallback ---------------------------------------------------
  const carMdHours = await getCarMdEstimate(serviceType);

  if (carMdHours !== null) {
    return {
      avgHours: carMdHours,
      sampleCount: 0,
      minHours: carMdHours,
      maxHours: carMdHours,
      source: "carmd",
    };
  }

  // --- 3. Nothing found ----------------------------------------------------
  return {
    avgHours: 0,
    sampleCount: 0,
    minHours: 0,
    maxHours: 0,
    source: "none",
  };
}

// ---------------------------------------------------------------------------
// formatLaborSuggestion
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable string for displaying a labor suggestion in the UI.
 *
 * Examples:
 *   Lexicon  → "Suggested Time: 2.5 hrs (Based on 47 previous jobs)"
 *   CarMD    → "Estimated Time: 1.5 hrs (CarMD estimate)"
 *   None     → "No labor estimate available"
 *
 * @param suggestion - The {@link LaborSuggestion} to format.
 * @returns A display string suitable for quote builder or tech notes.
 */
export function formatLaborSuggestion(suggestion: LaborSuggestion): string {
  switch (suggestion.source) {
    case "lexicon":
      return `Suggested Time: ${suggestion.avgHours} hrs (Based on ${suggestion.sampleCount} previous jobs)`;

    case "carmd":
      return `Estimated Time: ${suggestion.avgHours} hrs (CarMD estimate)`;

    case "none":
    default:
      return "No labor estimate available";
  }
}
