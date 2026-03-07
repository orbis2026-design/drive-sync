/**
 * GET /api/cron/retention
 *
 * Predictive SMS Retention Cron Job — Phase 15 rewrite (Issue #58).
 *
 * Uses the Phase 14/15 `maintenance_schedule_json` structure
 * ([{ mileage, tasks[] }]) to project each vehicle's upcoming mileage and
 * queue high-urgency SMS payloads when a 30,000 / 60,000 / 90,000-mile
 * critical service interval is approaching.
 *
 * Projection formula (Issue #58):
 *   projected_mileage = current_odometer
 *                     + (AVG_DAILY_MILES × days_since_last_service)
 *
 * A campaign is queued when the projected mileage falls within LOOK_AHEAD_MILES
 * of a major milestone AND the milestone exists in the vehicle's maintenance matrix.
 *
 * Security: requires a valid Bearer token matching the CRON_SECRET env var.
 *
 * Environment variables required:
 *   CRON_SECRET                  — shared secret verified in the Authorization header
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MaintenanceScheduleSchema } from "@/lib/schemas/maintenance";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** US average: ~13,500 miles/year ≈ 37 miles/day. */
const AVG_DAILY_MILES = 37;

/**
 * Critical mileage milestones that trigger the high-urgency SMS.
 * Issue #58: "30,000, 60,000, or 90,000-mile milestone".
 */
const CRITICAL_MILESTONES = [30_000, 60_000, 90_000];

/**
 * Alert window: queue an SMS when the projected mileage is within this
 * many miles of a critical milestone.
 */
const LOOK_AHEAD_MILES = 3_000;

// ---------------------------------------------------------------------------
// Security — Bearer token guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  if (token.length !== cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Mileage projection
// ---------------------------------------------------------------------------

/**
 * Projects the vehicle's current mileage based on the last recorded odometer
 * reading and the average daily miles since the last service date.
 */
