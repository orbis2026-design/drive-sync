/**
 * POST /api/stripe/checkout
 *
 * Dual-mode Stripe Checkout handler:
 *
 * ① Subscription mode (pricing table → subscribe)
 *    Request body: { priceId: string }
 *    Creates a new Stripe Customer (or reuses existing), then a Checkout
 *    Session in `subscription` mode. Passes `client_reference_id` set to the
 *    caller's Supabase auth.uid() so the webhook can identify who paid.
 *    Redirects to: /onboarding (success) / / (cancel)
 *
 * ② Work-order payment mode (BNPL, existing flow)
 *    Request body: { workOrderId?: string; token?: string }
 *    Creates a one-time Stripe Checkout Session for a WorkOrder.
 *    Enables Affirm and Klarna BNPL payment methods for totals above $500.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY            — Stripe secret API key
 *   NEXT_PUBLIC_APP_URL          — Base URL of this app (for success/cancel redirects)
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getSessionUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Minimum order total (in cents) to offer BNPL payment methods. */
const BNPL_THRESHOLD_CENTS = 50_000; // $500.00

export async function POST(req: NextRequest) {
  let body: { priceId?: string; workOrderId?: string; token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // ---------------------------------------------------------------------------
  // ① Subscription checkout — triggered from the marketing pricing table
  // ---------------------------------------------------------------------------
  if (body.priceId) {
    const priceId = body.priceId;

    // Identify the caller via their Supabase session cookie.
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "You must be signed in to start a subscription." },
        { status: 401 },
      );
    }

    let session: Stripe.Checkout.Session;
    try {
      const stripe = getStripe();
      const admin = createAdminClient();

      // Re-use the existing Stripe customer if this user's tenant already has one,
      // otherwise create a fresh customer. This prevents duplicate customer records
      // when the user clicks "Start Trial" more than once.
      let stripeCustomerId: string | null = null;

      const { data: tenantRow } = await admin
        .from("tenants")
        .select("stripe_customer_id")
        .eq("owner_user_id", userId)
        .maybeSingle();

      if (tenantRow?.stripe_customer_id) {
        stripeCustomerId = tenantRow.stripe_customer_id as string;
      } else {
        const customer = await stripe.customers.create({
          metadata: { supabase_uid: userId },
        });
        stripeCustomerId = customer.id;
      }

      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer: stripeCustomerId,
        // client_reference_id is the canonical way to identify who paid.
        // The webhook reads this field to update the Tenants row.
        client_reference_id: userId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: 14,
          metadata: { supabase_uid: userId },
        },
        success_url: `${appUrl}/onboarding`,
        cancel_url: `${appUrl}/`,
        billing_address_collection: "auto",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  }

  // ---------------------------------------------------------------------------
  // ② Work-order payment checkout (BNPL — existing flow, unchanged)
  // ---------------------------------------------------------------------------
  const { workOrderId, token } = body;
  if (!workOrderId && !token) {
    return NextResponse.json(
      { error: "priceId, workOrderId, or token is required" },
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
    const stripe = getStripe();
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
