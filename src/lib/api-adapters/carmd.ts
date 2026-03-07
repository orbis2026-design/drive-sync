/**
 * carmd.ts — CarMD API adapter
 *
 * Executes sequential fetches to the simulated CarMD provider endpoints:
 *   1. /decode       — engine & trim data
 *   2. /maintenance  — 0–200 k mile interval array
 *   3. /tsb          — Technical Service Bulletins (known faults)
 *
 * Only CARMD_API_KEY and CARMD_BASE_URL are required environment variables.
 * The base URL defaults to the mock endpoint used in development.
 *
 * Validation rules (Issue #54):
 *   • Each endpoint response is parsed with a strict Zod schema.
 *   • Any field related to "Estimated Labor" or "Estimated Parts Costs" is
 *     explicitly stripped before the caller ever sees the data.
 *   • The maintenance response is transformed into the canonical
 *     MaintenanceSchedule shape (Issue #55) before being returned.
 */

import { z } from "zod";
import { MaintenanceScheduleSchema } from "@/lib/schemas/maintenance";
import type { MaintenanceSchedule } from "@/lib/schemas/maintenance";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CARMD_BASE_URL =
  process.env.CARMD_BASE_URL ?? "https://api.carmd.com/v3.0";
const CARMD_API_KEY = process.env.CARMD_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Raw Zod schemas — match the external API response shapes
// ---------------------------------------------------------------------------

/**
 * /decode response — engine & trim.
 * Fields referencing cost data are intentionally omitted from this schema so
 * Zod's `.strict()` would reject them; we use `.strip()` (default) which
 * silently removes any unrecognised keys including cost fields.
 */
const RawDecodeDataSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  engine: z.string().optional(),
  trim: z.string().optional(),
  // explicitly omitting estimated_labor, labor_hours, parts_cost, etc.
});

const RawDecodeResponseSchema = z.object({
  data: RawDecodeDataSchema,
});

/**
 * /maintenance response — array of interval objects from the provider.
 * The raw shape is messy: each item may include cost fields that we strip.
 */
const RawMaintenanceItemSchema = z
  .object({
    mileage: z.number().int().positive(),
    desc: z.string().optional(), // task description
    // Strip all cost-related fields
    // estimated_labor: z.number().optional(),  ← intentionally excluded
    // estimated_parts_cost: z.number().optional(),  ← intentionally excluded
  })
  .passthrough() // allow other unknown keys through the parse — we'll pick only what we need
  .transform((item) => ({
    mileage: item.mileage,
    // desc may or may not exist; fall back to empty string
    desc: typeof item.desc === "string" ? item.desc : "",
  }));

const RawMaintenanceResponseSchema = z.object({
  data: z.array(RawMaintenanceItemSchema),
});

/**
 * /tsb response — array of Technical Service Bulletins.
 * Cost fields are stripped by omission.
 */
const RawTsbItemSchema = z
  .object({
    bulletin_id: z.string().optional(),
    description: z.string().optional(),
    component: z.string().optional(),
  })
  .passthrough()
  .transform((item) => ({
    bulletin_id: item.bulletin_id ?? null,
    description: item.description ?? null,
    component: item.component ?? null,
    // estimated_labor and estimated_parts_cost are deliberately NOT forwarded
  }));

const RawTsbResponseSchema = z.object({
  data: z.array(RawTsbItemSchema),
});

// ---------------------------------------------------------------------------
// Exported types (cost-scrubbed)
// ---------------------------------------------------------------------------

export type CarMdDecodeData = z.infer<typeof RawDecodeDataSchema>;

export type CarMdTsbItem = {
  bulletin_id: string | null;
  description: string | null;
  component: string | null;
};

export interface CarMdVehicleData {
  /** Engine/trim identity from /decode. */
  decode: CarMdDecodeData;
  /** Normalised maintenance schedule from /maintenance. */
  maintenanceSchedule: MaintenanceSchedule;
  /** TSB fault list from /tsb. */
  knownFaults: CarMdTsbItem[];
}

