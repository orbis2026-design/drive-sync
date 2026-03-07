"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RepairStep } from "./page";

/**
 * Appends the AI-generated repair steps to the voice_note_json field of a
 * work order identified by its ID (passed as the [vehicleId] route param in
 * the context of the AI Visual Diagnostics page).
 */
export async function appendStepsToWorkOrder(
  workOrderId: string,
  repairSteps: RepairStep[]
): Promise<{ success: true } | { error: string }> {
  if (!workOrderId) return { error: "workOrderId is required." };
  if (!Array.isArray(repairSteps) || repairSteps.length === 0) {
    return { error: "No repair steps to append." };
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("work_orders")
    .update({
      voice_note_json: { repairSteps },
    })
    .eq("id", workOrderId);

  if (error) return { error: error.message };
  return { success: true };
}
