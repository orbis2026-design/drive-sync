/**
 * /api/stripe/webhook/route.ts
 *
 * Stripe Webhook listener for DriveSync billing events.
 *
 * Handles:
 *   • invoice.payment_succeeded      → set subscription_status = ACTIVE
 *   • customer.subscription.updated  → mirror status to Supabase tenants row
 *   • customer.subscription.deleted  → flip status to PAST_DUE (locks app access)
 *   • checkout.session.completed     → provision tenant on new subscription signup
 *
 * Security: every incoming request is verified using the Stripe-Signature
 * header and the webhook signing secret (STRIPE_WEBHOOK_SECRET env var).
 * Requests with invalid signatures are rejected with 400.
 *
 * Provisioning logic for checkout.session.completed:
 *   The Checkout Session created by /api/stripe/checkout (subscription mode)
 *   carries a `client_reference_id` equal to the buyer's Supabase auth.uid().
 *   We use that UID to locate the matching tenant row (owner_user_id column)
 *   and set stripe_customer_id + subscription_status = ACTIVE.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { decrementStockForWorkOrder } from "@/lib/inventory/auto-decrement";

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
  // Idempotency guard — deduplicate repeated Stripe webhook deliveries.
  // Stripe may retry an event multiple times if our endpoint returns non-2xx.
  // We use the webhook_events table to record processed event IDs and skip
  // any event we have already handled.
  // -------------------------------------------------------------------------
  {
    // First, check if this event has already been processed.
    const { data: existingEvent } = await admin
      .from("webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      // Already processed — return 200 to stop Stripe from retrying.
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Record the event before processing to claim it. Use upsert with
    // ignoreDuplicates so that a concurrent insert (race condition) is
    // handled safely without overwriting the original processed_at timestamp.
    const { error: upsertError } = await admin
      .from("webhook_events")
      .upsert(
        {
          event_id: event.id,
          event_type: event.type,
          processed_at: new Date().toISOString(),
        },
        { onConflict: "event_id", ignoreDuplicates: true },
      );

    if (upsertError) {
      // For non-duplicate errors, log but continue — better to process
      // than to silently drop a billing event.
      console.warn(
        "[stripe/webhook] webhook_events upsert warning:",
        upsertError,
      );
    }
  }

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

      case "customer.subscription.updated": {
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

      case "customer.subscription.deleted": {
        // Subscription was canceled or payment definitively failed.
        // Flip status to PAST_DUE so the proxy guard (Issue #29) locks the
        // mechanic out of the app until they re-subscribe.
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        if (customerId) {
          const { error } = await admin
            .from("tenants")
            .update({ subscription_status: "PAST_DUE" })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to set PAST_DUE on subscription.deleted:",
              error,
            );
          }
        }
        break;
      }

      case "checkout.session.completed": {
        // A new subscriber completed the pricing-table checkout flow.
        // The session carries client_reference_id = Supabase auth.uid().
        // Find the matching tenant by owner_user_id and activate it.
        const session = event.data.object as Stripe.Checkout.Session;

        // Support both the legacy metadata.tenantId path and the new
        // client_reference_id path so existing work-order checkouts still work.
        const legacyTenantId = session.metadata?.tenantId;
        const ownerUserId = session.client_reference_id;

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (legacyTenantId && customerId) {
          // Work-order checkout completed — update tenant by ID (legacy path).
          const { error } = await admin
            .from("tenants")
            .update({
              stripe_customer_id: customerId,
              subscription_status: "ACTIVE",
            })
            .eq("id", legacyTenantId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to save stripe_customer_id (legacy):",
              error,
            );
          }

          // Auto-decrement van stock for the work order.
          // Intentional non-atomicity: tenant activation (above) and stock decrement
          // use separate Supabase calls. If the stock decrement fails, the tenant
          // remains activated (correct behaviour — stock is best-effort inventory
          // tracking and should not block payment confirmation).
          const workOrderId = session.metadata?.workOrderId;
          if (workOrderId) {
            await decrementStockForWorkOrder(workOrderId, legacyTenantId);
          }
        } else if (ownerUserId && customerId) {
          // Subscription checkout completed — find tenant by owner_user_id.
          const { error } = await admin
            .from("tenants")
            .update({
              stripe_customer_id: customerId,
              subscription_status: "ACTIVE",
            })
            .eq("owner_user_id", ownerUserId);

          if (error) {
            console.error(
              "[stripe/webhook] Failed to activate tenant for user:",
              ownerUserId,
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
