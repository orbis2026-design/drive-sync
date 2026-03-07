/**
 * POST /api/lexicon/extract
 *
 * VIN Cache-Miss & Sequential API Worker (Issue #54).
 *
 * Triggered when a scanned VIN is not found in the GlobalVehicles database.
 * Fetches all vehicle data from the CarMD provider (engine/trim, maintenance
 * schedule, TSBs), validates it, and persists a new GlobalVehicles row.
 *
 * Security:
 *   • Requires a valid Bearer token matching LEXICON_SECRET env var.
 *   • Input VIN is validated as exactly 17 alphanumeric characters.
 *   • All external API data is parsed through Zod schemas; cost fields are
 *     stripped before touching the database (Issue #54 acceptance criteria).
 *
 * Environment variables required:
 *   LEXICON_SECRET               — shared secret in the Authorization header
 *   CARMD_API_KEY                — CarMD API key
 *   CARMD_BASE_URL               — (optional) override CarMD base URL
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCarMdData } from "@/lib/api-adapters/carmd";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

/** Standard VIN is exactly 17 characters: digits and letters except I, O, Q. */
const VinSchema = z
  .string()
  .length(17, "VIN must be exactly 17 characters.")
  .regex(
    /^[A-HJ-NPR-Z0-9]{17}$/i,
    "VIN must contain only valid alphanumeric characters (I, O, Q are not valid VIN characters).",
  )
  .transform((v) => v.toUpperCase());

const RequestBodySchema = z.object({
  vin: VinSchema,
});

// ---------------------------------------------------------------------------
// Security — Bearer token guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.LEXICON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  // Constant-time comparison to prevent timing attacks.
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // --- 1. Auth -------------------------------------------------------------
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- 2. Parse & validate request body ------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { vin } = parsed.data;

  // --- 3. Check for existing record ----------------------------------------
  const adminDb = createAdminClient();

  const { data: existing } = await adminDb
    .from("global_vehicles")
    .select("id")
    .eq("vin", vin)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { globalVehicleId: existing.id, cached: true },
      { status: 200 },
    );
  }

  // --- 4. Fetch data from CarMD (decode → maintenance → tsb) ---------------
  let vehicleData: Awaited<ReturnType<typeof fetchCarMdData>>;
  try {
    vehicleData = await fetchCarMdData(vin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CarMD fetch failed.";
    return NextResponse.json(
      { error: `Provider error: ${message}` },
      { status: 502 },
    );
  }

  const { decode, maintenanceSchedule, knownFaults } = vehicleData;

  // --- 5. INSERT into global_vehicles ---------------------------------------
  const { data: inserted, error: insertError } = await adminDb
    .from("global_vehicles")
    .insert({
      vin,
      make: decode.make,
      model: decode.model,
      year: decode.year,
      engine: decode.engine ?? null,
      trim: decode.trim ?? null,
      maintenance_schedule_json: maintenanceSchedule,
      known_faults_json: knownFaults,
      last_tsb_sync: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    const detail = insertError?.message ?? "Unknown insert error.";
    return NextResponse.json(
      { error: `Failed to persist vehicle data: ${detail}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { globalVehicleId: inserted.id, cached: false },
    { status: 201 },
  );
}
