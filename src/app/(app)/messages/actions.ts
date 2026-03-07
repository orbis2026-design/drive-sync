"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

export async function sendMessage(payload: {
  tenantId?: string;
  clientId: string | null;
  body: string;
}): Promise<{ success: true } | { error: string }> {
  const tenantId = payload.tenantId ?? DEMO_TENANT_ID;
  if (!tenantId) return { error: "Tenant ID is required." };
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone")
    .eq("tenant_id", DEMO_TENANT_ID)
    .order("first_name", { ascending: true })
    .limit(200);

  if (error) return { error: error.message };
  return { data: data ?? [] };
}
