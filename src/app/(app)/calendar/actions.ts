"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A work order that has been placed on the calendar. */
export type ScheduledJob = {
  id: string;
  title: string;
  scheduledAt: string; // ISO string
  durationMinutes: number; // always 60 for now; future: estimate from job type
  status: string;
  client: { firstName: string; lastName: string; zipCode: string | null };
  vehicle: { make: string; model: string; year: number };
};

/** An APPROVED work order waiting to be scheduled. */
export type BacklogJob = {
  id: string;
  title: string;
  status: string;
  client: { firstName: string; lastName: string };
  vehicle: { make: string; model: string; year: number };
  createdAt: string;
};

export type CalendarData = {
  scheduled: ScheduledJob[];
  backlog: BacklogJob[];
};

// ---------------------------------------------------------------------------
// fetchCalendarData
// ---------------------------------------------------------------------------

/**
 * Returns:
 *  - `scheduled`: WorkOrders that have a scheduledAt timestamp within ±3 days
 *    of the given date (or today if not provided).
 *  - `backlog`:   WorkOrders in APPROVED/ACTIVE/INTAKE status with no scheduledAt,
 *    for display in the unscheduled backlog drawer.
 */
export async function fetchCalendarData(
  centerDate?: string,
): Promise<{ data: CalendarData } | { error: string }> {
  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    const center = centerDate ? new Date(centerDate) : new Date();
    const rangeStart = new Date(center);
    rangeStart.setDate(rangeStart.getDate() - 3);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(center);
    rangeEnd.setDate(rangeEnd.getDate() + 4);
    rangeEnd.setHours(23, 59, 59, 999);

    const [scheduledRaw, backlogRaw] = await Promise.all([
      prisma.workOrder.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          scheduledAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          status: true,
          client: { select: { firstName: true, lastName: true, zipCode: true } },
          vehicle: { select: { make: true, model: true, year: true } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.workOrder.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          scheduledAt: null,
          status: { in: ["ACTIVE", "INTAKE", "REQUESTED"] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          client: { select: { firstName: true, lastName: true } },
          vehicle: { select: { make: true, model: true, year: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);

    const scheduled: ScheduledJob[] = (scheduledRaw as Array<{
      id: string;
      title: string;
      scheduledAt: Date | null;
      status: string;
      client: { firstName: string; lastName: string; zipCode?: string | null };
      vehicle: { make: string; model: string; year: number };
    }>)
      .filter((w) => w.scheduledAt !== null)
      .map((w) => ({
        id: w.id,
        title: w.title,
        scheduledAt: w.scheduledAt!.toISOString(),
        durationMinutes: 60,
        status: w.status,
        client: {
          firstName: w.client.firstName,
          lastName: w.client.lastName,
          zipCode: w.client.zipCode ?? null,
        },
        vehicle: w.vehicle,
      }));

    const backlog: BacklogJob[] = (backlogRaw as Array<{
      id: string;
      title: string;
      status: string;
      client: { firstName: string; lastName: string };
      vehicle: { make: string; model: string; year: number };
      createdAt: Date;
    }>).map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      client: { firstName: w.client.firstName, lastName: w.client.lastName },
      vehicle: w.vehicle,
      createdAt: w.createdAt.toISOString(),
    }));

    return { data: { scheduled, backlog } };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load calendar.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// scheduleWorkOrder
// ---------------------------------------------------------------------------

/**
 * Assigns a scheduledAt timestamp to a WorkOrder, placing it on the calendar.
 * Called when the mechanic drops a backlog card onto a time slot.
 */
export async function scheduleWorkOrder(
  workOrderId: string,
  scheduledAt: string,
): Promise<{ success: true } | { error: string }> {
  if (!workOrderId || !scheduledAt) {
    return { error: "Missing required fields." };
  }

  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) {
    return { error: "Invalid date." };
  }

  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { scheduledAt: date },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/calendar");
  return { success: true };
}

// ---------------------------------------------------------------------------
// unscheduleWorkOrder
// ---------------------------------------------------------------------------

/** Removes a work order from the calendar (sets scheduledAt = null). */
export async function unscheduleWorkOrder(
  workOrderId: string,
): Promise<{ success: true } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { scheduledAt: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  revalidatePath("/calendar");
  return { success: true };
}

// ---------------------------------------------------------------------------
// cancelWorkOrder (Issue #87 — Elastic Dispatch)
// ---------------------------------------------------------------------------

/**
 * Marks a scheduled work order as CANCELLED.
 * The CalendarClient uses this to trigger the ElasticDispatchPrompt so the
 * mechanic can optionally notify the next queued client of an earlier arrival.
 */
export async function cancelWorkOrder(
  workOrderId: string,
): Promise<{ success: true; nextJob: ScheduledJob | null } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    // 1. Cancel the target work order and clear its slot
    const cancelled = await prisma.workOrder.update({
      where: { id: workOrderId },
      // CANCELLED is added in migration 20260308300000
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: "CANCELLED" as any, scheduledAt: null },
      select: { tenantId: true },
    });

    // 2. Find the next scheduled job for this tenant (soonest future scheduledAt)
    const effectiveTenantId = tenantId ?? cancelled.tenantId;
    const nextRaw = await prisma.workOrder.findFirst({
      where: {
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
        scheduledAt: { gte: new Date() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: { notIn: ["CANCELLED", "COMPLETE", "INVOICED", "PAID"] as any[] },
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        status: true,
        client: { select: { firstName: true, lastName: true, zipCode: true } },
        vehicle: { select: { make: true, model: true, year: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const nextClient = nextRaw?.client as
      | { firstName: string; lastName: string; zipCode?: string | null }
      | null;
    const nextVehicle = nextRaw?.vehicle as
      | { make: string; model: string; year: number }
      | null;

    const nextJob: ScheduledJob | null =
      nextRaw?.scheduledAt && nextClient && nextVehicle
        ? {
            id: nextRaw.id,
            title: nextRaw.title,
            scheduledAt: (nextRaw.scheduledAt as Date).toISOString(),
            durationMinutes: 60,
            status: nextRaw.status as string,
            client: {
              firstName: nextClient.firstName,
              lastName: nextClient.lastName,
              zipCode: nextClient.zipCode ?? null,
            },
            vehicle: nextVehicle,
          }
        : null;

    revalidatePath("/calendar");
    return { success: true, nextJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}
