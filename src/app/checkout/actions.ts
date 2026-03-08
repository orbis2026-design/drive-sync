"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/auth";

export async function applyPromoCode(
  code: string,
  selectedTier: string,
): Promise<{ success?: boolean; error?: string; redirect?: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "You must be signed in to apply a promo code." };
  }

  const admin = createAdminClient();

  // ── Admin bypass ──────────────────────────────────────────────────────────
  if (code === process.env.ADMIN_BYPASS_CODE) {
    const { data: existingTenant } = await admin
      .from("tenants")
      .select("id, features_json")
      .eq("owner_user_id", userId)
      .maybeSingle();

    const featuresJson = {
      ...(existingTenant?.features_json as Record<string, unknown> | null ?? {}),
      tier: "MULTI_VAN",
    };

    await admin
      .from("tenants")
      .update({ subscription_status: "ACTIVE", features_json: featuresJson })
      .eq("owner_user_id", userId);

    return { success: true, redirect: "/onboarding" };
  }

  // ── Promo code lookup ─────────────────────────────────────────────────────
  const { data: promo, error: promoError } = await admin
    .from("promo_codes")
    .select("id, discount_percent, applicable_tier, uses, max_uses")
    .eq("code", code)
    .maybeSingle();

  if (promoError || !promo) {
    return { error: "Invalid code. Please check and try again." };
  }

  if (promo.uses >= promo.max_uses) {
    return { error: "This code has reached its maximum number of uses." };
  }

  if (promo.discount_percent < 100) {
    return {
      error:
        "Partial discounts require Stripe. Full integration coming soon.",
    };
  }

  // 100% off — activate without Stripe
  const { data: existingTenant } = await admin
    .from("tenants")
    .select("id, features_json")
    .eq("owner_user_id", userId)
    .maybeSingle();

  const featuresJson = {
    ...(existingTenant?.features_json as Record<string, unknown> | null ?? {}),
    tier: promo.applicable_tier ?? selectedTier,
  };

  await admin
    .from("tenants")
    .update({ subscription_status: "ACTIVE", features_json: featuresJson })
    .eq("owner_user_id", userId);

  // Increment usage count
  await admin
    .from("promo_codes")
    .update({ uses: promo.uses + 1 })
    .eq("id", promo.id);

  return { success: true, redirect: "/onboarding" };
}
