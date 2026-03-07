"use server";

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Stripe client (lazy-initialised, server-only)
// ---------------------------------------------------------------------------

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment variables.",
    );
  }
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionDetails {
  subscriptionStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "NONE";
  stripeCustomerId: string | null;
  currentPeriodEnd: number | null; // Unix epoch seconds
  paymentMethodLast4: string | null;
  invoices: {
    id: string;
    date: number;
    amountCents: number;
    status: string;
    pdfUrl: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// getSubscriptionDetails — fetch current billing state for the tenant
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

export async function getSubscriptionDetails(): Promise<SubscriptionDetails> {
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id, subscription_status")
    .eq("id", DEMO_TENANT_ID)
    .single();

  if (!tenant?.stripe_customer_id) {
    return {
      subscriptionStatus:
        (tenant?.subscription_status as SubscriptionDetails["subscriptionStatus"]) ??
        "NONE",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      paymentMethodLast4: null,
      invoices: [],
    };
  }

  try {
    const stripe = getStripe();

    // Fetch subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: tenant.stripe_customer_id,
      limit: 1,
      status: "all",
    });
    const sub = subscriptions.data[0] ?? null;

    // Fetch latest invoices
    const invoiceList = await stripe.invoices.list({
      customer: tenant.stripe_customer_id,
      limit: 6,
    });

    // Fetch default payment method last4
    let last4: string | null = null;
    if (
      sub &&
      sub.default_payment_method &&
      typeof sub.default_payment_method !== "string"
    ) {
      last4 = sub.default_payment_method.card?.last4 ?? null;
    }

    const mapStatus = (s: string): SubscriptionDetails["subscriptionStatus"] => {
      if (s === "active") return "ACTIVE";
      if (s === "past_due") return "PAST_DUE";
      if (s === "canceled") return "CANCELED";
      return "NONE";
    };

    // billing_cycle_anchor gives the next renewal as a Unix timestamp
    const nextBillingAt = sub?.billing_cycle_anchor ?? null;

    return {
      subscriptionStatus: sub ? mapStatus(sub.status) : "NONE",
      stripeCustomerId: tenant.stripe_customer_id,
      currentPeriodEnd: nextBillingAt,
      paymentMethodLast4: last4,
      invoices: invoiceList.data.map((inv) => ({
        id: inv.id ?? "",
        date: inv.created,
        amountCents: inv.amount_due,
        status: inv.status ?? "unknown",
        pdfUrl: inv.invoice_pdf ?? null,
      })),
    };
  } catch {
    // Stripe not configured — return DB state
    return {
      subscriptionStatus:
        (tenant.subscription_status as SubscriptionDetails["subscriptionStatus"]) ??
        "ACTIVE",
      stripeCustomerId: tenant.stripe_customer_id,
      currentPeriodEnd: null,
      paymentMethodLast4: null,
      invoices: [],
    };
  }
}

// ---------------------------------------------------------------------------
// createBillingPortalSession — redirect mechanic to Stripe Customer Portal
// ---------------------------------------------------------------------------

export async function createBillingPortalSession(
  returnUrl: string,
): Promise<{ url: string } | { error: string }> {
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", DEMO_TENANT_ID)
    .single();

  // If no Stripe customer exists yet, create a Checkout session instead
  if (!tenant?.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        return {
          error:
            "Stripe is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.",
        };
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${returnUrl}?checkout=success`,
        cancel_url: `${returnUrl}?checkout=canceled`,
        metadata: { tenantId: DEMO_TENANT_ID },
      });
      return { url: session.url! };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { error: `Stripe error: ${msg}` };
    }
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: returnUrl,
    });
    return { url: session.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Could not open billing portal: ${msg}` };
  }
}
