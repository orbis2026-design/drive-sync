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

  // Pre-flight: check whether this client already exists so we can roll back
  // an orphaned insert if the work-order creation fails later.
  const { data: existingClient } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .maybeSingle();

  const clientIsNew = !existingClient;

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
    // Compensating rollback: remove the orphaned client row when the client
    // was brand-new (i.e. we created it in this request). An existing client
    // updated by the upsert above must NOT be deleted.
    if (clientIsNew) {
      try {
        await admin.from("clients").delete().eq("id", clientData.id);
      } catch {
        // Best-effort cleanup — the work-order error is still returned below.
      }
    // Compensating delete: remove the client we just created to avoid an
    // orphaned record with no work order attached.
    try {
      await admin.from("clients").delete().eq("id", clientData.id);
    } catch (deleteErr) {
      console.error(
        `Failed to delete orphaned client ${clientData.id} after work order insert failure:`,
        deleteErr,
      );
    }
    return {
      error: `Failed to create work order: ${woError?.message ?? "unknown error"}`,
    };
  }

  return { workOrderId: workOrder.id };
}
