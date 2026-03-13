"use server";

import { prisma } from "@/lib/prisma";
import { verifySession, getUserRole } from "@/lib/auth";
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

// ---------------------------------------------------------------------------
// Server Action — archiveClient
// ---------------------------------------------------------------------------

export async function archiveClient(
  clientId: string,
): Promise<{ success: true } | { error: string }> {
  if (!clientId) return { error: "Missing client ID." };

  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { error: "Only shop owners can archive clients." };
  }

  try {
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });

    if (!client) {
      return { error: "Client not found for this tenant." };
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { isArchived: true },
    });

    // Also archive all work orders for this client's vehicles.
    const vehicles = await prisma.vehicle.findMany({
      where: { tenantId, clientId },
      select: { id: true },
    });

    if (vehicles.length > 0) {
      const vehicleIds = vehicles.map((v) => v.id);
      await prisma.workOrder.updateMany({
        where: { tenantId, vehicleId: { in: vehicleIds } },
        data: { isArchived: true },
      });
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to archive client.";
    return { error: message };
  }
}
