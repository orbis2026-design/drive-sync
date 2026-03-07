/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for a given WorkOrder.
 * Enables Affirm and Klarna BNPL payment methods for totals above $500.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY            — Stripe secret API key
 *   NEXT_PUBLIC_APP_URL          — Base URL of this app (for success/cancel redirects)
 *   DEMO_TENANT_ID               — Fallback tenant ID
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-02-25.clover",
});

/** Minimum order total (in cents) to offer BNPL payment methods. */
const BNPL_THRESHOLD_CENTS = 50_000; // $500.00

export async function POST(req: NextRequest) {
  let body: { workOrderId?: string; token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workOrderId, token } = body;
  if (!workOrderId && !token) {
    return NextResponse.json(
      { error: "workOrderId or token is required" },
      { status: 400 },
    );
  }

  // --- Fetch the WorkOrder -------------------------------------------------
  let workOrder: {
    id: string;
    title: string;
    laborCents: number;
    partsCents: number;
    tenant: { id: string; name: string; stripeCustomerId: string | null };
    client: { firstName: string; lastName: string; email: string | null };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findFirst({
      where: workOrderId ? { id: workOrderId } : { approvalToken: token },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        tenant: {
          select: { id: true, name: true, stripeCustomerId: true },
        },
        client: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!workOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // --- Compute total -------------------------------------------------------
  const TAX_RATE = 0.0875;
  const subtotal = workOrder.laborCents + workOrder.partsCents;
  const tax = Math.round(subtotal * TAX_RATE);
  const totalCents = subtotal + tax;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // --- Determine payment methods -------------------------------------------
  // Always include card. Add Affirm and Klarna when the total exceeds $500
  // (the BNPL threshold) — these require the billing address from the customer.
  const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
    ["card"];
  if (totalCents >= BNPL_THRESHOLD_CENTS) {
    paymentMethodTypes.push("affirm", "klarna");
  }

  // --- Create Stripe Checkout session -------------------------------------
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      customer: workOrder.tenant.stripeCustomerId ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalCents,
            product_data: {
              name: workOrder.title,
              description: `Service at ${workOrder.tenant.name}`,
            },
          },
          quantity: 1,
        },
      ],
      // Pass WorkOrder and Tenant IDs in metadata so the webhook can
      // correctly attribute the payout to the mechanic's account.
      metadata: {
        workOrderId: workOrder.id,
        tenantId: workOrder.tenant.id,
        clientName: `${workOrder.client.firstName} ${workOrder.client.lastName}`,
      },
      customer_email: workOrder.client.email ?? undefined,
      success_url: `${appUrl}/portal/${token ?? workOrder.id}?payment=success`,
      cancel_url: `${appUrl}/portal/${token ?? workOrder.id}?payment=cancelled`,
      // Billing address collection is required for Affirm/Klarna.
      billing_address_collection:
        totalCents >= BNPL_THRESHOLD_CENTS ? "required" : "auto",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
