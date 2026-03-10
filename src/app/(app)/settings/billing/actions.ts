"use server";

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySession, getSessionUserId } from "@/lib/auth";

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

export async function getSubscriptionDetails(): Promise<SubscriptionDetails> {
  const admin = createAdminClient();

  // Try to get tenantId from the session; for new users without a user_roles
  // row yet, fall back to a direct tenant lookup by owner_user_id.
  let tenantId: string | null = null;
  try {
    ({ tenantId } = await verifySession());
  } catch {
    const userId = await getSessionUserId();
    if (userId) {
      const { data: t } = await admin
        .from("tenants")
        .select("id")
        .eq("owner_user_id", userId)
        .maybeSingle();
      tenantId = t?.id ?? null;
    }
  }

  // No tenant at all — user is brand new, return a safe default.
  if (!tenantId) {
    return {
      subscriptionStatus: "NONE",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      paymentMethodLast4: null,
      invoices: [],
    };
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id, subscription_status")
    .eq("id", tenantId)
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

    // Fetch upcoming invoice to get the next billing date
    let nextBillingAt: number | null = null;
    if (sub && sub.status === "active") {
      try {
        const upcoming = await stripe.invoices.createPreview({
          customer: tenant.stripe_customer_id,
        });
        nextBillingAt = upcoming.next_payment_attempt ?? null;
      } catch {
        // No upcoming invoice (e.g. subscription is canceled)
      }
    }

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
  const { tenantId } = await verifySession();

  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", tenantId)
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
        metadata: { tenantId },
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

// ---------------------------------------------------------------------------
// redeemCodeFromBilling — activate subscription via admin bypass or promo code
// ---------------------------------------------------------------------------

function generateSlug(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${prefix}-${Date.now().toString(36)}`;
}

export async function redeemCodeFromBilling(
  code: string,
): Promise<{ success: boolean; message: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { success: false, message: "You must be signed in to redeem a code." };
  }

  const admin = createAdminClient();

  // Helper: ensure the user has a tenant row and return the tenant id.
  // Upserts a user_roles row so verifySession() succeeds afterward.
  async function activateTenant(
    featuresJson: Record<string, unknown>,
  ): Promise<string> {
    const { data: existing } = await admin
      .from("tenants")
      .select("id, features_json")
      .eq("owner_user_id", userId)
      .maybeSingle();

    let tenantId: string;

    if (existing) {
      const merged = {
        ...((existing.features_json as Record<string, unknown> | null) ?? {}),
        ...featuresJson,
      };
      await admin
        .from("tenants")
        .update({ subscription_status: "ACTIVE", features_json: merged })
        .eq("id", existing.id);
      tenantId = existing.id;
    } else {
      // No tenant yet — fetch user email and create one.
      const {
        data: { user },
      } = await admin.auth.admin.getUserById(userId as string);
      const email = user?.email ?? `${userId}@unknown`;
      const slug = generateSlug(email);
      const name = email.split("@")[0];

      const { data: created, error: createErr } = await admin
        .from("tenants")
        .insert({
          name,
          slug,
          owner_user_id: userId,
          subscription_status: "ACTIVE",
          features_json: featuresJson,
        })
        .select("id")
        .single();

      if (createErr || !created) {
        throw new Error(createErr?.message ?? "Failed to create tenant.");
      }
      tenantId = created.id;
    }

    // Upsert user_roles so verifySession() succeeds on the next request.
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "SHOP_OWNER", tenant_id: tenantId },
      { onConflict: "user_id" },
    );

    return tenantId;
  }

  // ── Admin bypass ──────────────────────────────────────────────────────────
  if (code === process.env.ADMIN_BYPASS_CODE) {
    try {
      await activateTenant({ tier: "MULTI_VAN" });
      return { success: true, message: "Subscription activated!" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error.";
      return { success: false, message: msg };
    }
  }

  // ── Promo / gift code ─────────────────────────────────────────────────────
  const { data: promo, error: promoError } = await admin
    .from("promo_codes")
    .select("id, discount_percent, applicable_tier, uses, max_uses")
    .eq("code", code)
    .maybeSingle();

  if (promoError || !promo) {
    return { success: false, message: "Invalid code. Please check and try again." };
  }

  if (promo.uses >= promo.max_uses) {
    return { success: false, message: "This code has reached its maximum number of uses." };
  }

  if (promo.discount_percent < 100) {
    return {
      success: false,
      message: "Partial discounts require Stripe. Full integration coming soon.",
    };
  }

  // 100% off — activate without Stripe.
  try {
    const tier: string = (promo.applicable_tier as string | null) ?? "MULTI_VAN";
    await activateTenant({ tier });

    // Increment usage count.
    await admin
      .from("promo_codes")
      .update({ uses: promo.uses + 1 })
      .eq("id", promo.id);

    return { success: true, message: "Subscription activated!" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    return { success: false, message: msg };
  }
}
