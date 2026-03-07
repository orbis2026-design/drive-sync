/**
 * POST /api/stripe/payment-intent
 *
 * Creates a Stripe PaymentIntent for in-person (Terminal) or online payments,
 * with conditional BNPL (Affirm / Klarna) support at the $250 threshold for
 * the client portal.
 *
 * Request body:
 *   { workOrderId: string; terminalMode?: boolean }
 *
 * Responses:
 *   200  { clientSecret: string; paymentIntentId: string; terminalConfig?: object }
 *   400  { error: string }  — missing / invalid body fields
 *   404  { error: string }  — work order not found
 *   500  { error: string }  — Stripe or database error
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY
 *   DATABASE_URL           — used by the Prisma client
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

/**
 * Minimum order total in cents to offer BNPL payment methods (Affirm / Klarna)
 * in the client portal. This is lower than the Checkout Session threshold
 * ($500) because the portal serves clients who may have smaller jobs.
 */
const BNPL_THRESHOLD_CENTS = 25_000; // $250.00

export async function POST(req: NextRequest) {
  // --- Parse request body --------------------------------------------------
  let body: { workOrderId?: unknown; terminalMode?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workOrderId, terminalMode } = body;

  if (typeof workOrderId !== "string" || workOrderId.trim() === "") {
    return NextResponse.json(
      { error: "workOrderId is required" },
      { status: 400 },
    );
  }

  const isTerminal = terminalMode === true;

  // --- Fetch WorkOrder from Prisma ------------------------------------------
  let workOrder: {
    id: string;
    title: string;
    laborCents: number;
    partsCents: number;
    tenant: { id: string; name: string; stripeCustomerId: string | null };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId.trim() },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        tenant: {
          select: { id: true, name: true, stripeCustomerId: true },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!workOrder) {
    return NextResponse.json(
      { error: "Work order not found" },
      { status: 404 },
    );
  }

  // --- Compute total -------------------------------------------------------
  const subtotal = workOrder.laborCents + workOrder.partsCents;
  const tax = Math.round(subtotal * TAX_RATE);
  const totalCents = subtotal + tax;

  // --- Determine payment method types --------------------------------------
  let paymentMethodTypes: string[];

  if (isTerminal) {
    // Terminal (Tap-to-Pay): card_present only.
    paymentMethodTypes = ["card_present"];
  } else if (totalCents >= BNPL_THRESHOLD_CENTS) {
    // Online, order ≥ $250: offer card + Affirm + Klarna.
    paymentMethodTypes = ["card", "affirm", "klarna"];
  } else {
    // Online, order < $250: card only.
    paymentMethodTypes = ["card"];
  }

  // --- Create Stripe PaymentIntent -----------------------------------------
  try {
    const stripe = getStripe();

    // Base parameters shared across all modes.
    const intentParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: totalCents,
      currency: "usd",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payment_method_types: paymentMethodTypes as any,
      metadata: {
        workOrderId: workOrder.id,
        tenantId: workOrder.tenant.id,
      },
      description: `${workOrder.title} — ${workOrder.tenant.name}`,
    };

    // Terminal-specific options: automatic capture + card_present config.
    if (isTerminal) {
      intentParams.capture_method = "automatic";
      intentParams.payment_method_options = {
        card_present: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request_extended_authorization: "if_available" as any,
          request_incremental_authorization_support: true,
        },
      };
    }

    const intent = await stripe.paymentIntents.create(intentParams);

    const response: {
      clientSecret: string;
      paymentIntentId: string;
      terminalConfig?: {
        supportedReaders: string[];
        locationId: string | null;
        captureMethod: string;
      };
    } = {
      clientSecret: intent.client_secret!,
      paymentIntentId: intent.id,
    };

    if (isTerminal) {
      response.terminalConfig = {
        supportedReaders: ["bbpos_wisepad3", "stripe_m2"],
        locationId: null, // Set from tenant config in production
        captureMethod: "automatic",
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
