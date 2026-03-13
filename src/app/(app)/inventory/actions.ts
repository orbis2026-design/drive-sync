"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { verifySession } from "@/lib/auth";
import { executePurchaseOrder } from "../parts/catalog/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InventoryRow = {
  id: string;
  partNumber: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  lowStockThreshold: number;
  costPerUnitCents: number;
  isLow: boolean;
};

// ---------------------------------------------------------------------------
// getCachedConsumables — unstable_cache wrapper for the Prisma query
// ---------------------------------------------------------------------------

const getCachedInventory = unstable_cache(
  async (tenantId: string): Promise<InventoryRow[]> => {
    const anyClient = prisma as any;
    const hasNewInventoryModels =
      anyClient.inventoryLocation &&
      anyClient.stockLevel &&
      anyClient.part;

    if (!hasNewInventoryModels) {
      const consumables = await prisma.consumable.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });

      return consumables.map((c) => ({
        id: c.id,
        partNumber: null,
        name: c.name,
        unit: c.unit,
        quantity: Number(c.currentStock),
        lowStockThreshold: Number(c.lowStockThreshold),
        costPerUnitCents: c.costPerUnitCents,
        isLow: c.currentStock < c.lowStockThreshold,
      }));
    }

    const primaryLocation = await prisma.inventoryLocation.findFirst({
      where: { tenantId, kind: "PRIMARY" },
      orderBy: { createdAt: "asc" },
    });

    if (!primaryLocation) {
      return [];
    }

    const rows = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        locationId: primaryLocation.id,
      },
      orderBy: {
        part: {
          name: "asc",
        },
      },
      include: {
        part: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      partNumber: row.part.partNumber,
      name: row.part.name,
      unit: row.part.unit,
      quantity: Number(row.quantity),
      lowStockThreshold: Number(row.lowStockThreshold),
      costPerUnitCents: row.costPerUnitCents,
      isLow: Number(row.quantity) < Number(row.lowStockThreshold),
    }));
  },
  ["inventory-primary"],
  { revalidate: 60, tags: ["inventory"] },
);

// ---------------------------------------------------------------------------
// fetchConsumables
// ---------------------------------------------------------------------------

export async function fetchConsumables(): Promise<
  { data: InventoryRow[] } | { error: string }
