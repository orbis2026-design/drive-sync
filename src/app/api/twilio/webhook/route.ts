import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioWebhook } from "@/lib/twilio";

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
 */
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

    const { error } = await supabase.from("messages").insert({
      tenant_id: tenantId,
      client_id: client?.id ?? null,
      body: body.trim(),
      direction: "INBOUND",
      from_number: from,
    });

    if (error) {
      console.error("[twilio/webhook] Supabase insert error:", error);
      return new NextResponse(twilioXml("Database error"), {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Respond with empty TwiML so Twilio doesn't auto-reply
    return new NextResponse(twilioXml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("[twilio/webhook] Unexpected error:", err);
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
