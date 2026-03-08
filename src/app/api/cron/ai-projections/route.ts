/**
 * GET /api/cron/ai-projections
 *
 * Weekly cron job that reads the shop's completed jobs from the last 7 days,
 * generates a motivational AI projection message (via generateWeeklyProjection),
 * and injects it as an AI message into the #insights channel of shop_messages.
 *
 * Schedule: every Sunday at 08:00 UTC (configure in Supabase pg_cron or Vercel Cron).
 *
 * Security: requires a valid Bearer token matching the CRON_SECRET env var.
 *
 * Environment variables required:
 *   CRON_SECRET              — shared secret verified in the Authorization header
 *   DEMO_TENANT_ID           — default tenant ID when no tenant is specified
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (bypasses RLS)
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWeeklyProjection } from "@/lib/ai-projections";

// ---------------------------------------------------------------------------
// Security — Bearer token guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${cronSecret}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) {
    return NextResponse.json(
      { error: "DEMO_TENANT_ID is not configured." },
      { status: 500 },
    );
  }

  // Generate the weekly projection message
  let message: string;
  try {
    message = await generateWeeklyProjection(tenantId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate projection: ${errMsg}` },
      { status: 500 },
    );
  }

  // Insert the AI message into the #insights channel
  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("shop_messages").insert({
    tenant_id: tenantId,
    user_id: "00000000-0000-0000-0000-000000000000", // system/AI user sentinel
    channel: "#insights",
    body: message,
    is_ai: true,
  });

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to insert insight: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message });
}
