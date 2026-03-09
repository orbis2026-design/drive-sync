/**
 * GET /api/cron/reviews
 *
 * Daily cron job that scans WorkOrders marked PAID within the last 24 hours
 * and sends a Google review request SMS via Twilio to each customer —
 * unless a "Declined Safety Fail" was recorded in their MPI, which would
 * risk texting an angry customer.
 *
 * Security: requires a valid Bearer token matching the CRON_SECRET env var.
 *
 * Environment variables required:
 *   CRON_SECRET                  — shared secret verified in the Authorization header
 *   TWILIO_ACCOUNT_SID           — Twilio account SID
 *   TWILIO_AUTH_TOKEN            — Twilio auth token
 *   TWILIO_FROM_NUMBER           — Twilio sending number
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilio";

// ---------------------------------------------------------------------------
// Security — Bearer token guard (same pattern as retention cron)
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
// MPI helper — check if any safety-critical item was declined
// ---------------------------------------------------------------------------

/**
 * Returns true when the inspection JSON contains at least one FAIL-status
 * item that was unchecked (declined) by the client, indicating they drove
 * away knowing about a safety issue. We skip review texts for these orders
 * to avoid prompting a potentially dissatisfied customer.
 */
function hasDeclinedSafetyFail(inspectionJson: unknown): boolean {
  if (!inspectionJson || typeof inspectionJson !== "object") return false;

  const mpi = inspectionJson as Record<string, unknown>;
  for (const key of Object.keys(mpi)) {
    const point = mpi[key] as Record<string, unknown> | null;
    if (
      point &&
      typeof point === "object" &&
      point.status === "FAIL" &&
      point.declined === true
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = createAdminClient();
  const runAt = new Date().toISOString();
  let ordersScanned = 0;
  let smsSent = 0;
  let skippedGatekeeper = 0;
  const errors: string[] = [];

  // --- 1. Fetch WorkOrders paid within the last 24 hours ------------------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let paidOrders: {
    id: string;
    tenantId: string;
    client: { firstName: string; phone: string };
    tenant: {
      name: string;
      googlePlaceId: string | null;
      reviewLink: string | null;
    };
  }[] = [];

  try {
    paidOrders = await prisma.workOrder.findMany({
      where: {
        status: "PAID",
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        tenantId: true,
        client: { select: { firstName: true, phone: true } },
        tenant: {
          select: { name: true, googlePlaceId: true, reviewLink: true },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Failed to fetch paid orders", detail: message },
      { status: 500 },
    );
  }

  // --- 2. For each order, apply gatekeeper and send SMS --------------------
  for (const order of paidOrders) {
    ordersScanned++;

    // Skip if no review link configured for this tenant.
    const reviewLink = order.tenant.reviewLink;
    if (!reviewLink) continue;

    // --- Gatekeeper: skip if there were declined safety fails ---------------
    let inspectionJson: unknown = null;
    try {
      const { data } = await adminDb
        .from("work_orders")
        .select("inspection_json")
        .eq("id", order.id)
        .single();
      inspectionJson = (data as Record<string, unknown> | null)
        ?.inspection_json ?? null;
    } catch {
      // Non-fatal — treat as no inspection data.
    }

    if (hasDeclinedSafetyFail(inspectionJson)) {
      skippedGatekeeper++;
      continue;
    }

    // --- Send SMS -----------------------------------------------------------
    const { firstName, phone } = order.client;
    const shopName = order.tenant.name;
    const body =
      `Thanks for choosing ${shopName}! If your car is running great, ` +
      `it would mean the world if you left a quick review: ${reviewLink}`;

    try {
      const smsResult = await sendSMS(phone, body);
      if (smsResult.success) {
        smsSent++;
      } else {
        errors.push(`[${order.id}] ${firstName}: ${smsResult.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Twilio error";
      errors.push(`[${order.id}] ${firstName}: ${message}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    runAt,
    ordersScanned,
    smsSent,
    skippedGatekeeper,
    ...(errors.length > 0 && { errors }),
  });
}
