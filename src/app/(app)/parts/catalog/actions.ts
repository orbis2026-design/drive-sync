"use server";

import { prisma } from "@/lib/prisma";
import {
  searchParts,
  checkInventory,
  createPurchaseOrder,
  type SupplierPart,
  type PurchaseOrderLine,
  type PurchaseOrderResult,
  type DeliveryType,
} from "@/lib/supplier-api";
import { verifySession } from "@/lib/auth";
import type { ActiveWorkOrderSummary } from "./schemas";

/**
 * Returns IN-PROGRESS work orders (INTAKE / ACTIVE / PENDING_APPROVAL /
 * BLOCKED_WAITING_APPROVAL) with their vehicle data so the mechanic can
 * auto-fill the Nexpart search form from an active job.
 */
export async function fetchActiveWorkOrders(): Promise<
  { data: ActiveWorkOrderSummary[] } | { error: string }
> {
  const { tenantId } = await verifySession();

  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        tenantId,
        status: {
          in: ["INTAKE", "ACTIVE", "PENDING_APPROVAL", "BLOCKED_WAITING_APPROVAL"],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        vehicleId: true,
      },
    });

    const vehicleIds = rows.map((row) => row.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, year: true, make: true, model: true, vin: true },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const data: ActiveWorkOrderSummary[] = rows.map((row) => {
      const v = vehicleById.get(row.vehicleId);
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        vehicle: {
          year: v?.year ?? 0,
          make: v?.make ?? "",
          model: v?.model ?? "",
          vin: v?.vin ?? null,
        },
      };
    });

    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load work orders.";
    return { error: msg };
  }
}

// ---------------------------------------------------------------------------
// getPartsForCategory — Server Action wrapping supplier-api.searchParts
// ---------------------------------------------------------------------------

export async function getPartsForCategory(
  category: string,
  subcategory: string,
  vehicleYear?: number,
  vehicleMake?: string,
  vehicleModel?: string,
  vehicleVin?: string,
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
      ...(vehicleVin ? { vin: vehicleVin } : {}),
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
