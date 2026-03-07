"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

export interface IntegrationSettings {
  googlePlaceId: string | null;
  reviewLink: string | null;
  ownerPhone: string | null;
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  if (!DEMO_TENANT_ID) {
    return { googlePlaceId: null, reviewLink: null, ownerPhone: null };
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tenants")
      .select("google_place_id, review_link, owner_phone")
      .eq("id", DEMO_TENANT_ID)
      .single();
    return {
      googlePlaceId: (data as Record<string, string | null> | null)?.google_place_id ?? null,
      reviewLink: (data as Record<string, string | null> | null)?.review_link ?? null,
      ownerPhone: (data as Record<string, string | null> | null)?.owner_phone ?? null,
    };
  } catch {
    return { googlePlaceId: null, reviewLink: null, ownerPhone: null };
  }
}

export async function saveIntegrationSettings(
  settings: IntegrationSettings,
): Promise<{ success: true } | { error: string }> {
  if (!DEMO_TENANT_ID) return { error: "Tenant not configured." };
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tenants")
      .update({
        google_place_id: settings.googlePlaceId || null,
        review_link: settings.reviewLink || null,
        owner_phone: settings.ownerPhone || null,
      })
      .eq("id", DEMO_TENANT_ID);
    if (error) return { error: error.message };
    revalidatePath("/settings/integrations");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}
