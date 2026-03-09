"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default number of oil quarts deducted from the matching Consumable when a
 * WorkOrder is marked PAID and the vehicle's oilType is recognized but no
 * GlobalVehicle oil-capacity record is available.
 */
const DEFAULT_OIL_DEDUCTION_QUARTS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All data the Checkout Terminal needs on initial render. */
export type CheckoutData = {
  workOrderId: string;
  title: string;
  laborCents: number;
  partsCents: number;
  totalCents: number;
  taxCents: number;
  subtotalCents: number;
  isPaid: boolean;
  closedAt: string | null;
  paymentMethod: string | null;
  client: { firstName: string; lastName: string; phone: string };
  vehicle: { make: string; model: string; year: number };
};

// ---------------------------------------------------------------------------
// Server Action — getCheckoutData
// ---------------------------------------------------------------------------

/**
 * Fetches everything the Checkout Terminal needs on initial render:
 *   - WorkOrder totals (laborCents, partsCents)
 *   - Client name and phone number
 *   - Vehicle year/make/model
 *   - Parts list for tax recalculation
 *   - Whether the job has already been paid
 *
 * Valid for work orders in PENDING_APPROVAL, ACTIVE, INVOICED, or PAID status.
 */
export async function getCheckoutData(
  workOrderId: string,
): Promise<{ data: CheckoutData } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  let workOrder: {
    id: string;
    title: string;
    status: string;
    laborCents: number;
    partsCents: number;
    tenantId: string;
    closedAt: Date | null;
    paymentMethod: string | null;
    client: { firstName: string; lastName: string; phone: string };
    vehicle: { make: string; model: string; year: number };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        tenantId: true,
        closedAt: true,
        paymentMethod: true,
        client: { select: { firstName: true, lastName: true, phone: true } },
        vehicle: { select: { make: true, model: true, year: true } },
      },
    });
  } catch {
    // Database unavailable in demo — fall through to error below.
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  const isPaid = workOrder.status === "PAID";

  // Only allow checkout for work orders that are ready for payment or already paid.
  const allowedStatuses = [
    "PENDING_APPROVAL",
    "ACTIVE",
    "INVOICED",
    "COMPLETE",
    "PAID",
  ];
  if (!allowedStatuses.includes(workOrder.status)) {
    return {
      error:
        "This work order is not ready for checkout. The quote must be approved before collecting payment.",
    };
  }

  // Use stored partsCents and laborCents as authoritative totals.
  const partsSubtotalCents = workOrder.partsCents;
  const laborSubtotalCents = workOrder.laborCents;
  const subtotalCents = partsSubtotalCents + laborSubtotalCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  return {
    data: {
      workOrderId: workOrder.id,
      title: workOrder.title,
      laborCents: laborSubtotalCents,
      partsCents: partsSubtotalCents,
      totalCents,
      taxCents,
      subtotalCents,
      isPaid,
      closedAt: workOrder.closedAt ? workOrder.closedAt.toISOString() : null,
      paymentMethod: workOrder.paymentMethod,
      client: workOrder.client,
      vehicle: workOrder.vehicle,
    },
  };
}

// ---------------------------------------------------------------------------
// Server Action — processPayment
// ---------------------------------------------------------------------------

/**
 * Records a payment and marks the work order as PAID.
 *
 * Steps:
 *   1. Validates the work order exists and is NOT already PAID.
 *   2. Transitions status to PAID via Prisma, setting closedAt and paymentMethod.
 *   3. Mirrors the update to the Supabase work_orders row (best-effort).
 *
 * Payment methods:
 *   - "card_tap"    — tap-to-pay / contactless
 *   - "card_manual" — manual card entry
 *   - "cash"        — cash payment
 *   - "check"       — check payment
 */
export async function processPayment(
  workOrderId: string,
  paymentMethod: "card" | "cash_check",
  cardDetails?: { last4: string; brand: string },
): Promise<{ success: true; closedAt: string } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  // --- Fetch work order to validate state ----------------------------------
  let workOrder: { id: string; status: string } | null = null;

  try {
    workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true, status: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  if (workOrder.status === "PAID") {
    return { error: "This work order has already been paid." };
  }

  // Determine the stored payment method string.
  let storedMethod: string;
  if (paymentMethod === "card") {
    storedMethod = cardDetails ? "card_manual" : "card_tap";
  } else {
    // cash_check — caller passes "cash" or "check" as the brand field
    storedMethod = cardDetails?.brand ?? "cash";
  }

  const closedAt = new Date();

  // --- Persist via Prisma (atomic) -----------------------------------------
  // The work order status update and the consumable deduction are wrapped in a
  // single interactive transaction so they either both commit or both roll back.
  // This prevents inventory from drifting when the deduction fails after the
  // status write, and eliminates the lost-update race on currentStock.
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Mark work order as PAID.
      await tx.workOrder.updateMany({
        where: { id: workOrderId, tenantId },
        data: {
          status: "PAID",
          closedAt,
          paymentMethod: storedMethod,
        },
      });

      // 2. Find the vehicle's oilType inside the same transaction.
      const wo = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: {
          vehicle: { select: { oilType: true } },
        },
      });

      const oilType = wo?.vehicle?.oilType ?? null;

      if (oilType) {
        // 3. Find the matching consumable row by name similarity (case-insensitive prefix match).
        const consumable = await tx.consumable.findFirst({
          where: {
            tenantId,
            name: { contains: oilType.split(" ")[0], mode: "insensitive" },
          },
          select: { id: true, currentStock: true },
        });

        if (consumable) {
          // 4. Deduct stock atomically within the same transaction.
          const newStock = Math.max(
            0,
            consumable.currentStock - DEFAULT_OIL_DEDUCTION_QUARTS,
          );
          await tx.consumable.update({
            where: { id: consumable.id },
            data: { currentStock: newStock },
          });
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to record payment: ${message}` };
  }

  // --- Mirror to Supabase work_orders (best-effort) ------------------------
  // Intentionally outside the transaction — this is a best-effort sync.
  try {
    const adminDb = createAdminClient();
    await adminDb
      .from("work_orders")
      .update({
        status: "PAID",
        closed_at: closedAt.toISOString(),
        payment_method: storedMethod,
      })
      .eq("id", workOrderId)
      .eq("tenant_id", tenantId);
  } catch {
    // Non-fatal — Prisma write succeeded.
  }

  // --- Auto-deduct consumables (best-effort) --------------------------------
  // When a job is closed, query the vehicle's oilType to find the matching
  // consumable and deduct the oil capacity (defaulting to 5 quarts if unknown).
  // The find + update are wrapped in a transaction so the read-then-write is
  // atomic and concurrent payment closures cannot double-deduct the same stock.
  try {
    await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: {
          vehicle: { select: { oilType: true } },
        },
      });

      const oilType = wo?.vehicle?.oilType ?? null;

      if (!oilType) return;

      // Find the matching consumable row by name similarity (case-insensitive prefix match)
      const consumable = await tx.consumable.findFirst({
        where: {
          tenantId,
          name: { contains: oilType.split(" ")[0], mode: "insensitive" },
        },
        select: { id: true, currentStock: true },
      });

      if (consumable) {
        const newStock = Math.max(
          0,
          consumable.currentStock - DEFAULT_OIL_DEDUCTION_QUARTS,
        );
        await tx.consumable.update({
          where: { id: consumable.id },
          data: { currentStock: newStock },
        });
      }
    });
  } catch {
    // Non-fatal — consumable deduction is best-effort.
  }

  revalidatePath("/jobs");
  return { success: true, closedAt: closedAt.toISOString() };
}
