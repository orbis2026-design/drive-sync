/**
 * GET /api/cron/retention
 *
 * Daily retention cron job target.  Scans every TenantVehicle, compares its
 * estimated current mileage and last service date against the GlobalVehicle
 * maintenance schedule, and queues a personalized Twilio SMS payload in the
 * OutboundCampaigns table for every match.
 *
 * Security: requires a valid Bearer token matching the CRON_SECRET env var.
 * Designed to be called by Vercel Cron or Supabase pg_cron.
 *
 * Environment variables required:
 *   CRON_SECRET                  — shared secret verified in the Authorization header
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** US average: ~13 500 miles/year ≈ 37 miles/day. */
const AVG_DAILY_MILES = 37;

/** Flag a vehicle when it is within this many miles of a service interval. */
const MILES_THRESHOLD = 500;

/** Flag a vehicle when its next service date is within this many days. */
const DAYS_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One item in a GlobalVehicle's maintenance_schedule_json array.
 * Matches the DB shape documented in supabase/schema.sql.
 */
interface ScheduleItem {
  /** Human-readable service name, e.g. "Oil Change". */
  task: string;
  /** Recurring mileage interval (e.g. 5000). Present on recurring services. */
  interval_miles?: number;
  /** Recurring time interval in months (e.g. 6). Present on time-based services. */
  interval_months?: number;
}

interface MaintenanceMatch {
  service: string;
  milesUntilDue: number | null;
  daysUntilDue: number | null;
}

// ---------------------------------------------------------------------------
// Security — Bearer token guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail closed: if the secret is not configured, deny all requests.
    return false;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  // Accept both "Bearer <token>" and a raw token for Vercel's x-vercel-signature
  // fallback, but always prefer the Authorization header.
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks.
  return timingSafeEqual(token, cronSecret);
}

/**
 * Constant-time string comparison that prevents timing-based secret extraction.
 * Returns true only when both strings are identical in length and content.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Maintenance logic
// ---------------------------------------------------------------------------

/**
 * Given a vehicle's last known mileage, last service date, and the GlobalVehicle
 * maintenance schedule, return all services that are within the alert thresholds.
 */
function findDueServices(
  lastKnownMileage: number,
  lastServiceDate: Date | null,
  schedule: ScheduleItem[],
): MaintenanceMatch[] {
  const today = new Date();
  const daysSinceService = lastServiceDate
    ? Math.floor(
        (today.getTime() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const estimatedMileage =
    daysSinceService !== null
      ? lastKnownMileage + daysSinceService * AVG_DAILY_MILES
      : lastKnownMileage;

  const matches: MaintenanceMatch[] = [];

  for (const item of schedule) {
    if (!item.task) continue;

    let milesUntilDue: number | null = null;
    let daysUntilDue: number | null = null;
    let triggered = false;

    // --- Mileage-based check ------------------------------------------------
    if (item.interval_miles && item.interval_miles > 0) {
      const nextDueMile =
        Math.ceil(estimatedMileage / item.interval_miles) * item.interval_miles;
      milesUntilDue = nextDueMile - estimatedMileage;
      if (milesUntilDue <= MILES_THRESHOLD) {
        triggered = true;
      }
    }

    // --- Time-based check ---------------------------------------------------
    if (item.interval_months && item.interval_months > 0 && lastServiceDate) {
      const nextDueDate = new Date(lastServiceDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + item.interval_months);
      daysUntilDue = Math.floor(
        (nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue <= DAYS_THRESHOLD) {
        triggered = true;
      }
    }

    if (triggered) {
      matches.push({ service: item.task, milesUntilDue, daysUntilDue });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// SMS copy builder
// ---------------------------------------------------------------------------

function buildMessageBody(
  firstName: string,
  year: number,
  make: string,
  model: string,
  service: string,
  milesUntilDue: number | null,
  daysUntilDue: number | null,
): string {
  const vehicle = `${year} ${make} ${model}`;

  if (milesUntilDue !== null && milesUntilDue <= 0) {
    return (
      `Hi ${firstName}, your ${vehicle} is overdue for its ${service}. ` +
      `Reply YES to book your appointment today.`
    );
  }

  if (milesUntilDue !== null && milesUntilDue <= MILES_THRESHOLD) {
    return (
      `Hi ${firstName}, your ${vehicle} is due for its ${service} in about ` +
      `${milesUntilDue.toLocaleString()} miles. Reply YES to book.`
    );
  }

  if (daysUntilDue !== null && daysUntilDue <= 0) {
    return (
      `Hi ${firstName}, your ${vehicle} is overdue for its ${service} by date. ` +
      `Reply YES to book your appointment today.`
    );
  }

  return (
    `Hi ${firstName}, your ${vehicle} is coming up on its ${service} in ` +
    `about ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}. Reply YES to book.`
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
    // --- 2. Fetch all TenantVehicles with related data ---------------------
    //
    // We join:
    //   tenant_vehicles  — mileage, last_service_date, tenant_id, client_id
    //   clients          — first_name, last_name, phone
    //   global_vehicles  — year, make, model, maintenance_schedule_json
    //
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
          year,
          make,
          model,
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

    // --- 3. Evaluate each vehicle against its maintenance schedule ---------
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

      // Safely unwrap the joined rows (Supabase returns them as objects or null)
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
      const { year, make, model, maintenance_schedule_json } =
        globalVehicle as {
          year: number;
          make: string;
          model: string;
          maintenance_schedule_json: unknown;
        };

      // Validate the schedule JSON shape before processing.
      if (!Array.isArray(maintenance_schedule_json)) continue;
      const schedule = maintenance_schedule_json as ScheduleItem[];

      const lastServiceDate = vehicle.last_service_date
        ? new Date(vehicle.last_service_date as string)
        : null;

      const matches = findDueServices(
        vehicle.mileage as number,
        lastServiceDate,
        schedule,
      );

      for (const match of matches) {
        const body = buildMessageBody(
          firstName,
          year,
          make,
          model,
          match.service,
          match.milesUntilDue,
          match.daysUntilDue,
        );

        campaignRows.push({
          tenant_id: vehicle.tenant_id as string,
          tenant_vehicle_id: vehicle.id,
          client_id: vehicle.client_id as string,
          to_phone: phone,
          message_body: body,
          service_name: match.service,
          miles_until_due: match.milesUntilDue,
          days_until_due: match.daysUntilDue,
          status: "QUEUED",
        });
      }
    }

    // --- 4. Bulk-insert into OutboundCampaigns ----------------------------
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
