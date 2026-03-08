/**
 * Fleet Manager Batch Invoicing Engine — Server Page  (Issue #61)
 *
 * Renders the UI for a Shop Owner to:
 *   • Select a commercial fleet client and date range.
 *   • View all COMPLETE WorkOrders in that range.
 *   • Roll them up into a single consolidated Stripe Invoice.
 *
 * File scope: src/app/(app)/fleet/billing/page.tsx
 */

import { prisma } from "@/lib/prisma";
import { FleetBillingClient } from "./FleetBillingClient";
import { getTenantId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types shared with the client component
// ---------------------------------------------------------------------------

export type FleetClient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

export type FleetWorkOrder = {
  id: string;
  title: string;
  vehicleLabel: string; // e.g. "Van #4 — 2020 Ford Transit"
  totalCents: number;
  closedAt: string | null;
};

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchFleetClients(): Promise<FleetClient[]> {
  const tenantId = await getTenantId();
  if (!tenantId) return [];
  try {
    const clients = await prisma.client.findMany({
      where: { tenantId, isCommercialFleet: true },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return clients;
  } catch {
    return [];
  }
}

async function fetchCompletedWorkOrders(
  clientId: string,
  from: Date,
  to: Date,
): Promise<FleetWorkOrder[]> {
  if (!clientId) return [];
  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        clientId,
        status: { in: ["COMPLETE", "INVOICED"] },
        closedAt: { gte: from, lte: to },
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        closedAt: true,
        vehicle: { select: { make: true, model: true, year: true, plate: true } },
      },
    });

    type WoRow = {
      id: string;
      title: string;
      laborCents: number;
      partsCents: number;
      closedAt: Date | null;
      vehicle: { make: string; model: string; year: number; plate: string | null };
    };

    return (rows as WoRow[]).map((wo) => {
      const plate = wo.vehicle.plate ? `Van ${wo.vehicle.plate}` : "Van";
      const vehicleLabel = `${plate} — ${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`;
      return {
        id: wo.id,
        title: wo.title,
        vehicleLabel,
        totalCents: wo.laborCents + wo.partsCents,
        closedAt: wo.closedAt?.toISOString() ?? null,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const metadata = {
  title: "Fleet Batch Invoicing — DriveSync",
  description:
    "Consolidate completed fleet WorkOrders into a single Net-30 Stripe invoice.",
};

export default async function FleetBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clientId = typeof params.clientId === "string" ? params.clientId : null;

  // Default date range: first day of current month → today
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultTo = today;

  const fromStr =
    typeof params.from === "string" ? params.from : defaultFrom.toISOString().slice(0, 10);
  const toStr =
    typeof params.to === "string" ? params.to : defaultTo.toISOString().slice(0, 10);

  const [clients, workOrders] = await Promise.all([
    fetchFleetClients(),
    clientId
      ? fetchCompletedWorkOrders(clientId, new Date(fromStr), new Date(toStr))
      : Promise.resolve<FleetWorkOrder[]>([]),
  ]);

  return (
    <FleetBillingClient
      clients={clients}
      initialWorkOrders={workOrders}
      initialClientId={clientId}
      initialFrom={fromStr}
      initialTo={toStr}
    />
  );
}