> {
  const { tenantId } = await verifySession();

  try {
    const data = await getCachedInventory(tenantId);
    return { data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load consumables.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// restockConsumable
// ---------------------------------------------------------------------------

/**
 * Adds `units` to a consumable's current stock (restock action).
 * Pass a negative number to manually deduct (e.g. manual adjustment).
 */
export async function restockConsumable(
  consumableId: string,
  units: number,
): Promise<{ success: true } | { error: string }> {
  if (!consumableId) return { error: "Missing consumable ID." };
  if (isNaN(units) || units === 0) return { error: "Invalid quantity." };

  const { tenantId } = await verifySession();

  try {
    const anyClient = prisma as any;
    const hasNewInventoryModels =
      anyClient.stockLevel && anyClient.inventoryLocation && anyClient.part;

    if (hasNewInventoryModels) {
      const stockRow = await prisma.stockLevel.findFirst({
        where: { id: consumableId, tenantId },
        select: { quantity: true },
      });

      if (!stockRow) {
        return { error: "Stock item not found." };
      }

      const newQty = Math.max(0, Number(stockRow.quantity) + units);

      await prisma.stockLevel.update({
        where: { id: consumableId },
        data: { quantity: newQty },
      });
    } else {
      const row = await prisma.consumable.findFirst({
        where: { id: consumableId, tenantId },
        select: { currentStock: true },
      });
      if (!row) return { error: "Consumable not found." };

      const newStock = Math.max(0, row.currentStock + units);
      await prisma.consumable.update({
        where: { id: consumableId },
        data: { currentStock: newStock },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/inventory");
  revalidateTag("inventory", "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// createConsumable
// ---------------------------------------------------------------------------

export async function createConsumable(payload: {
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  costPerUnitCents: number;
}): Promise<{ success: true; id: string } | { error: string }> {
  const { tenantId } = await verifySession();
  if (!payload.name || !payload.unit) return { error: "Name and unit are required." };

  try {
    const anyClient = prisma as any;
    const hasNewInventoryModels =
      anyClient.inventoryLocation &&
      anyClient.stockLevel &&
      anyClient.part;

    if (hasNewInventoryModels) {
      // Create a Part + StockLevel at the primary location.
      let location = await prisma.inventoryLocation.findFirst({
        where: { tenantId, kind: "PRIMARY" },
      });
      if (!location) {
        location = await prisma.inventoryLocation.create({
          data: {
            tenantId,
            name: "Primary Stock",
            code: "PRIMARY",
            kind: "PRIMARY",
          },
        });
      }

      const part = await prisma.part.create({
        data: {
          tenantId,
          name: payload.name,
          unit: payload.unit,
        },
      });

      const stock = await prisma.stockLevel.create({
        data: {
          tenantId,
          partId: part.id,
          locationId: location.id,
          quantity: payload.currentStock,
          lowStockThreshold: payload.lowStockThreshold,
          costPerUnitCents: payload.costPerUnitCents,
        },
        select: { id: true },
      });

      revalidatePath("/inventory");
      revalidateTag("inventory", "max");
      return { success: true, id: stock.id };
    }

    const row = await prisma.consumable.create({
      data: {
        tenantId,
        name: payload.name,
        unit: payload.unit,
        currentStock: payload.currentStock,
        lowStockThreshold: payload.lowStockThreshold,
        costPerUnitCents: payload.costPerUnitCents,
      },
      select: { id: true },
    });
    revalidatePath("/inventory");
    revalidateTag("inventory", "max");
    return { success: true, id: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// updateInventoryItem — edit metadata (name, unit, threshold, SKU)
// ---------------------------------------------------------------------------

export async function updateInventoryItem(payload: {
  id: string;
  name: string;
  unit: string | null;
  partNumber: string | null;
  lowStockThreshold: number;
}): Promise<{ success: true } | { error: string }> {
  const { tenantId } = await verifySession();
  const { id, name, unit, partNumber, lowStockThreshold } = payload;

  if (!id) return { error: "Missing inventory item ID." };
  if (!name) return { error: "Name is required." };

  try {
    const anyClient = prisma as any;
    const hasNewInventoryModels =
      anyClient.inventoryLocation &&
      anyClient.stockLevel &&
      anyClient.part;

    if (hasNewInventoryModels) {
      const stock = await prisma.stockLevel.findFirst({
        where: { id, tenantId },
        select: { id: true, partId: true },
      });
      if (!stock) return { error: "Stock item not found." };

      await prisma.part.update({
        where: { id: stock.partId },
        data: {
          name,
          unit: unit ?? undefined,
          partNumber: partNumber ?? undefined,
        },
      });

      await prisma.stockLevel.update({
        where: { id },
        data: {
          lowStockThreshold,
        },
      });
    } else {
      await prisma.consumable.updateMany({
        where: { id, tenantId },
        data: {
          name,
          unit: unit ?? undefined,
          lowStockThreshold,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/inventory");
  revalidateTag("inventory", "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteInventoryItem — delete stock (or zero it out in legacy mode)
// ---------------------------------------------------------------------------

export async function deleteInventoryItem(id: string): Promise<{ success: true } | { error: string }> {
  if (!id) return { error: "Missing inventory item ID." };
  const { tenantId } = await verifySession();

  try {
    const anyClient = prisma as any;
    const hasNewInventoryModels =
      anyClient.inventoryLocation &&
      anyClient.stockLevel &&
      anyClient.part;

    if (hasNewInventoryModels) {
      const stock = await prisma.stockLevel.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!stock) return { error: "Stock item not found." };

      await prisma.stockLevel.delete({
        where: { id },
      });
    } else {
      await prisma.consumable.deleteMany({
        where: { id, tenantId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/inventory");
  revalidateTag("inventory", "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// restockLowInventory — build a PO from all low-stock items
// ---------------------------------------------------------------------------

export async function restockLowInventory(): Promise<
  | {
      success: true;
      poNumber: string;
      estimatedReadyAt: string;
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
    }
  | { error: string }
> {
  const { tenantId } = await verifySession();

  const anyClient = prisma as any;
  const hasNewInventoryModels =
    anyClient.inventoryLocation &&
    anyClient.stockLevel &&
    anyClient.part;

  if (!hasNewInventoryModels) {
    return {
      error:
        "Bulk restock requires the new inventory schema. Please migrate parts to the new inventory model.",
    };
  }

  try {
    const location = await prisma.inventoryLocation.findFirst({
      where: { tenantId, kind: "PRIMARY" },
    });
    if (!location) {
      return { error: "No primary inventory location found." };
    }

    const lowStockRows = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        locationId: location.id,
      },
      include: {
        part: true,
      },
    });

    const lowItems = lowStockRows.filter(
      (row) => Number(row.quantity) < Number(row.lowStockThreshold) && !!row.part.partNumber,
    );

    if (lowItems.length === 0) {
      return { error: "No low-stock items to restock." };
    }

    const lines = lowItems.map((row) => {
      const qtyDelta =
        Number(row.lowStockThreshold) - Number(row.quantity) <= 0
          ? 1
          : Number(row.lowStockThreshold) - Number(row.quantity);

      const qty = Math.max(1, Math.round(qtyDelta));

      return {
        partNumber: row.part.partNumber as string,
        qty,
        wholesalePriceCents: row.costPerUnitCents,
      };
    });

    const subtotalCents = lines.reduce(
      (sum, line) => sum + line.wholesalePriceCents * line.qty,
      0,
    );

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { partsTaxRate: true },
    });

    const rate = tenant ? Number(tenant.partsTaxRate) : 0;
    const taxCents = Math.round(subtotalCents * rate);
    const totalCents = subtotalCents + taxCents;

    const poResult = await executePurchaseOrder(lines, "DELIVERY");

    if ("error" in poResult) {
      return { error: poResult.error };
    }

    return {
      success: true,
      poNumber: poResult.poNumber,
      estimatedReadyAt: poResult.estimatedReadyAt,
      subtotalCents,
      taxCents,
      totalCents,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build restock PO.";
    return { error: message };
  }
}

