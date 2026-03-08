"use server";

import { createAdminClient } from "@/lib/supabase/admin";

function generateSlug(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${prefix}-${Date.now().toString(36)}`;
}

export async function provisionTenant(
  userId: string,
  email: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const admin = createAdminClient();

    const slug = generateSlug(email);
    const name = email.split("@")[0];

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        name,
        slug,
        owner_user_id: userId,
        subscription_status: "ACTIVE",
      })
      .select("id")
      .single();

    if (tenantError || !tenant) {
      return { error: tenantError?.message ?? "Failed to create tenant." };
    }

    const { error: roleError } = await admin.from("user_roles").insert({
      user_id: userId,
      role: "SHOP_OWNER",
      tenant_id: tenant.id,
    });

    if (roleError) {
      return { error: roleError.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { error: message };
  }
}
