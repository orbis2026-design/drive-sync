"use server";

import { z } from "zod";
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

// ---------------------------------------------------------------------------
// Zod schema — validates the Nexpart vehicle search fields (Issue #107)
// ---------------------------------------------------------------------------

export const NexpartVehicleSchema = z.object({
  year: z
    .number()
    .int()
    .min(1980, "Year must be 1980 or later.")
    .max(new Date().getFullYear() + 1, "Year is out of range."),
  make: z
    .string()
    .min(1, "Make is required.")
    .max(64),
  model: z
    .string()
    .min(1, "Model is required.")
    .max(64),
  vin: z
    .string()
    .max(17, "VIN must be 17 characters or fewer.")
    .optional()
    .transform((v) => (v?.trim() === "" ? undefined : v?.trim())),
});

export type NexpartVehicleInput = z.infer<typeof NexpartVehicleSchema>;

// ---------------------------------------------------------------------------
// ActiveWorkOrderSummary — returned by fetchActiveWorkOrders (Issue #108)
// ---------------------------------------------------------------------------

export type ActiveWorkOrderSummary = {
  id: string;
  title: string;
  status: string;
  vehicle: {
    year: number;
    make: string;
    model: string;
    vin: string | null;
  };
};

/**
 * Returns IN-PROGRESS work orders (INTAKE / ACTIVE / PENDING_APPROVAL /
 * BLOCKED_WAITING_APPROVAL) with their vehicle data so the mechanic can
 * auto-fill the Nexpart search form from an active job.
 */
export async function fetchActiveWorkOrders(): Promise<
  { data: ActiveWorkOrderSummary[] } | { error: string }
> {
  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: {
          in: ["INTAKE", "ACTIVE", "PENDING_APPROVAL", "BLOCKED_WAITING_APPROVAL"],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        vehicle: {
          select: { year: true, make: true, model: true, vin: true },
        },
      },
    });

    const data: ActiveWorkOrderSummary[] = rows.map(
      (row: (typeof rows)[number]) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        vehicle: {
          year: row.vehicle.year,
          make: row.vehicle.make,
          model: row.vehicle.model,
          vin: row.vehicle.vin ?? null,
        },
      }),
    );

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
