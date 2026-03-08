"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShopMessage {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: string;
  body: string;
  is_ai: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function sendShopMessage(
  channel: string,
  body: string,
): Promise<{ error?: string }> {
  if (!body.trim()) return { error: "Message body is required." };

  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return { error: "Tenant ID is not configured." };

  const userId = (await getSessionUserId()) ?? "demo-user";

  const admin = createAdminClient();
  const { error } = await admin.from("shop_messages").insert({
    tenant_id: tenantId,
    user_id: userId,
    channel,
    body: body.trim(),
    is_ai: false,
  });

  if (error) {
    return { error: `Failed to send message: ${error.message}` };
  }

  return {};
}

export async function fetchShopMessages(
  channel: string,
): Promise<{ data?: ShopMessage[]; error?: string }> {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return { error: "Tenant ID is not configured." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return { error: `Failed to fetch messages: ${error.message}` };
  }

  return { data: (data ?? []) as ShopMessage[] };
}
