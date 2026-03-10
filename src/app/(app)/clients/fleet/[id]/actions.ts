"use server";

import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FleetVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileageIn: number | null;
  oilType: string | null;
  openJobCount: number;
  lastServiceDate: string | null;
};

export type FleetWorkOrder = {
  id: string;
  title: string;
  status: string;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  vehicleLabel: string;
  closedAt: string | null;
  selected?: boolean;
};

export type FleetData = {
  clientId: string;
  clientName: string;
  phone: string;
  email: string | null;
  vehicles: FleetVehicle[];
  completedOrders: FleetWorkOrder[];
  fleetSpendYTDCents: number;
};

// ---------------------------------------------------------------------------
// fetchFleetData
// ---------------------------------------------------------------------------

export async function fetchFleetData(
  clientId: string,
): Promise<{ data: FleetData } | { error: string }> {
  if (!clientId) return { error: "Missing client ID." };

  const { tenantId } = await verifySession();

  try {
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        isCommercialFleet: true,
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            plate: true,
            vin: true,
            color: true,
            mileageIn: true,
            oilType: true,
            workOrders: {
              select: {
                id: true,
                title: true,
                status: true,
                laborCents: true,
                partsCents: true,
                closedAt: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { year: "asc" },
        },
      },
    });

    if (!client) return { error: "Client not found." };

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    let fleetSpendYTDCents = 0;

    type VehicleRow = {
      id: string;
      make: string | null;
      model: string | null;
      year: number | null;
      plate: string | null;
      vin: string | null;
      color: string | null;
      mileageIn: number | null;
      oilType: string | null;
      workOrders: {
        id: string;
        title: string;
        status: string;
        laborCents: number;
        partsCents: number;
        closedAt: Date | null;
        createdAt: Date;
      }[];
    };

    const vehicleRows = client.vehicles as VehicleRow[];

    const vehicles: FleetVehicle[] = vehicleRows.map((v) => ({
      id: v.id,
      make: v.make ?? "",
      model: v.model ?? "",
      year: v.year ?? 0,
      plate: v.plate,
      vin: v.vin,
      color: v.color,
      mileageIn: v.mileageIn,
      oilType: v.oilType,
      openJobCount: v.workOrders.filter((w) => w.status !== "PAID").length,
      lastServiceDate: null,
    }));

    // Collect all work orders from all vehicles (sorted desc by createdAt, capped at 100)
    const allWorkOrders = vehicleRows
      .flatMap((v) =>
        v.workOrders.map((w) => ({
          ...w,
          vehicle: { make: v.make, model: v.model, year: v.year },
        })),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100);

    const completedOrders: FleetWorkOrder[] = allWorkOrders
      .filter((w) => ["COMPLETE", "INVOICED", "PAID"].includes(w.status))
      .map((w) => {
        const subtotal = w.laborCents + w.partsCents;
        const total = Math.round(subtotal * (1 + TAX_RATE));

        if (
          w.status === "PAID" &&
          w.closedAt &&
          w.closedAt >= yearStart
        ) {
          fleetSpendYTDCents += total;
        }

        return {
          id: w.id,
          title: w.title,
          status: w.status,
          laborCents: w.laborCents,
          partsCents: w.partsCents,
          totalCents: total,
          vehicleLabel: `${w.vehicle.year ?? 0} ${w.vehicle.make ?? ""} ${w.vehicle.model ?? ""}`,
          closedAt: w.closedAt ? w.closedAt.toISOString() : null,
        };
      });

    return {
      data: {
        clientId: client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        phone: client.phone,
        email: client.email,
        vehicles,
        completedOrders,
        fleetSpendYTDCents,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load fleet.";
    return { error: message };
  }
}
