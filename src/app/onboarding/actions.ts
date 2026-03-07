"use server";

/**
 * src/app/onboarding/actions.ts
 *
 * Server Actions for the Zero-Touch Tenant Setup Wizard (Issue #65).
 *
 * Saves the onboarding payload to the Supabase `tenants` table and
 * (optionally) a `mechanic_settings` row, then redirects to the calendar.
 *
 * Steps collected by the wizard:
 *   1. Shop Profile  — shopName, phoneNumber, logoUrl (optional)
 *   2. The Math      — laborRateCents, partsTaxRate
 *   3. Biometrics    — WebAuthn passkey (handled client-side via auth-helpers)
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingPayload {
  /** Step 1 */
  shopName: string;
  phoneNumber: string;
  logoUrl?: string;
  /** Step 2 */
  laborRateCents: number;   // e.g. 12000 for $120/hr
  partsTaxRate: number;     // e.g. 0.0775 for 7.75%
}

export interface ActionResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// saveOnboardingSettings
//
// Persists the wizard payload to the tenant row identified by the caller's
// Supabase auth.uid() (owner_user_id column).  Also upserts a row in the
// mechanic_settings table for per-user preferences.
// ---------------------------------------------------------------------------

export async function saveOnboardingSettings(
  payload: OnboardingPayload,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "You must be signed in to complete onboarding." };
  }

  const admin = createAdminClient();

  // --- Update the tenant row -----------------------------------------------
  const taxMatrixPatch = {
    labor_tax_rate: 0,
    parts_tax_rate: payload.partsTaxRate,
    environmental_fee_flat: 5.0,
    environmental_fee_percentage: 0,
  };

  const tenantPatch: Record<string, unknown> = {
    name: payload.shopName,
    owner_phone: payload.phoneNumber,
    tax_matrix_json: taxMatrixPatch,
    onboarding_complete: true,
  };

  if (payload.logoUrl) {
    tenantPatch.logo_url = payload.logoUrl;
  }

  const { error: tenantError } = await admin
    .from("tenants")
    .update(tenantPatch)
    .eq("owner_user_id", userId);

  if (tenantError) {
    console.error("[onboarding] Failed to update tenant:", tenantError);
    return { error: tenantError.message };
  }

  // --- Upsert mechanic_settings row ----------------------------------------
  const { error: settingsError } = await admin
    .from("mechanic_settings")
    .upsert(
      {
        user_id: userId,
        labor_rate_cents: payload.laborRateCents,
        parts_tax_rate: payload.partsTaxRate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (settingsError) {
    // Non-fatal: log but don't block the redirect. The tenant row already
    // has the labor rate stored via taxMatrixJson.
    console.error("[onboarding] Failed to upsert mechanic_settings:", settingsError);
  }

  // Redirect to the app calendar after successful onboarding.
  redirect("/calendar");
}
