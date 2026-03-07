"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InspectionStatus = "PASS" | "MONITOR" | "FAIL";

export interface InspectionPoint {
  status: InspectionStatus | null;
  note: string;
}

export interface InspectionPayload {
  fluids: InspectionPoint;
  tires: InspectionPoint;
  brakes: InspectionPoint;
  belts: InspectionPoint;
}

export interface SyncResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// Server Action — syncInspection
// Persists the inspection JSON payload to the matching work_orders row.
// ---------------------------------------------------------------------------

export async function syncInspection(
  workOrderId: string,
  payload: InspectionPayload,
): Promise<SyncResult> {
  if (!workOrderId) {
    return { error: "Cannot sync inspection: work order ID is missing." };
  }

  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("work_orders")
    .update({ inspection_json: payload })
    .eq("id", workOrderId);

  if (error) {
    return { error: `Failed to sync inspection: ${error.message}` };
  }

  return {};
}