// ---------------------------------------------------------------------------
// Private fetch helper
// ---------------------------------------------------------------------------

async function carmdFetch(
  endpoint: string,
  vin: string,
): Promise<unknown> {
  if (!CARMD_API_KEY) {
    throw new Error("CARMD_API_KEY environment variable is not set.");
  }

  const url = new URL(endpoint, CARMD_BASE_URL);
  url.searchParams.set("vin", vin);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${CARMD_API_KEY}`,
      "Content-Type": "application/json",
    },
    // Requests to the external provider should time out after 10 s.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(
      `CarMD ${endpoint} responded with HTTP ${res.status} for VIN ${vin}.`,
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Maintenance normaliser
// ---------------------------------------------------------------------------

/**
 * Collapses the raw per-task rows from /maintenance into the canonical
 * `[{ mileage, tasks[] }]` shape required by Issue #55.
 *
 * Multiple tasks that share the same mileage milestone are merged into one
 * object so that the frontend can render them as a single interval card.
 */
function normaliseMaintenanceData(
  rawItems: { mileage: number; desc: string }[],
): MaintenanceSchedule {
  // Group tasks by mileage milestone.
  const byMileage = new Map<number, string[]>();
  for (const item of rawItems) {
    const task = item.desc.trim();
    if (!task) continue;
    // Only accept milestones up to 200 k (per Issue #55 acceptance criteria).
    if (item.mileage > 200_000 || item.mileage <= 0) continue;

    const existing = byMileage.get(item.mileage);
    if (existing) {
      existing.push(task);
    } else {
      byMileage.set(item.mileage, [task]);
    }
  }

  // Sort ascending and validate through the canonical schema.
  const sorted = Array.from(byMileage.entries())
    .sort(([a], [b]) => a - b)
    .map(([mileage, tasks]) => ({ mileage, tasks }));

  // Validate with the canonical schema (throws on violation).
  return MaintenanceScheduleSchema.parse(sorted);
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

/**
 * Fetches and validates all CarMD data for a given VIN.
 *
 * Calls are sequential (decode → maintenance → tsb) so that each step can
 * bail early on error without issuing unnecessary upstream requests.
 *
 * Cost fields ("Estimated Labor", "Estimated Parts Costs") are stripped at
 * the Zod schema level and never appear in the returned object.
 *
 * @throws on network errors, HTTP errors, or schema validation failures.
 */
export async function fetchCarMdData(vin: string): Promise<CarMdVehicleData> {
  // --- Step 1: /decode ---------------------------------------------------
  const rawDecode = await carmdFetch("/decode", vin);
  const decodeResult = RawDecodeResponseSchema.safeParse(rawDecode);
  if (!decodeResult.success) {
    throw new Error(
      `CarMD /decode returned unexpected shape: ${decodeResult.error.message}`,
    );
  }
  const decode = decodeResult.data.data;

  // --- Step 2: /maintenance ----------------------------------------------
  const rawMaintenance = await carmdFetch("/maintenance", vin);
  const maintenanceResult = RawMaintenanceResponseSchema.safeParse(rawMaintenance);
  if (!maintenanceResult.success) {
    throw new Error(
      `CarMD /maintenance returned unexpected shape: ${maintenanceResult.error.message}`,
    );
  }
  const maintenanceSchedule = normaliseMaintenanceData(
    maintenanceResult.data.data,
  );

  // --- Step 3: /tsb ------------------------------------------------------
  const rawTsb = await carmdFetch("/tsb", vin);
  const tsbResult = RawTsbResponseSchema.safeParse(rawTsb);
  if (!tsbResult.success) {
    throw new Error(
      `CarMD /tsb returned unexpected shape: ${tsbResult.error.message}`,
    );
  }
  const knownFaults = tsbResult.data.data;

  return { decode, maintenanceSchedule, knownFaults };
}
