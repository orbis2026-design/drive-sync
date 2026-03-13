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
import {
  ensurePrimaryLocation,
  restockFromPurchaseOrder,
  upsertPartForTenant,
} from "@/lib/inventory/stock";
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

    const vehicleIds = rows.map((r) => r.vehicleId);
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

  const { tenantId } = await verifySession();

  try {
    const result = await createPurchaseOrder(lines, deliveryType);

    // Persist to local inventory domain.
    const vendor = await prisma.vendor.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: "Primary Supplier",
        },
      },
      update: {},
      create: {
        tenantId,
        name: "Primary Supplier",
      },
    });

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        vendorId: vendor.id,
        supplierPoNumber: result.poNumber,
        status: result.status,
        deliveryType,
        estimatedReadyAt: new Date(result.estimatedReadyAt),
      },
    });

    // Ensure there is at least a primary location for future receiving.
    await ensurePrimaryLocation(tenantId);

    for (const line of lines) {
      const partNumber = line.partNumber;
      const description = line.partNumber;

      const part = await upsertPartForTenant({
        tenantId,
        partNumber,
        name: description,
      });

      await prisma.purchaseOrderLine.create({
        data: {
          tenantId,
          purchaseOrderId: purchaseOrder.id,
          partId: part.id,
          partNumber: line.partNumber,
          description,
          qty: line.qty,
          wholesalePriceCents: line.wholesalePriceCents,
        },
      });
    }

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

// ---------------------------------------------------------------------------
// receivePurchaseOrder — marks a PO as received and restocks inventory
// ---------------------------------------------------------------------------

export async function receivePurchaseOrder(
  purchaseOrderId: string,
  locationId?: string,
): Promise<{ success: true } | { error: string }> {
  if (!purchaseOrderId) {
    return { error: "Missing purchase order ID." };
  }

  const { tenantId } = await verifySession();

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    select: { id: true },
  });

  if (!po) {
    return { error: "Purchase order not found." };
  }

  const result = await restockFromPurchaseOrder({
    tenantId,
    purchaseOrderId: po.id,
    locationId,
  });

  if ("error" in result) {
    return result;
  }

  return { success: true };
}
