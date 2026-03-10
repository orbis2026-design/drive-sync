/**
 * auto-decrement.ts
 *
 * Standalone utility for automatically decrementing van-stock consumables
 * when a work order is paid. Called from the Stripe webhook (checkout.session.completed)
 * and can also be called from server actions when manually marking a WO as PAID.
 *
 * Never throws — all errors are logged and the caller continues normally.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Decrements the matching oil consumable in the tenant's inventory when a
 * work order is paid. Uses the vehicle's GlobalVehicle record to determine
 * the correct oil weight and capacity.
 *
 * @param workOrderId - The ID of the work order that was just paid
 * @param tenantId    - The tenant whose inventory should be decremented
 */
export async function decrementStockForWorkOrder(
  workOrderId: string,
  tenantId: string,
): Promise<void> {
  try {
    // Fetch work order with vehicle → globalVehicle
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        vehicle: {
          select: {
            globalVehicleId: true,
            globalVehicle: {
              select: {
                oilCapacityQts: true,
                oilWeightOem: true,
              },
            },
          },
        },
      },
    });

    if (!workOrder?.vehicle?.globalVehicleId) {
      // No linked GlobalVehicle — nothing to auto-decrement
      return;
    }

    const { oilCapacityQts, oilWeightOem } =
      workOrder.vehicle.globalVehicle ?? {};

    if (!oilCapacityQts || !oilWeightOem) {
      // Missing oil spec data — skip silently
      return;
    }

    // Find the matching consumable by name — try exact match first, then
    // startsWith as a fallback to avoid false positives (e.g., "5W-30"
    // matching "15W-30" when using a plain contains query).
    let consumable = await prisma.consumable.findFirst({
      where: {
        tenantId,
        name: { equals: oilWeightOem, mode: "insensitive" },
      },
    });

    if (!consumable) {
      consumable = await prisma.consumable.findFirst({
        where: {
          tenantId,
          name: { startsWith: oilWeightOem, mode: "insensitive" },
        },
      });
    }

    if (!consumable) {
      logger.warn("No matching consumable found — skipping stock deduction", { service: "inventory", tenantId, oilWeight: oilWeightOem });
      return;
    }

    const newStock = Math.max(0, consumable.currentStock - oilCapacityQts);

    await prisma.consumable.update({
      where: { id: consumable.id },
      data: { currentStock: newStock },
    });

    logger.info("Auto-decremented consumable stock", { service: "inventory", tenantId, workOrderId, consumableName: consumable.name, deducted: oilCapacityQts, newStock });
  } catch (err) {
    // Best-effort — never throw from here
    logger.error("Failed to auto-decrement stock", { service: "inventory", tenantId, workOrderId }, err);
  }
}
