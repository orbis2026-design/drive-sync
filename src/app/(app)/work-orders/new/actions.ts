"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { verifySession } from "@/lib/auth";

/**
 * Create a new work order (job card) for an existing vehicle.
 *
 * Work order system goal (ARI-style job cards):
 * - Create work orders per vehicle; track status (INTAKE → ACTIVE → … → INVOICED).
 * - Add parts, labor, inspections; send estimates for client approval.
 * - Complete job → invoice → payment.
 * See: https://ari.app/features/job-cards/
 *
 * Returns the new work order id for redirect to diagnostics/estimating, or an error.
 */
export async function createWorkOrderForVehicle(
  vehicleId: string,
): Promise<{ workOrderId: string } | { error: string }> {
  const { tenantId } = await verifySession();

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, tenantId },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
    },
  });

  if (!vehicle) {
    return { error: "Vehicle not found or access denied." };
  }

  const title =
    vehicle.year != null && vehicle.make && vehicle.model
      ? `Service — ${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : vehicle.make && vehicle.model
        ? `Service — ${vehicle.make} ${vehicle.model}`
        : "New Work Order";

  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId,
      vehicleId: vehicle.id,
      status: "INTAKE",
      title,
      description: "Work order created from Clients.",
    },
    select: { id: true },
  });

  revalidateTag("jobs", "max");
  revalidatePath("/jobs");
  return { workOrderId: workOrder.id };
}
