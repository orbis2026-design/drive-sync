/**
 * nhtsa.ts — NHTSA vPIC VIN Decoder API adapter
 *
 * Calls the real NHTSA vPIC API to decode a VIN:
 *   https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json
 *
 * The API is free, requires no API key, and has no published rate limit,
 * though NHTSA recommends keeping requests "reasonable" (< 5 req/s).
 *
 * Validation:
 *   • The response is parsed with a strict Zod schema.
 *   • Empty-string values from the API are normalised to `null`.
 *
 * Fallback:
 *   • If the API is unreachable or returns an error, the caller receives a
 *     structured error and can fall back to a generic "Unknown" vehicle.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NHTSA_BASE_URL =
  process.env.NHTSA_BASE_URL ?? "https://vpic.nhtsa.dot.gov/api";

/** Maximum time to wait for a response from the NHTSA API. */
const NHTSA_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Zod schemas — match the NHTSA vPIC DecodeVinValues response shape
// ---------------------------------------------------------------------------

/**
 * The NHTSA API returns many fields — we only pick the ones relevant to our
 * domain.  Empty strings from the API are coerced to `null`.
 */
const emptyToNull = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()));

const NhtsaResultItemSchema = z
  .object({
    Make: emptyToNull,
    Model: emptyToNull,
    ModelYear: emptyToNull,
    EngineModel: emptyToNull.optional(),
    EngineCylinders: emptyToNull.optional(),
    DisplacementL: emptyToNull.optional(),
    Trim: emptyToNull.optional(),
    BodyClass: emptyToNull.optional(),
    FuelTypePrimary: emptyToNull.optional(),
    DriveType: emptyToNull.optional(),
    ErrorCode: emptyToNull.optional(),
    ErrorText: emptyToNull.optional(),
  })
  .passthrough(); // allow extra fields without failing

const NhtsaApiResponseSchema = z.object({
  Count: z.number(),
  Results: z.array(NhtsaResultItemSchema).min(1),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface NhtsaDecodeResult {
  year: number;
  make: string;
  model: string;
  engine: string | null;
  trim: string | null;
  bodyClass: string | null;
  fuelType: string | null;
  driveType: string | null;
}

// ---------------------------------------------------------------------------
// Engine description builder
// ---------------------------------------------------------------------------

/**
 * Builds a human-readable engine description from NHTSA fields.
 * Example output: "2.5L 4-Cyl" or "3.5L V6".
 */
function buildEngineLabel(item: z.infer<typeof NhtsaResultItemSchema>): string | null {
  const parts: string[] = [];

  const displacement = item.DisplacementL ?? null;
  if (displacement) {
    parts.push(`${displacement}L`);
  }

  const cylinders = item.EngineCylinders ?? null;
  if (cylinders) {
    const n = parseInt(cylinders, 10);
    if (!isNaN(n)) {
      parts.push(n <= 4 ? `${n}-Cyl` : `V${n}`);
    }
  }

  const model = item.EngineModel ?? null;
  if (model && parts.length === 0) {
    // Use engine model name as fallback when displacement/cylinders are absent
    return model;
  }

  if (parts.length === 0) return null;

  // Optionally append the engine model code if it's short (e.g. "2AR-FE")
  if (model && model.length <= 12) {
    parts.push(model);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode a VIN using the NHTSA vPIC DecodeVinValues endpoint.
 *
 * Returns structured vehicle data or throws on network / parse errors.
 * The caller should catch and provide a generic fallback if needed.
 *
 * Provider notes:
 *   - Free, no API key required.
 *   - No official rate limit, but keep requests < 5/s to be courteous.
 *   - NHTSA error codes "0" = success, others indicate decode issues.
 */
export async function decodeVinWithNhtsa(
  vin: string,
): Promise<NhtsaDecodeResult> {
  const url = `${NHTSA_BASE_URL}/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(NHTSA_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(
      `NHTSA API responded with HTTP ${res.status} for VIN ${vin}.`,
    );
  }

  const json: unknown = await res.json();
  const parsed = NhtsaApiResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `NHTSA API returned unexpected shape: ${parsed.error.message}`,
    );
  }

  const item = parsed.data.Results[0];

  // NHTSA error codes: "0" means success. Anything else may indicate a
  // partially decoded or unrecognised VIN.
  const errorCode = item.ErrorCode ?? "0";
  // Error codes can be comma-separated (e.g. "1,4"). Code "0" = no errors.
  const errorCodes = errorCode.split(",").map((c: string) => c.trim());
  const hasErrors = errorCodes.some((c: string) => c !== "0" && c !== "");

  const yearStr = item.ModelYear;
  const make = item.Make;
  const model = item.Model;

  // If critical fields are missing and there are NHTSA errors, throw so the
  // caller can fall back gracefully.
  if ((!yearStr || !make || !model) && hasErrors) {
    const errorText = item.ErrorText ?? "Unknown NHTSA decode error";
    throw new Error(`NHTSA could not decode VIN ${vin}: ${errorText}`);
  }

  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  return {
    year: isNaN(year) ? new Date().getFullYear() : year,
    make: make ?? "Unknown",
    model: model ?? "Unknown Model",
    engine: buildEngineLabel(item),
    trim: item.Trim ?? null,
    bodyClass: item.BodyClass ?? null,
    fuelType: item.FuelTypePrimary ?? null,
    driveType: item.DriveType ?? null,
  };
}
