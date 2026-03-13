import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type WorkOrderPartsPayload = {
  partsJson: unknown;
  deltaPartsJson: unknown;
  customerSuppliedParts: boolean;
};

type SelectedPartLike = {
  name?: string;
  partNumber?: string;
  quantity?: number;
  wholesalePriceCents?: number;
};

export async function ensurePrimaryLocation(tenantId: string) {
  const existing = await prisma.inventoryLocation.findFirst({
    where: { tenantId, kind: "PRIMARY" },
  });
  if (existing) return existing;

  try {
    const created = await prisma.inventoryLocation.create({
      data: {
        tenantId,
        name: "Primary Stock",
        code: "PRIMARY",
        kind: "PRIMARY",
      },
    });
    return created;
  } catch (err) {
    logger.error("Failed to create primary inventory location", { service: "inventory", tenantId }, err);
    // Best-effort — in case of race, try to read again.
    const fallback = await prisma.inventoryLocation.findFirst({
      where: { tenantId, kind: "PRIMARY" },
    });
    if (!fallback) {
      throw err;
    }
    return fallback;
  }
}

export async function upsertPartForTenant(params: {
  tenantId: string;
  partNumber: string;
  name?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
}) {
  const { tenantId, partNumber, name, brand, category, subcategory } = params;

  return prisma.part.upsert({
    where: {
      tenantId_partNumber: {
        tenantId,
        partNumber,
      },
    },
    update: {
      // Keep existing name/metadata if already set; only back-fill when empty.
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
      ...(subcategory ? { subcategory } : {}),
    },
    create: {
      tenantId,
      partNumber,
      name: name || partNumber,
      brand,
      category,
      subcategory,
    },
  });
}

export async function restockFromPurchaseOrder(params: {
  tenantId: string;
  purchaseOrderId: string;
  locationId?: string;
}) {
  const { tenantId, purchaseOrderId } = params;

  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId },
      include: { lines: true },
    });

    if (!po) {
      return { error: "Purchase order not found." as const };
    }

    if (po.receivedAt) {
      return { error: "Purchase order already received." as const };
    }

    const location =
      params.locationId &&
      (await prisma.inventoryLocation.findFirst({
        where: { id: params.locationId, tenantId },
      })) ||
      (await ensurePrimaryLocation(tenantId));

    for (const line of po.lines) {
      const qty = Number(line.qty);
      if (!qty || qty <= 0) continue;

      const partNumber = line.partNumber;
      const description = line.description || line.partNumber;

      const part = await upsertPartForTenant({
        tenantId,
        partNumber,
        name: description,
      });

      const existingStock = await prisma.stockLevel.findFirst({
        where: {
          tenantId,
          partId: part.id,
          locationId: location.id,
        },
      });

      const currentQty = existingStock ? Number(existingStock.quantity) : 0;
      const newQty = currentQty + qty;

      if (existingStock) {
        await prisma.stockLevel.update({
          where: { id: existingStock.id },
          data: {
            quantity: newQty,
            costPerUnitCents: line.wholesalePriceCents,
          },
        });
      } else {
        await prisma.stockLevel.create({
          data: {
            tenantId,
            partId: part.id,
            locationId: location.id,
            quantity: qty,
            lowStockThreshold: 0,
            costPerUnitCents: line.wholesalePriceCents,
          },
        });
      }

      await prisma.inventoryTransaction.create({
        data: {
          tenantId,
          partId: part.id,
          locationId: location.id,
          quantity: qty,
          direction: "IN",
          reason: "PO_RECEIVE",
          costPerUnitCents: line.wholesalePriceCents,
          metadata: {
            purchaseOrderId: po.id,
            supplierPoNumber: po.supplierPoNumber,
          },
        },
      });
    }

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    });

    return { success: true as const };
  } catch (err) {
    logger.error("Failed to restock from purchase order", { service: "inventory", tenantId, purchaseOrderId }, err);
    return { error: "Failed to restock from purchase order." as const };
  }
}

export async function applyWorkOrderPartsUsage(
  workOrderId: string,
  tenantId: string,
): Promise<void> {
  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: {
        partsJson: true,
        deltaPartsJson: true,
        customerSuppliedParts: true,
      },
    }) as WorkOrderPartsPayload | null;

    if (!workOrder) return;
    if (workOrder.customerSuppliedParts) {
      // Do not touch stock when the client provided their own parts.
      return;
    }

    const baseParts = Array.isArray(workOrder.partsJson)
      ? (workOrder.partsJson as SelectedPartLike[])
      : [];
    const deltaParts = Array.isArray(workOrder.deltaPartsJson)
      ? (workOrder.deltaPartsJson as SelectedPartLike[])
      : [];

    const allParts = [...baseParts, ...deltaParts];
    if (allParts.length === 0) return;

    const location = await ensurePrimaryLocation(tenantId);

    for (const line of allParts) {
      const partNumber = String(line.partNumber ?? "").trim();
      if (!partNumber) continue;

      const qty = typeof line.quantity === "number"
        ? line.quantity
        : Number(line.quantity ?? 0);
      if (!qty || qty <= 0) continue;

      const name = line.name || partNumber;

      const part = await upsertPartForTenant({
        tenantId,
        partNumber,
        name,
      });

      const existingStock = await prisma.stockLevel.findFirst({
        where: {
          tenantId,
          partId: part.id,
          locationId: location.id,
        },
      });

      const currentQty = existingStock ? Number(existingStock.quantity) : 0;
      const newQty = Math.max(0, currentQty - qty);

      const costPerUnitCents =
        typeof line.wholesalePriceCents === "number"
          ? line.wholesalePriceCents
          : existingStock?.costPerUnitCents ?? 0;

      if (existingStock) {
        await prisma.stockLevel.update({
          where: { id: existingStock.id },
          data: {
            quantity: newQty,
            costPerUnitCents,
          },
        });
      } else {
        await prisma.stockLevel.create({
          data: {
            tenantId,
            partId: part.id,
            locationId: location.id,
            quantity: newQty,
            lowStockThreshold: 0,
            costPerUnitCents,
          },
        });
      }

      await prisma.inventoryTransaction.create({
        data: {
          tenantId,
          partId: part.id,
          locationId: location.id,
          quantity: qty,
          direction: "OUT",
          reason: "WORK_ORDER_USAGE",
          costPerUnitCents,
          metadata: {
            workOrderId,
          },
        },
      });
    }
  } catch (err) {
    logger.error("Failed to apply work-order parts usage", { service: "inventory", tenantId, workOrderId }, err);
  }
}

