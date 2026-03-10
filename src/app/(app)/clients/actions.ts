"use server";

import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import {
  computeMaintenanceBadges,
  type MaintenanceBadge,
} from "@/lib/maintenance";

// ---------------------------------------------------------------------------
// Server Action — on-demand maintenance check for a single vehicle.
// Called by client components after the user inputs or updates mileage.
// ---------------------------------------------------------------------------
export async function checkMaintenanceDue(
  vehicleId: string
): Promise<MaintenanceBadge[] | { error: string }> {
  try {
    const { tenantId } = await verifySession();

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
      include: { globalVehicle: true },
    });

    if (
      !vehicle ||
      !vehicle.globalVehicle ||
      vehicle.mileageIn == null
    ) {
      return [];
    }

    const schedule = vehicle.globalVehicle
      .maintenanceScheduleJson as Array<{ service: string; intervalMiles?: number; atMileage?: number }>;

    return computeMaintenanceBadges(vehicle.mileageIn, schedule);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}
