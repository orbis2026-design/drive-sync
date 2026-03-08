"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsumableRow = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  costPerUnitCents: number;
  isLow: boolean;
};

// ---------------------------------------------------------------------------
// fetchConsumables
// ---------------------------------------------------------------------------

export async function fetchConsumables(): Promise<
  { data: ConsumableRow[] } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const rows = await prisma.consumable.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    const data: ConsumableRow[] = rows.map((r: (typeof rows)[number]) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      currentStock: r.currentStock,
      lowStockThreshold: r.lowStockThreshold,
      costPerUnitCents: r.costPerUnitCents,
      isLow: r.currentStock < r.lowStockThreshold,
    }));

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

  try {
    const row = await prisma.consumable.findUnique({
      where: { id: consumableId },
      select: { currentStock: true },
    });
    if (!row) return { error: "Consumable not found." };

    const newStock = Math.max(0, row.currentStock + units);
    await prisma.consumable.update({
      where: { id: consumableId },
      data: { currentStock: newStock },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/inventory");
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
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };
  if (!payload.name || !payload.unit) return { error: "Name and unit are required." };

  try {
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
    return { success: true, id: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}
