"use server";

import { prisma } from "@/lib/prisma";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

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
 * The tenant is scoped via DEMO_TENANT_ID (prototype) and will be replaced by
 * the authenticated session's tenantId in production.
 */
export async function fetchActiveJobs(): Promise<
  { data: JobCard[] } | { error: string }
> {
  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: [...ACTIVE_STATUSES] },
      },
      // Sort by createdAt ascending — urgency grouping is handled client-side.
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        createdAt: true,
        client: { select: { firstName: true, lastName: true } },
        vehicle: { select: { make: true, model: true, year: true } },
      },
    });

    const jobs: JobCard[] = rows.map((row: (typeof rows)[number]) => {
      // Only surface a dollar total once the quote has been started.
      const hasQuote = row.laborCents > 0 || row.partsCents > 0;
      const subtotal = row.laborCents + row.partsCents;
      const totalCents = hasQuote
        ? Math.round(subtotal * (1 + TAX_RATE))
        : null;

      return {
        id: row.id,
        title: row.title,
        status: row.status as ActiveStatus,
        laborCents: row.laborCents,
        partsCents: row.partsCents,
        totalCents,
        createdAt: row.createdAt.toISOString(),
        client: {
          firstName: row.client.firstName,
          lastName: row.client.lastName,
        },
        vehicle: {
          make: row.vehicle.make,
          model: row.vehicle.model,
          year: row.vehicle.year,
        },
      };
    });

    return { data: jobs };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs.";
    return { error: message };
  }
}
