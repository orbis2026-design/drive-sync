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

    // Find the matching consumable by name (case-insensitive)
    const consumable = await prisma.consumable.findFirst({
      where: {
        tenantId,
        name: {
          contains: oilWeightOem,
          mode: "insensitive",
        },
      },
    });

    if (!consumable) {
      console.warn(
        `[auto-decrement] No consumable matching "${oilWeightOem}" found for tenant ${tenantId}. Skipping stock deduction.`,
      );
      return;
    }

    const newStock = Math.max(0, consumable.currentStock - oilCapacityQts);

    await prisma.consumable.update({
      where: { id: consumable.id },
      data: { currentStock: newStock },
    });

    console.info(
      `[auto-decrement] Deducted ${oilCapacityQts} qt of "${consumable.name}" for work order ${workOrderId}. New stock: ${newStock}`,
    );
  } catch (err) {
    // Best-effort — never throw from here
    console.error(
      "[auto-decrement] Failed to auto-decrement stock for work order",
      workOrderId,
      err,
    );
  }
}
