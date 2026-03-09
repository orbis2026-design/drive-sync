"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/auth";

function generateSlug(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${prefix}-${Date.now().toString(36)}`;
}

export async function provisionTenant(): Promise<
  { success: true } | { error: string }
> {
  try {
    // Derive userId from the active session — never trust client-supplied IDs.
    const userId = await getSessionUserId();
    if (!userId) {
      return { error: "Authentication required." };
    }

    const admin = createAdminClient();

    // Fetch the user's email from Supabase auth (server-side only).
    const {
      data: { user },
      error: userError,
    } = await admin.auth.admin.getUserById(userId);

    if (userError || !user?.email) {
      return { error: "Unable to retrieve account information." };
    }

    const email = user.email;
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
      // Compensating transaction: remove the orphaned tenant row so we don't
      // leave an unowned tenant in the database if role assignment fails.
      const { error: deleteError } = await admin
        .from("tenants")
        .delete()
        .eq("id", tenant.id);
      if (deleteError) {
        console.error(
          "[register] Failed to clean up orphaned tenant:",
          tenant.id,
          deleteError,
        );
      }
      return { error: roleError.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { error: message };
  }
}
