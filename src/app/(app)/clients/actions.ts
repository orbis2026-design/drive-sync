"use server";

import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/auth";
import {
  computeMaintenanceBadges,
  type MaintenanceItem,
  type MaintenanceBadge,
} from "@/lib/maintenance";

// Re-export types so client components can import them from a single place.
export type { MaintenanceItem, MaintenanceBadge };

// ---------------------------------------------------------------------------
// Server Action — on-demand maintenance check for a single vehicle.
// Called by client components after the user inputs or updates mileage.
// ---------------------------------------------------------------------------
export async function checkMaintenanceDue(
  vehicleId: string
): Promise<MaintenanceBadge[] | { error: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

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
    .maintenanceScheduleJson as MaintenanceItem[];

  return computeMaintenanceBadges(vehicle.mileageIn, schedule);
}
