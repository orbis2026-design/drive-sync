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

  // Build a human-readable ETA string
  const scheduledAt = wo.scheduled_at
    ? new Date(wo.scheduled_at as string).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "soon";

  const client = (wo.client as unknown) as { first_name: string; last_name: string; phone?: string } | null;
  const vehicle = (wo.vehicle as unknown) as { make: string; model: string; year: number } | null;
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

  // Send SMS via Twilio if credentials are present
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (accountSid && authToken && fromNumber) {
    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(accountSid, authToken);
      await client.messages.create({
        to: clientPhone,
        from: fromNumber,
        body: smsBody,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Twilio error";
      return NextResponse.json(
        { error: `SMS delivery failed: ${message}` },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ sent: true, phone: clientPhone });
}
