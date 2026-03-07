"use server";

/**
 * /quotes/[workOrderId]/convert/actions.ts — Diagnostic-to-Repair Conversion (Issue #53)
 *
 * Server Actions that transition a Diagnostic-Only work order into a full
 * Repair Quote WorkOrder.
 *
 * Key behaviours:
 *   - Preserves all vehicle data, client information, and the diagnostic fee.
 *   - If `rollDiagnosticFee` is true, the diagnostic fee is credited as the
 *     opening labour charge on the new repair quote.
 *   - Validates that the source WorkOrder is actually a diagnostic ticket
 *     (`isDiagnostic === true`) before converting.
 *   - Returns the same `workOrderId` — status is simply transitioned to ACTIVE
 *     and `isDiagnostic` is cleared so the standard Quote Builder takes over.
 */

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConvertDiagnosticParams {
  /** Whether to credit the diagnostic fee toward the repair total. */
  rollDiagnosticFee: boolean;
}

export interface ConvertDiagnosticResult {
  /** The work order ID (unchanged — same record is transitioned in place). */
  workOrderId: string;
  /** The diagnostic fee credited (in cents), or 0 if not rolled. */
  creditedFeeCents: number;
}

// ---------------------------------------------------------------------------
// Server Action — convertDiagnosticToRepairQuote
// ---------------------------------------------------------------------------

/**
 * Converts a Diagnostic-Only WorkOrder into a standard Repair Quote WorkOrder.
 *
 * Steps:
 *   1. Validates the work order exists and is a diagnostic ticket.
 *   2. If `rollDiagnosticFee` is true, credits the diagnostic fee as the
 *      opening labour subtotal.
 *   3. Clears the `isDiagnostic` flag so the Quote Builder treats it as a
 *      regular work order.
 *   4. Mirrors the update to Supabase (best-effort).
 */
export async function convertDiagnosticToRepairQuote(
  workOrderId: string,
  params: ConvertDiagnosticParams,
): Promise<ConvertDiagnosticResult | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  // --- Fetch current state ---------------------------------------------------
  let workOrder: {
    id: string;
    status: string;
    isDiagnostic: boolean;
    diagnosticFeeCents: number;
    rollDiagnosticFee: boolean;
    laborCents: number;
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        isDiagnostic: true,
        diagnosticFeeCents: true,
        rollDiagnosticFee: true,
        laborCents: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  if (!workOrder.isDiagnostic) {
    return {
      error:
        "This work order is not a diagnostic ticket and cannot be converted.",
    };
  }

  // --- Calculate credited fee -----------------------------------------------
  const creditedFeeCents = params.rollDiagnosticFee
    ? workOrder.diagnosticFeeCents
    : 0;

  // --- Persist conversion ---------------------------------------------------
  const newLaborCents = creditedFeeCents > 0
    ? creditedFeeCents  // diagnostic fee becomes opening labour credit
    : 0;

  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        isDiagnostic: false,
        rollDiagnosticFee: params.rollDiagnosticFee,
        laborCents: newLaborCents,
        status: "ACTIVE",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to convert work order: ${message}` };
  }

  // --- Mirror to Supabase (best-effort) ------------------------------------
  try {
    const adminDb = createAdminClient();
    await adminDb
      .from("work_orders")
      .update({
        is_diagnostic: false,
        roll_diagnostic_fee: params.rollDiagnosticFee,
        labor_cents: newLaborCents,
        status: "ACTIVE",
      })
      .eq("id", workOrderId);
  } catch {
    // Non-fatal.
  }

  return { workOrderId, creditedFeeCents };
}

// ---------------------------------------------------------------------------
// Server Action — getDiagnosticTicketData
// ---------------------------------------------------------------------------

/**
 * Fetches everything the conversion UI needs to render the pre-conversion
 * summary screen for a diagnostic work order.
 */
export async function getDiagnosticTicketData(workOrderId: string): Promise<
  | {
      data: {
        workOrderId: string;
        title: string;
        diagnosticFeeCents: number;
        rollDiagnosticFee: boolean;
        isDiagnostic: boolean;
        vehicle: { make: string; model: string; year: number; vin: string | null };
        client: { firstName: string; lastName: string; phone: string };
      };
    }
  | { error: string }
> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        title: true,
        isDiagnostic: true,
        diagnosticFeeCents: true,
        rollDiagnosticFee: true,
        vehicle: { select: { make: true, model: true, year: true, vin: true } },
        client: { select: { firstName: true, lastName: true, phone: true } },
      },
    });

    if (!workOrder) {
      return { error: "Work order not found." };
    }

    return {
      data: {
        workOrderId: workOrder.id,
        title: workOrder.title,
        diagnosticFeeCents: workOrder.diagnosticFeeCents,
        rollDiagnosticFee: workOrder.rollDiagnosticFee,
        isDiagnostic: workOrder.isDiagnostic,
        vehicle: workOrder.vehicle,
        client: workOrder.client,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}
