"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifySession } from "@/lib/auth";

export async function sendMessage(payload: {
  clientId: string | null;
  body: string;
}): Promise<{ success: true } | { error: string }> {
  const { tenantId } = await verifySession();
  if (!payload.body.trim()) return { error: "Message body cannot be empty." };

  const supabase = createAdminClient();

  const { error } = await supabase.from("messages").insert({
    tenant_id: tenantId,
    client_id: payload.clientId,
    body: payload.body.trim(),
    direction: "OUTBOUND",
    from_number: null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function fetchClients(): Promise<
  { data: { id: string; first_name: string; last_name: string; phone: string | null }[] } | { error: string }
> {
  const { tenantId } = await verifySession();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone")
    .eq("tenant_id", tenantId)
    .order("first_name", { ascending: true })
    .limit(200);

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

/** Returns the authenticated user's tenant ID for use by client components. */
export async function getSessionTenantId(): Promise<string | null> {
  try {
    const { tenantId } = await verifySession();
    return tenantId;
  } catch {
    return null;
  }
}
