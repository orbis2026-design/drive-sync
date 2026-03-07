/**
 * /api/stripe/webhook/route.ts
 *
 * Stripe Webhook listener for DriveSync billing events.
 *
 * Handles:
 *   • invoice.payment_succeeded  → set subscription_status = ACTIVE
 *   • customer.subscription.updated → mirror status to Supabase tenants row
 *
 * Security: every incoming request is verified using the Stripe-Signature
 * header and the webhook signing secret (STRIPE_WEBHOOK_SECRET env var).
 * Requests with invalid signatures are rejected with 400.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Stripe client (server-only)
// ---------------------------------------------------------------------------

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// ---------------------------------------------------------------------------
// Status mapping helpers
// ---------------------------------------------------------------------------

type SupabaseStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";

function stripeStatusToSupabase(status: string): SupabaseStatus {
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  return "CANCELED";
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Signature verification failed:", msg);
    return NextResponse.json(
      { error: `Webhook signature invalid: ${msg}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // Route by event type
  // -------------------------------------------------------------------------

  try {
    switch (event.type) {
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (customerId) {
          const { error } = await admin
            .from("tenants")
            .update({ subscription_status: "ACTIVE" })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to update tenant on payment_succeeded:",
              error,
            );
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        if (customerId) {
          const newStatus = stripeStatusToSupabase(subscription.status);

          const { error } = await admin
            .from("tenants")
            .update({ subscription_status: newStatus })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to update tenant subscription status:",
              error,
            );
          }
        }
        break;
      }

      case "checkout.session.completed": {
        // When a new subscriber completes checkout, save their stripe_customer_id.
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (tenantId && customerId) {
          const { error } = await admin
            .from("tenants")
            .update({
              stripe_customer_id: customerId,
              subscription_status: "ACTIVE",
            })
            .eq("id", tenantId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to save stripe_customer_id:",
              error,
            );
          }
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt to avoid retries.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Handler error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
