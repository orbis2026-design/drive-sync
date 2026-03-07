import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Simulated Twilio inbound SMS webhook.
 *
 * Twilio sends a POST request with URL-encoded form data when a client
 * replies to an outbound SMS. This handler parses the payload and inserts
 * the inbound message into the `messages` table, triggering Supabase Realtime
 * for any subscribed mechanics.
 *
 * In a real deployment you would verify the Twilio signature here using
 * the TWILIO_AUTH_TOKEN env var and the twilio library's
 * `validateRequest` helper. The stub below skips that step so the
 * sandbox can exercise the happy path without live credentials.
 */
export async function POST(req: NextRequest) {
  try {
    // Twilio sends application/x-www-form-urlencoded
    const formData = await req.formData();

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

    // Resolve tenant from the "To" number; fall back to DEMO_TENANT_ID
    let tenantId = process.env.DEMO_TENANT_ID ?? null;
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
