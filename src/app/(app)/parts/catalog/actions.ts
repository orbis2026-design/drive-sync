"use server";

import {
  searchParts,
  checkInventory,
  createPurchaseOrder,
  type SupplierPart,
  type PurchaseOrderLine,
  type PurchaseOrderResult,
  type DeliveryType,
} from "@/lib/supplier-api";

// ---------------------------------------------------------------------------
// getPartsForCategory — Server Action wrapping supplier-api.searchParts
// ---------------------------------------------------------------------------

export async function getPartsForCategory(
  category: string,
  subcategory: string,
  vehicleYear?: number,
  vehicleMake?: string,
  vehicleModel?: string,
): Promise<{ parts: SupplierPart[] } | { error: string }> {
  if (!category || !subcategory) {
    return { error: "Category and subcategory are required." };
  }
  try {
    const parts = await searchParts({
      category,
      subcategory,
      vehicleYear,
      vehicleMake,
      vehicleModel,
    });
    return { parts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Supplier API error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// checkLiveInventory — "Live Inventory Check" Server Action
// Queries the local warehouse to confirm stock before adding to a quote.
// ---------------------------------------------------------------------------

export async function checkLiveInventory(
  partNumber: string,
  warehouseId: string = "WH-MAIN",
): Promise<
  | { inStock: boolean; qty: number; etaMinutes: number; partNumber: string }
  | { error: string }
> {
  if (!partNumber) {
    return { error: "Part number is required." };
  }
  try {
    const result = await checkInventory(partNumber, warehouseId);
    return {
      inStock: result.inStock,
      qty: result.qty,
      etaMinutes: result.etaMinutes,
      partNumber: result.partNumber,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Inventory check failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// executePurchaseOrder — triggers when the client approves the quote
// ---------------------------------------------------------------------------

export async function executePurchaseOrder(
  lines: PurchaseOrderLine[],
  deliveryType: DeliveryType,
): Promise<
  Pick<PurchaseOrderResult, "poNumber" | "status" | "estimatedReadyAt"> | { error: string }
> {
  if (!lines || lines.length === 0) {
    return { error: "Purchase order must have at least one line item." };
  }
  try {
    const result = await createPurchaseOrder(lines, deliveryType);
    return {
      poNumber: result.poNumber,
      status: result.status,
      estimatedReadyAt: result.estimatedReadyAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Purchase order failed: ${msg}` };
  }
}
