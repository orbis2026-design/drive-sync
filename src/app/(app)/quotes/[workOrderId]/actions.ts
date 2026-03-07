"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { TAX_RATE, DEFAULT_SHOP_RATE_CENTS } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A finalised parts line-item as persisted in `parts_json` on the work order
 * by the Parts Sourcing step.
 */
export interface SelectedPart {
  partId: string;
  name: string;
  partNumber: string;
  supplier: "AutoZone" | "Worldpac";
  /** Cost the shop pays, in US cents. */
  wholesalePriceCents: number;
  /** Retail price (40 % gross margin applied), in US cents. */
  retailPriceCents: number;
  quantity: number;
}

/** Everything the Quote Builder page needs on initial render. */
export interface QuoteData {
  workOrderId: string;
  title: string;
  parts: SelectedPart[];
  /** Tenant shop labour rate in US cents per hour. */
  shopRateCents: number;
}

export interface LockQuoteParams {
  /** Mechanic-entered labour hours (e.g. 2.5). */
  laborHours: number;
  /**
   * When true the retail markup is stripped — parts are billed at wholesale
   * because the customer supplied their own parts.
   */
  customerSuppliedParts: boolean;
}

/** Authoritative quote totals calculated exclusively on the backend. */
export interface QuoteCalculation {
  partsSubtotalCents: number;
  laborSubtotalCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Shared return type for write server actions. */
export interface ActionResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Reads `parts_json` from Supabase; returns [] on any failure. */
async function fetchPartsJson(workOrderId: string): Promise<SelectedPart[]> {
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("work_orders")
      .select("parts_json")
      .eq("id", workOrderId)
      .single();

    if (data && Array.isArray((data as Record<string, unknown>).parts_json)) {
      return (data as Record<string, unknown>).parts_json as SelectedPart[];
    }
  } catch {
    // Supabase unavailable or column not present — return empty array.
  }
  return [];
}

/**
 * Attempts to read a `labor_rate_cents` column from the tenants table.
 * Falls back to DEFAULT_SHOP_RATE_CENTS if the column is absent or the
 * record cannot be found (expected during the prototype phase).
 */
async function fetchShopRate(tenantId: string): Promise<number> {
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("tenants")
      .select("labor_rate_cents")
      .eq("id", tenantId)
      .single();

    const rate = (data as Record<string, unknown> | null)?.labor_rate_cents;
    if (typeof rate === "number" && rate > 0) {
      return rate;
    }
  } catch {
    // Column not present yet, or DB unavailable — fall back to demo default.
  }
  return DEFAULT_SHOP_RATE_CENTS;
}

// ---------------------------------------------------------------------------
// Server Action — getQuoteData
// ---------------------------------------------------------------------------

/**
 * Fetches everything the Quote Builder page needs on initial render:
 *   - WorkOrder title
 *   - Saved parts list from `parts_json` (written by the Parts Sourcing step)
 *   - Tenant shop labour rate (defaults to $110/hr if not yet configured)
 */
export async function getQuoteData(
  workOrderId: string,
): Promise<{ data: QuoteData } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  let workOrder: { id: string; title: string; tenantId: string } | null = null;
  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, title: true, tenantId: true },
    });
  } catch {
    // Database unavailable in demo — fall through to error below.
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  const [parts, shopRateCents] = await Promise.all([
    fetchPartsJson(workOrderId),
    fetchShopRate(workOrder.tenantId),
  ]);

  return {
    data: {
      workOrderId: workOrder.id,
      title: workOrder.title,
      parts,
      shopRateCents,
    },
  };
}

// ---------------------------------------------------------------------------
// Server Action — lockQuote
// ---------------------------------------------------------------------------

/**
 * Calculates the final quote entirely on the backend — never trusts
 * client-supplied totals.  Persists the result to the WorkOrder row and
 * returns the authoritative numbers for display.
 *
 * Math:
 *   parts subtotal = Σ (unitPrice × qty)     where unitPrice is retail or wholesale
 *   labor subtotal = round(laborHours × shopRateCents)
 *   subtotal       = parts subtotal + labor subtotal
 *   tax            = round(subtotal × TAX_RATE)
 *   total          = subtotal + tax
 */
export async function lockQuote(
  workOrderId: string,
  params: LockQuoteParams,
): Promise<{ calculation: QuoteCalculation } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { laborHours, customerSuppliedParts } = params;

  if (
    typeof laborHours !== "number" ||
    !isFinite(laborHours) ||
    laborHours < 0 ||
    laborHours > 200
  ) {
    return { error: "Labour hours must be a number between 0 and 200." };
  }

  // --- Fetch authoritative data from the database -----------------------
  let tenantId: string;
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { tenantId: true },
    });
    if (!workOrder) {
      return { error: "Work order not found." };
    }
    tenantId = workOrder.tenantId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  // Re-fetch parts from the database — never trust the client.
  const [parts, shopRateCents] = await Promise.all([
    fetchPartsJson(workOrderId),
    fetchShopRate(tenantId),
  ]);

  // --- Backend math -----------------------------------------------------
  const partsSubtotalCents = parts.reduce((sum, p) => {
    const unitPrice = customerSuppliedParts
      ? p.wholesalePriceCents
      : p.retailPriceCents;
    return sum + unitPrice * p.quantity;
  }, 0);

  const laborSubtotalCents = Math.round(
    Math.max(0, laborHours) * shopRateCents,
  );

  const subtotalCents = partsSubtotalCents + laborSubtotalCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  // --- Persist to WorkOrder --------------------------------------------
  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        laborCents: laborSubtotalCents,
        partsCents: partsSubtotalCents,
        status: "ACTIVE",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to save quote: ${message}` };
  }

  return {
    calculation: {
      partsSubtotalCents,
      laborSubtotalCents,
      subtotalCents,
      taxCents,
      totalCents,
    },
  };
}