function projectMileage(
  lastKnownMileage: number,
  lastServiceDate: Date | null,
): number {
  if (!lastServiceDate) return lastKnownMileage;
  const daysSinceService = Math.max(
    0,
    Math.floor(
      (Date.now() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  return lastKnownMileage + daysSinceService * AVG_DAILY_MILES;
}

// ---------------------------------------------------------------------------
// Milestone resolver
// ---------------------------------------------------------------------------

/**
 * Returns the critical milestones that the projected mileage is approaching
 * (within LOOK_AHEAD_MILES) AND that exist in the vehicle's maintenance matrix.
 *
 * A milestone "exists in the matrix" means there is an interval entry whose
 * mileage value equals the milestone (or a multiple of it that the vehicle
 * is approaching next).
 */
function findApproachingMilestones(
  projectedMileage: number,
  maintenanceMatrix: { mileage: number; tasks: string[] }[],
): { milestone: number; tasks: string[] }[] {
  const matrixMileages = new Set(maintenanceMatrix.map((i) => i.mileage));
  const results: { milestone: number; tasks: string[] }[] = [];

  for (const base of CRITICAL_MILESTONES) {
    // Find the next occurrence of this recurring milestone.
    const nextOccurrence = Math.ceil(projectedMileage / base) * base;
    const milesAway = nextOccurrence - projectedMileage;

    if (milesAway < 0 || milesAway > LOOK_AHEAD_MILES) continue;

    // Confirm the milestone is represented in this vehicle's matrix.
    if (!matrixMileages.has(nextOccurrence)) continue;

    const tasks =
      maintenanceMatrix.find((i) => i.mileage === nextOccurrence)?.tasks ?? [];

    results.push({ milestone: nextOccurrence, tasks });
  }

  return results;
}

// ---------------------------------------------------------------------------
// SMS copy builder (high-urgency, Issue #58)
// ---------------------------------------------------------------------------

function buildUrgentSmsBody(
  firstName: string,
  make: string,
  model: string,
  milestoneMiles: number,
  bookingUrl: string,
): string {
  const milestoneK = milestoneMiles / 1_000;
  return (
    `Hi ${firstName}, your ${make} ${model} is approaching its critical ` +
    `${milestoneK}k service interval. ` +
    `Tap here to book your mobile appointment: ${bookingUrl}`
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // --- 1. Auth -------------------------------------------------------------
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = createAdminClient();
  const runAt = new Date().toISOString();
  let vehiclesScanned = 0;
  let campaignsQueued = 0;
  const errors: string[] = [];

  try {
    // --- 2. Fetch TenantVehicles with related maintenance data --------------
    const { data: vehicles, error: fetchError } = await adminDb
      .from("tenant_vehicles")
      .select(
        `
        id,
        tenant_id,
        client_id,
        mileage,
        last_service_date,
        clients (
          first_name,
          last_name,
          phone
        ),
        global_vehicles (
          make,
          model,
          year,
          maintenance_schedule_json
        )
      `,
      )
      .not("mileage", "is", null);

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch vehicles", detail: fetchError.message },
        { status: 500 },
      );
    }

    if (!vehicles || vehicles.length === 0) {
      return NextResponse.json({
        ok: true,
        runAt,
        vehiclesScanned: 0,
        campaignsQueued: 0,
      });
    }

    const bookingBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.drivesync.app";

    const campaignRows: {
      tenant_id: string;
      tenant_vehicle_id: string;
      client_id: string;
      to_phone: string;
      message_body: string;
      service_name: string;
      miles_until_due: number | null;
      days_until_due: number | null;
      status: "QUEUED";
    }[] = [];

    for (const vehicle of vehicles) {
      vehiclesScanned++;

      // Safely unwrap Supabase joined rows.
      const client = Array.isArray(vehicle.clients)
        ? vehicle.clients[0]
        : vehicle.clients;
      const globalVehicle = Array.isArray(vehicle.global_vehicles)
        ? vehicle.global_vehicles[0]
        : vehicle.global_vehicles;

      if (!client || !globalVehicle) continue;

      const phone = (client as { phone?: string }).phone;
      if (!phone) continue;

      const firstName = (client as { first_name: string }).first_name;
      const { make, model, maintenance_schedule_json } = globalVehicle as {
        make: string;
        model: string;
        year: number;
        maintenance_schedule_json: unknown;
      };

      // Validate against the Phase 14/15 canonical schema.
      const scheduleResult =
        MaintenanceScheduleSchema.safeParse(maintenance_schedule_json);
      if (!scheduleResult.success) continue;

      const lastServiceDate = vehicle.last_service_date
        ? new Date(vehicle.last_service_date as string)
        : null;

      const projectedMileage = projectMileage(
        vehicle.mileage as number,
        lastServiceDate,
      );

      // Find critical milestones the vehicle is approaching.
      const approaching = findApproachingMilestones(
        projectedMileage,
        scheduleResult.data,
      );

      for (const { milestone, tasks } of approaching) {
        const milesUntilDue = milestone - projectedMileage;
        const bookingUrl = `${bookingBaseUrl}/request/${vehicle.tenant_id}`;

        const body = buildUrgentSmsBody(
          firstName,
          make,
          model,
          milestone,
          bookingUrl,
        );

        campaignRows.push({
          tenant_id: vehicle.tenant_id as string,
          tenant_vehicle_id: vehicle.id,
          client_id: vehicle.client_id as string,
          to_phone: phone,
          message_body: body,
          service_name: tasks.join(", "),
          miles_until_due: Math.round(milesUntilDue),
          days_until_due: null,
          status: "QUEUED",
        });
      }
    }

    // --- 3. Bulk-insert into OutboundCampaigns ----------------------------
    if (campaignRows.length > 0) {
      const { error: insertError } = await adminDb
        .from("outbound_campaigns")
        .insert(campaignRows);

      if (insertError) {
        errors.push(`Insert failed: ${insertError.message}`);
      } else {
        campaignsQueued = campaignRows.length;
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      runAt,
      vehiclesScanned,
      campaignsQueued,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Cron job failed", detail: message },
      { status: 500 },
    );
  }
}
