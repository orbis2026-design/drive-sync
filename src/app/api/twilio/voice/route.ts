/**
 * POST /api/twilio/voice
 *
 * Twilio Voice webhook.  When a client calls the mechanic's Twilio number:
 *   1. The call is forwarded to the mechanic's real cell phone (owner_phone).
 *   2. If the call goes unanswered or to voicemail, a status-callback webhook
 *      fires at /api/twilio/voice?event=missed, which texts the caller a
 *      lead-capture message and inserts a LEAD record into the clients table.
 *
 * TwiML verbs used:
 *   <Dial action="..."> — bridges the call and fires the action URL when done
 *   <Number statusCallbackEvent="..."> — requests no-answer/completed events
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID          — Twilio account SID
 *   TWILIO_AUTH_TOKEN           — Twilio auth token
 *   TWILIO_FROM_NUMBER          — Mechanic's Twilio number (same as To)
 *   NEXT_PUBLIC_APP_URL         — Base URL of this Next.js app
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Service-role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioWebhook, sendSMS } from "@/lib/twilio";
import { logger } from "@/lib/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// ---------------------------------------------------------------------------
// TwiML builder helpers
// ---------------------------------------------------------------------------

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    },
  );
}

// ---------------------------------------------------------------------------
// Route handler — handles both the initial call webhook and the status callback
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Parse form data once so we can validate and pass to sub-handlers.
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Verify the request was genuinely sent by Twilio.
  const isValid = await validateTwilioWebhook(req, params);
  if (!isValid) {
    return twimlResponse(
      `<Say voice="Polly.Joanna">Request validation failed.</Say>`,
    );
  }

  const { searchParams } = new URL(req.url);
  const event = searchParams.get("event");

  // --- Missed-call / status callback path ---------------------------------
  if (event === "missed") {
    return handleMissedCall(req, params);
  }

  // --- Initial inbound call -----------------------------------------------
  return handleInboundCall(params);
}

// ---------------------------------------------------------------------------
// handleInboundCall
// Reads the mechanic's forwarding number from Supabase and emits <Dial> TwiML.
// ---------------------------------------------------------------------------

async function handleInboundCall(params: Record<string, string>): Promise<NextResponse> {
  const to = params.To ?? null; // Our Twilio number

  const adminDb = createAdminClient();

  // Resolve the tenant from the "To" Twilio number.
  let tenantId: string | null = null;
  let ownerPhone: string | null = null;
  let tenantName = "Your Mechanic";
  let tenantSlug = "unknown";

  if (to) {
    const { data: tenant } = await adminDb
      .from("tenants")
      .select("id, name, slug, owner_phone")
      .eq("twilio_number", to)
      .single();
    if (tenant) {
      tenantId = (tenant as Record<string, string | null>).id as string;
      ownerPhone = (tenant as Record<string, string | null>).owner_phone ?? null;
      tenantName = (tenant as Record<string, string>).name;
      tenantSlug = (tenant as Record<string, string>).slug;
    }
  }

  // If we still don't have the owner phone, fall back to looking up by tenant ID.
  if (!ownerPhone && tenantId) {
    const { data: tenant } = await adminDb
      .from("tenants")
      .select("name, slug, owner_phone")
      .eq("id", tenantId)
      .single();
    if (tenant) {
      ownerPhone = (tenant as Record<string, string | null>).owner_phone ?? null;
      tenantName = (tenant as Record<string, string>).name;
      tenantSlug = (tenant as Record<string, string>).slug;
    }
  }

  // Build the status-callback URL so we can text the caller if unanswered.
  const callbackUrl =
    `${APP_URL}/api/twilio/voice?event=missed` +
    `&tenantId=${encodeURIComponent(tenantId ?? "")}` +
    `&tenantName=${encodeURIComponent(tenantName)}` +
    `&tenantSlug=${encodeURIComponent(tenantSlug)}`;

  if (!ownerPhone) {
    // No forwarding number configured — play a generic voicemail prompt.
    return twimlResponse(
      `<Say voice="Polly.Joanna">Hi! The shop is currently unavailable. Please leave a message or call back later.</Say>`,
    );
  }

  // Dial the mechanic's real cell phone.  The <Dial> action fires when the
  // call ends, allowing us to detect no-answer via the status callback.
  const dialXml =
    `<Dial action="${callbackUrl}" timeout="20">` +
    `<Number statusCallbackEvent="initiated ringing answered completed" ` +
    `statusCallback="${callbackUrl}">${ownerPhone}</Number>` +
    `</Dial>`;

  return twimlResponse(dialXml);
}

// ---------------------------------------------------------------------------
// handleMissedCall
// Fires when the mechanic's phone goes unanswered.  Texts the original caller
// a lead-capture message and logs them in the clients table.
// ---------------------------------------------------------------------------

async function handleMissedCall(req: NextRequest, params: Record<string, string>): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") ?? "";
  const tenantName = searchParams.get("tenantName") ?? "Your Mechanic";
  const tenantSlug = searchParams.get("tenantSlug") ?? tenantId;

  const dialStatus = params.DialCallStatus ?? null;

  // Only act on calls that were not answered.
  if (dialStatus === "completed") {
    return twimlResponse(""); // Call was answered — nothing to do.
  }

  const callerPhone = params.From ?? null;
  if (!callerPhone) {
    return twimlResponse("");
  }

  const intakeUrl = `${APP_URL}/request/${tenantSlug}`;
  const smsBody =
    `Hi, this is ${tenantName}. I'm under a car right now! ` +
    `You can drop your vehicle details here to get a quick quote: ${intakeUrl}`;

  // Send the missed-call text via the shared Twilio client.
  const smsResult = await sendSMS(callerPhone, smsBody);
  if (!smsResult.success) {
    logger.error("Failed to send missed-call SMS", { service: "twilio", tenantId }, smsResult.error);
  }

  // Log as a LEAD in the clients table (upsert by phone to avoid duplication).
  if (tenantId) {
    const adminDb = createAdminClient();
    try {
      // Check if this phone number is already a known client.
      const { data: existing } = await adminDb
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", callerPhone)
        .single();

      if (!existing) {
        // Insert a bare-bones LEAD record — the mechanic can enrich it later.
        await adminDb.from("clients").insert({
          tenant_id: tenantId,
          first_name: "Lead",
          last_name: callerPhone,
          phone: callerPhone,
          notes: `Missed call lead captured automatically on ${new Date().toISOString()}`,
        });
      }
    } catch (err) {
      logger.error("Failed to log lead", { service: "twilio", tenantId }, err);
    }
  }

  return twimlResponse("");
}
