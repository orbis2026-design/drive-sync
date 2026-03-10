/**
 * GET /api/fleet/work-orders
 *
 * Returns COMPLETE / INVOICED WorkOrders for a specific commercial fleet
 * client within a date range. Used by the Fleet Billing UI to refresh the
 * work-order list when the Shop Owner changes the filter.
 *
 * Query parameters:
 *   clientId  — Prisma Client ID
 *   from      — ISO date string (YYYY-MM-DD), inclusive lower bound on closedAt
 *   to        — ISO date string (YYYY-MM-DD), inclusive upper bound on closedAt
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FleetWorkOrder } from "@/app/(app)/fleet/billing/page";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clientId = searchParams.get("clientId");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  const today = new Date();
  const from = fromStr
    ? new Date(fromStr)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const to = toStr ? new Date(toStr) : today;

  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        vehicle: { clientId },
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
        vehicle: {
          select: { make: true, model: true, year: true, plate: true },
        },
      },
    });

    type WoRow = {
      id: string;
      title: string;
      laborCents: number;
      partsCents: number;
      closedAt: Date | null;
      vehicle: { make: string | null; model: string | null; year: number | null; plate: string | null };
    };

    const workOrders: FleetWorkOrder[] = (rows as WoRow[]).map((wo) => {
      const plate = wo.vehicle.plate ? `Van ${wo.vehicle.plate}` : "Van";
      const vehicleLabel = `${plate} — ${wo.vehicle.year ?? 0} ${wo.vehicle.make ?? ""} ${wo.vehicle.model ?? ""}`;
      return {
        id: wo.id,
        title: wo.title,
        vehicleLabel,
        totalCents: wo.laborCents + wo.partsCents,
        closedAt: wo.closedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ workOrders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
