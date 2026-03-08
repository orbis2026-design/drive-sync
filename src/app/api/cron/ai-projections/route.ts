/**
 * GET /api/cron/ai-projections
 *
 * Weekly cron job that reads each active tenant's completed jobs from the last
 * 7 days, generates a motivational AI projection message (via
 * generateWeeklyProjection), and injects it as an AI message into the
 * #insights channel of shop_messages.
 *
 * Schedule: every Sunday at 08:00 UTC (configure in Supabase pg_cron or Vercel Cron).
 *
 * Security: requires a valid Bearer token matching the CRON_SECRET env var.
 *
 * Environment variables required:
 *   CRON_SECRET              — shared secret verified in the Authorization header
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (bypasses RLS)
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWeeklyProjection } from "@/lib/ai-projections";

// Sentinel UUID used as the user_id for AI-generated messages.
// This UUID will never match a real auth.users row; it identifies the system.
const SYSTEM_AI_USER_ID = "00000000-0000-0000-0000-000000000000";

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

  const admin = createAdminClient();

  // Fetch all active tenants to generate projections for each
  const { data: tenants, error: tenantsErr } = await admin
    .from("tenants")
    .select("id")
    .eq("subscription_status", "ACTIVE");

  if (tenantsErr || !tenants || tenants.length === 0) {
    return NextResponse.json(
      { error: "No active tenants found." },
      { status: 500 },
    );
  }

  const results: { tenantId: string; ok: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    const tenantId = tenant.id as string;

    // Generate the weekly projection message
    let message: string;
    try {
      message = await generateWeeklyProjection(tenantId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      results.push({ tenantId, ok: false, error: errMsg });
      continue;
    }

    // Insert the AI message into the #insights channel
    const { error: insertErr } = await admin.from("shop_messages").insert({
      tenant_id: tenantId,
      user_id: SYSTEM_AI_USER_ID,
      channel: "#insights",
      body: message,
      is_ai: true,
    });

    if (insertErr) {
      results.push({ tenantId, ok: false, error: insertErr.message });
    } else {
      results.push({ tenantId, ok: true });
    }
  }

  return NextResponse.json({ ok: true, results });
}
