/**
 * POST /api/dispatch/notify-eta
 *
 * Triggered by the ElasticDispatchPrompt when a mechanic confirms they want
 * to notify a client of an earlier ETA after a cancellation creates a gap.
 *
 * Looks up the work order's client phone number, calculates the new ETA
 * from the work order's scheduledAt, and fires an SMS via Twilio.
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID   — Twilio account SID
 *   TWILIO_AUTH_TOKEN    — Twilio auth token
 *   TWILIO_FROM_NUMBER   — Mechanic's Twilio number
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilio";

// ---------------------------------------------------------------------------
// Types — Supabase joined query result shapes
// ---------------------------------------------------------------------------

interface WorkOrderClientRow {
  first_name: string;
  last_name: string;
  phone?: string;
}

interface WorkOrderVehicleRow {
  make: string;
  model: string;
  year: number;
}

interface WorkOrderWithRelations {
  id: string;
  title: string;
  scheduled_at: string | null;
  client: WorkOrderClientRow | WorkOrderClientRow[] | null;
  vehicle: WorkOrderVehicleRow | WorkOrderVehicleRow[] | null;
}

export async function POST(req: NextRequest) {
  let body: { workOrderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { workOrderId } = body;
  if (!workOrderId || typeof workOrderId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'workOrderId'." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch the work order with client and vehicle info
  const { data: wo, error: woErr } = await admin
    .from("work_orders")
    .select(
      `id, title, scheduled_at,
       client:clients(first_name, last_name, phone),
       vehicle:tenant_vehicles(make, model, year)`,
    )
    .eq("id", workOrderId)
    .single();

  if (woErr || !wo) {
    return NextResponse.json(
      { error: "Work order not found." },
      { status: 404 },
    );
  }

  const woTyped = wo as unknown as WorkOrderWithRelations;

  // Build a human-readable ETA string
  const scheduledAt = woTyped.scheduled_at
    ? new Date(woTyped.scheduled_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "soon";

  // Supabase returns a single-row join as an array when using !inner syntax;
  // normalise to a single object regardless.
  const rawClient = woTyped.client;
  const client: WorkOrderClientRow | null = Array.isArray(rawClient)
    ? (rawClient[0] ?? null)
    : rawClient;

  const rawVehicle = woTyped.vehicle;
  const vehicle: WorkOrderVehicleRow | null = Array.isArray(rawVehicle)
    ? (rawVehicle[0] ?? null)
    : rawVehicle;

  const clientPhone = client?.phone;

  if (!clientPhone) {
    // No phone on file — acknowledge silently so the UI still proceeds
    return NextResponse.json({ sent: false, reason: "No client phone on file." });
  }

  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : "your vehicle";

  const smsBody =
    `Great news, ${client?.first_name ?? "there"}! Your technician's schedule opened up ` +
    `and they can now arrive for the ${vehicleLabel} service at approximately ${scheduledAt}. ` +
    `Reply STOP to opt out.`;

  // Send SMS via Twilio
  const smsResult = await sendSMS(clientPhone, smsBody);
  if (!smsResult.success) {
    return NextResponse.json(
      { error: `SMS delivery failed: ${smsResult.error}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true, phone: clientPhone });
}
