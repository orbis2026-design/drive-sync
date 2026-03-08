"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface BookingPayload {
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  description: string;
  windowStart: string; // ISO string
}

export async function submitBooking(
  payload: BookingPayload,
): Promise<{ workOrderId?: string; error?: string }> {
  const {
    tenantId,
    firstName,
    lastName,
    phone,
    email,
    description,
    windowStart,
  } = payload;

  if (!tenantId || !firstName || !lastName || !phone || !description) {
    return { error: "Missing required booking fields." };
  }

  const admin = createAdminClient();

  // 1. Upsert client by phone within the tenant
  const { data: clientData, error: clientError } = await admin
    .from("clients")
    .upsert(
      {
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        phone,
        email: email ?? null,
      },
      { onConflict: "tenant_id,phone", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (clientError || !clientData) {
    return {
      error: `Failed to create client record: ${clientError?.message ?? "unknown error"}`,
    };
  }

  // 2. Create work order with REQUESTED status
  const { data: workOrder, error: woError } = await admin
    .from("work_orders")
    .insert({
      tenant_id: tenantId,
      title: `Service Request — ${firstName} ${lastName}`,
      description,
      status: "REQUESTED",
      scheduled_at: windowStart,
    })
    .select("id")
    .single();

  if (woError || !workOrder) {
    return {
      error: `Failed to create work order: ${woError?.message ?? "unknown error"}`,
    };
  }

  return { workOrderId: workOrder.id };
}
