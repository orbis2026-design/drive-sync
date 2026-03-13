"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The five active statuses shown on the board.
 * PAID is intentionally excluded — those jobs are closed.
 * This is a module-private constant; the types it produces are exported instead.
 */
const ACTIVE_STATUSES = [
  "INTAKE",
  "ACTIVE",
  "PENDING_APPROVAL",
  "COMPLETE",
  "INVOICED",
] as const;

export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

/** All data needed to render a single job card on the board. */
export type JobCard = {
  id: string;
  title: string;
  status: ActiveStatus;
  laborCents: number;
  partsCents: number;
  /** Pre-calculated total including tax, or null when not yet quoted. */
  totalCents: number | null;
  createdAt: string;
  client: { firstName: string; lastName: string };
  vehicle: { make: string; model: string; year: number };
};

/** Requested work order (customer-submitted; awaiting accept/decline). */
export type RequestedJobCard = {
  id: string;
  title: string;
  createdAt: string;
  client: { firstName: string; lastName: string };
  vehicle: { make: string; model: string; year: number };
};

// ---------------------------------------------------------------------------
// getCachedActiveJobs — unstable_cache wrapper for the Prisma query
// ---------------------------------------------------------------------------

const getCachedActiveJobs = unstable_cache(
  async (tenantId: string): Promise<JobCard[]> => {
    // First load work orders with scalar fields only.
    const rows = await prisma.workOrder.findMany({
      where: {
        tenantId,
        isArchived: false,
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        createdAt: true,
        vehicleId: true,
      },
    });

    const vehicleIds = rows.map((row) => row.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        clientId: true,
      },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const clientIds = vehicles.map((v) => v.clientId);
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const clientById = new Map(clients.map((c) => [c.id, c]));

    return rows.map((row) => {
      const hasQuote = row.laborCents > 0 || row.partsCents > 0;
      const subtotal = row.laborCents + row.partsCents;
      const totalCents = hasQuote
        ? Math.round(subtotal * (1 + TAX_RATE))
        : null;

      const v = vehicleById.get(row.vehicleId);
      const c = v ? clientById.get(v.clientId) : null;

      return {
        id: row.id,
        title: row.title,
        status: row.status as ActiveStatus,
        laborCents: row.laborCents,
        partsCents: row.partsCents,
        totalCents,
        createdAt: row.createdAt.toISOString(),
        client: {
          firstName: c?.firstName ?? "",
          lastName: c?.lastName ?? "",
        },
        vehicle: {
          make: v?.make ?? "",
          model: v?.model ?? "",
          year: v?.year ?? 0,
        },
      };
    });
  },
  ["active-jobs"],
  { revalidate: 30, tags: ["jobs"] },
);

// ---------------------------------------------------------------------------
// getRequestedJobs — REQUESTED work orders for the Requests inbox
// ---------------------------------------------------------------------------

const getCachedRequestedJobs = unstable_cache(
  async (tenantId: string): Promise<RequestedJobCard[]> => {
    const rows = await prisma.workOrder.findMany({
      where: { tenantId, status: "REQUESTED", isArchived: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        vehicleId: true,
      },
    });

    const vehicleIds = rows.map((row) => row.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        clientId: true,
      },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const clientIds = vehicles.map((v) => v.clientId);
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const clientById = new Map(clients.map((c) => [c.id, c]));

    return rows.map((row) => {
      const v = vehicleById.get(row.vehicleId);
      const c = v ? clientById.get(v.clientId) : null;
      return {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        client: {
          firstName: c?.firstName ?? "",
          lastName: c?.lastName ?? "",
        },
        vehicle: {
          make: v?.make ?? "",
          model: v?.model ?? "",
          year: v?.year ?? 0,
        },
      };
    });
  },
  ["requested-jobs"],
  { revalidate: 30, tags: ["requests", "jobs"] },
);

export async function fetchRequestedJobs(): Promise<
  { data: RequestedJobCard[] } | { data: null; error: string }
> {
  const { tenantId } = await verifySession();

  try {
    const jobs = await getCachedRequestedJobs(tenantId);
    return { data: jobs };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { data: null, error: "Database synchronization pending or unreachable." };
    }
    const message = err instanceof Error ? err.message : "Failed to load requests.";
    return { data: null, error: message };
  }
}

// ---------------------------------------------------------------------------
// fetchActiveJobs — primary data hook for the Active Jobs board
// ---------------------------------------------------------------------------

/**
 * Fetches all open WorkOrders for the active tenant.
 *
 * Results are sorted by creation date ascending (oldest jobs first) so that
 * within each stage, the most overdue job surfaces at the top. Status-based
 * urgency grouping is applied client-side in JobsBoard.tsx via accordion lanes.
 *
 * Only statuses that represent in-progress work are returned; PAID is excluded.
 */
export async function fetchActiveJobs(): Promise<
  { data: JobCard[] } | { data: null; error: string }
> {
  const { tenantId } = await verifySession();

  try {
    const jobs = await getCachedActiveJobs(tenantId);
    return { data: jobs };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { data: null, error: "Database synchronization pending or unreachable." };
    }
    const message = err instanceof Error ? err.message : "Failed to load jobs.";
    return { data: null, error: message };
  }
}

// ---------------------------------------------------------------------------
// advanceWorkOrderStatus — inline Kanban status advancement
// ---------------------------------------------------------------------------

/**
 * The subset of status transitions that can be triggered directly from the
 * Kanban board without navigating to a detail page.
 *
 * Allowed moves:
 *   INTAKE       → ACTIVE    (start ordering parts / begin diagnosis)
 *   COMPLETE     → INVOICED  (mark ready for payment)
 */
const ADVANCE_MAP: Partial<Record<ActiveStatus, ActiveStatus>> = {
  INTAKE: "ACTIVE",
  COMPLETE: "INVOICED",
};

export async function advanceWorkOrderStatus(
  workOrderId: string,
): Promise<{ nextStatus: ActiveStatus } | { error: string }> {
  const { tenantId } = await verifySession();

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      select: { status: true },
    });

    if (!workOrder) {
      return { error: "Work order not found." };
    }

    const nextStatus = ADVANCE_MAP[workOrder.status as ActiveStatus];
    if (!nextStatus) {
      return { error: "No automatic advance available for this status." };
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: nextStatus },
    });

    revalidatePath("/jobs");
    revalidateTag("jobs", "max");
    return { nextStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update status.";
    return { error: message };
  }
}
