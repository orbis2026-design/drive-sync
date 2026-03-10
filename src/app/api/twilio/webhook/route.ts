import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioWebhook } from "@/lib/twilio";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Twilio inbound SMS webhook.
 *
 * Twilio sends a POST request with URL-encoded form data when a client
 * replies to an outbound SMS. This handler verifies the Twilio signature,
 * parses the payload and inserts the inbound message into the `messages`
 * table, triggering Supabase Realtime for any subscribed mechanics.
 *
 * Security: every incoming request is verified using the X-Twilio-Signature
 * header and the TWILIO_AUTH_TOKEN env var via `twilio.validateRequest()`.
 * Requests with invalid signatures are rejected with 403.
 *
 * Twilio Compliance (Issue #138): STOP/UNSUBSCRIBE/CANCEL keywords set
 * opted_out_sms = true on the client record. No auto-reply is sent because
 * Twilio handles STOP responses natively at the carrier level.
 */

/** Normalized opt-out keywords per TCPA / Twilio compliance. */
const OPT_OUT_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL"]);

export async function POST(req: NextRequest) {
  try {
    // Twilio sends application/x-www-form-urlencoded
    const formData = await req.formData();

    // Build a plain object from form data for signature verification.
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    // Verify the request was genuinely sent by Twilio.
    const isValid = await validateTwilioWebhook(req, params);
    if (!isValid) {
      return new NextResponse(twilioXml("Forbidden"), {
        status: 403,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const from = formData.get("From") as string | null;
    const body = formData.get("Body") as string | null;
    const to = formData.get("To") as string | null; // Our Twilio number (maps to tenant)
    const messageSid = formData.get("MessageSid") as string | null;

    if (!from || !body) {
      return new NextResponse(twilioXml("Missing From or Body"), {
        status: 400,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const supabase = createAdminClient();

    // Resolve tenant from the "To" Twilio number
    let tenantId: string | null = null;
    if (to) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("twilio_number", to)
        .single();
      if (tenant) tenantId = tenant.id;
    }

    if (!tenantId) {
      return new NextResponse(twilioXml("Tenant not found"), {
        status: 404,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Resolve client by phone number
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone", from)
      .single();

    // Check for opt-out keywords (Issue #138).
    // Set opted_out_sms = true before inserting the audit message.
    // Intentional non-atomicity: the Prisma update (opted_out_sms) and the
    // Supabase insert (messages audit trail) use separate clients. The message
    // insert is the audit record and should always happen. The opted_out_sms
    // update failure is logged but does not block the audit insert.
    const normalizedBody = body.trim().toUpperCase();
    if (client?.id && OPT_OUT_KEYWORDS.has(normalizedBody)) {
      try {
        await prisma.client.update({
          where: { id: client.id },
          data: { opted_out_sms: true },
        });
      } catch (err) {
        logger.error("Failed to set opted_out_sms", { service: "twilio", tenantId }, err);
      }
    }

    // Idempotency guard — deduplicate repeated Twilio webhook deliveries.
    // Twilio uses MessageSid as a globally unique identifier per message.
    // If we have already processed this SID, return 200 without re-inserting.
    if (messageSid) {
      const { data: existingMessage, error: lookupError } = await supabase
        .from("messages")
        .select("id")
        .eq("message_sid", messageSid)
        .maybeSingle();

      if (lookupError) {
        logger.error("Idempotency check failed", { service: "twilio", tenantId }, lookupError);
        // Continue processing — better to risk a duplicate than to silently drop a message.
      } else if (existingMessage) {
        return new NextResponse(twilioXml(), {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      }
    }

    // Insert message for audit trail regardless of opt-out status.
    const { error } = await supabase.from("messages").insert({
      tenant_id: tenantId,
      client_id: client?.id ?? null,
      body: body.trim(),
      direction: "INBOUND",
      from_number: from,
      message_sid: messageSid,
    });

    if (error) {
      logger.error("Message insert failed", { service: "twilio", tenantId }, error);
      return new NextResponse(twilioXml("Database error"), {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Return empty TwiML — no auto-reply.
    // Twilio handles STOP/UNSUBSCRIBE responses natively at the carrier level.
    return new NextResponse(twilioXml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    logger.error("Unexpected webhook error", { service: "twilio" }, err);
    return new NextResponse(twilioXml("Internal server error"), {
      status: 500,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

function twilioXml(message?: string): string {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}
