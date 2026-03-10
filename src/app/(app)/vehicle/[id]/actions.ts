"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { verifySession } from "@/lib/auth";
import type { QuickSpecsKitItem } from "@/lib/parts-catalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  error?: string;
}

interface SelectedPart {
  partId: string;
  name: string;
  partNumber: string;
  supplier: string;
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// addQuickSpecsKitToWorkOrder
// ---------------------------------------------------------------------------

/**
 * Merges a Quick Specs kit into the work order's `parts_json`.
 * If the part number already exists in the array, the quantity is bumped.
 */
export async function addQuickSpecsKitToWorkOrder(
  workOrderId: string,
  kit: QuickSpecsKitItem[],
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Work order ID is required." };
  }
  if (!Array.isArray(kit) || kit.length === 0) {
    return { error: "Kit is empty." };
  }

  const { tenantId } = await verifySession();

  const adminDb = createAdminClient();

  // Read current parts_json
  const { data: wo, error: readErr } = await adminDb
    .from("work_orders")
    .select("parts_json")
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId)
    .single();

  if (readErr) {
    return { error: `Failed to read work order: ${readErr.message}` };
  }

  const existing: SelectedPart[] = Array.isArray(
    (wo as Record<string, unknown>)?.parts_json,
  )
    ? ((wo as Record<string, unknown>).parts_json as SelectedPart[])
    : [];

  // Merge kit items
  const merged = [...existing];
  for (const item of kit) {
    const idx = merged.findIndex(
      (p) => p.partNumber === item.partNumber,
    );
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + item.quantity };
    } else {
      merged.push({
        partId: `kit-${item.partNumber}`,
        name: `${item.category} — ${item.brand}`,
        partNumber: item.partNumber,
        supplier: "AutoZone",
        wholesalePriceCents: Math.round(item.retailPriceCents * 0.6),
        retailPriceCents: item.retailPriceCents,
        quantity: item.quantity,
      });
    }
  }

  const { error: writeErr } = await adminDb
    .from("work_orders")
    .update({ parts_json: merged })
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId);

  if (writeErr) {
    return { error: `Failed to save parts: ${writeErr.message}` };
  }

  revalidatePath("/jobs");
  revalidateTag("jobs", {});
  return {};
}
