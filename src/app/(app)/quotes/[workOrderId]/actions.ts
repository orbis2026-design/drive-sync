"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { TAX_RATE, DEFAULT_SHOP_RATE_CENTS } from "./constants";
import { getDueServices, type DueService, formatMilesUntilDue } from "@/lib/predictive-service";
import { MaintenanceScheduleSchema } from "@/lib/schemas/maintenance";

export type { DueService };
export { formatMilesUntilDue };

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
  /** Manufacturer-recommended services due within 3,000 miles of current odometer. */
  dueServices: DueService[];
  /** Current odometer reading (may be null if not recorded). */
  currentMileage: number | null;
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

/** Everything the Send Quote page needs on initial render. */
export interface SendPageData {
  workOrderId: string;
  title: string;
  laborCents: number;
  partsCents: number;
  parts: SelectedPart[];
  shopRateCents: number;
  client: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  vehicle: {
    make: string;
    model: string;
    year: number;
  };
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

/**
 * Simulates a Twilio SMS API call.
 * In production replace this stub with a real Twilio client:
 *   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
 *   await client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body });
 */
function simulateTwilioSMS(to: string, body: string): void {
  console.log("[Twilio SMS] ──────────────────────────────────────────────");
  console.log(`[Twilio SMS] To:   ${to}`);
  console.log(`[Twilio SMS] Body: ${body}`);
  console.log("[Twilio SMS] ──────────────────────────────────────────────");
}

// ---------------------------------------------------------------------------
// Server Action — getQuoteData
// ---------------------------------------------------------------------------

/**
 * Fetches everything the Quote Builder page needs on initial render:
 *   - WorkOrder title
 *   - Saved parts list from `parts_json` (written by the Parts Sourcing step)
 *   - Tenant shop labour rate (defaults to $110/hr if not yet configured)
 *   - Manufacturer recommended due services (Issue #57)
 */
export async function getQuoteData(
  workOrderId: string,
): Promise<{ data: QuoteData } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  let workOrder: {
    id: string;
    title: string;
    tenantId: string;
    vehicle: {
      mileageIn: number | null;
      globalVehicle: {
        maintenanceScheduleJson: unknown;
      } | null;
      workOrders: {
        laborJson: unknown;
      }[];
    } | null;
  } | null = null;
  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        title: true,
        tenantId: true,
        vehicle: {
          select: {
            mileageIn: true,
            globalVehicle: {
              select: { maintenanceScheduleJson: true },
            },
            // Fetch labor line items from past PAID work orders to filter
            // out already-completed services (Issue #57).
            workOrders: {
              where: { status: "PAID" },
              select: { laborJson: true },
            },
          },
        },
      },
    });
  } catch {
    // Database unavailable in demo — fall through to error below.
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  // --- Compute due services (Issue #57) ------------------------------------
  let dueServices: DueService[] = [];
  const currentMileage = workOrder.vehicle?.mileageIn ?? null;

  if (currentMileage !== null && workOrder.vehicle?.globalVehicle) {
    const rawSchedule = workOrder.vehicle.globalVehicle.maintenanceScheduleJson;
    const scheduleResult = MaintenanceScheduleSchema.safeParse(rawSchedule);

    if (scheduleResult.success) {
      // Build the set of completed task names from past PAID WorkOrders.
      const completedTasks: string[] = [];
      for (const wo of workOrder.vehicle.workOrders) {
        if (Array.isArray(wo.laborJson)) {
          for (const item of wo.laborJson as { description?: string }[]) {
            if (typeof item.description === "string" && item.description) {
              completedTasks.push(item.description);
            }
          }
        }
      }

      dueServices = getDueServices(
        currentMileage,
        scheduleResult.data,
        completedTasks,
      );
    }
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
      dueServices,
      currentMileage,
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

// ---------------------------------------------------------------------------
// Server Action — getSendPageData
// ---------------------------------------------------------------------------

/**
 * Fetches everything the Send Quote page needs:
 *   - Locked WorkOrder totals (laborCents, partsCents)
 *   - Client name and phone number
 *   - Vehicle year/make/model
 *   - Parts list for display
 *   - Tenant shop labour rate for recalculating tax
 *
 * Returns an error if the work order is not yet locked (status !== ACTIVE).
 */
export async function getSendPageData(
  workOrderId: string,
): Promise<{ data: SendPageData } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  let workOrder: {
    id: string;
    title: string;
    status: string;
    laborCents: number;
    partsCents: number;
    tenantId: string;
    clientId: string;
    client: { firstName: string; lastName: string; phone: string };
    vehicle: { make: string; model: string; year: number };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        tenantId: true,
        clientId: true,
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

  // Allow mechanics to revisit the send page even after the SMS has been sent
  // (PENDING_APPROVAL). Only INTAKE / COMPLETE / INVOICED states are rejected.
  if (workOrder.status !== "ACTIVE" && workOrder.status !== "PENDING_APPROVAL") {
    return {
      error:
        "Quote has not been locked yet. Please return to the Quote Builder and lock the quote before sending.",
    };
  }

  const [parts, shopRateCents] = await Promise.all([
    fetchPartsJson(workOrderId),
    fetchShopRate(workOrder.tenantId),
  ]);

  return {
    data: {
      workOrderId: workOrder.id,
      title: workOrder.title,
      laborCents: workOrder.laborCents,
      partsCents: workOrder.partsCents,
      parts,
      shopRateCents,
      client: workOrder.client,
      vehicle: workOrder.vehicle,
    },
  };
}

// ---------------------------------------------------------------------------
// Server Action — sendQuote
// ---------------------------------------------------------------------------

/**
 * Finalises the quote for client delivery:
 *   1. Validates the work order is locked (ACTIVE status).
 *   2. Generates a cryptographically secure UUID approval token.
 *   3. Persists the token and transitions status to PENDING_APPROVAL via Prisma.
 *   4. Mirrors the update to the Supabase `work_orders` row (best-effort).
 *   5. Simulates a Twilio SMS to the client's phone number.
 *
 * Prevents double-sends: once status is PENDING_APPROVAL the action is a no-op
 * for any subsequent calls on the same work order.
 */
export async function sendQuote(
  workOrderId: string,
): Promise<{ success: true; portalUrl: string; smsBody: string } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  // --- Fetch WorkOrder + client data -----------------------------------
  let workOrder: {
    status: string;
    title: string;
    client: { firstName: string; lastName: string; phone: string };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        status: true,
        title: true,
        client: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  if (workOrder.status === "PENDING_APPROVAL") {
    // Already sent — treat as a success to allow retries from the UI.
    // Fetch the existing token to rebuild the portal URL.
    let existingToken: string | null = null;
    try {
      const existing = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { approvalToken: true, client: { select: { phone: true } } },
      });
      existingToken = existing?.approvalToken ?? null;
    } catch {
      // Best-effort; proceed without the URL.
    }
    const portalBaseUrl =
      process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "https://app.domain.com";
    const portalUrl = existingToken
      ? `${portalBaseUrl}/portal/${existingToken}`
      : `${portalBaseUrl}/portal/`;
    const smsBody =
      `Your mechanic has finished diagnosing your vehicle. ` +
      `Tap here to review and approve the repair quote: ${portalUrl}`;
    return { success: true, portalUrl, smsBody };
  }

  if (workOrder.status !== "ACTIVE") {
    return {
      error:
        "Quote must be locked before sending. Please lock the quote first.",
    };
  }

  // --- Generate secure approval token ----------------------------------
  const token = crypto.randomUUID();

  // --- Persist token + status transition via Prisma --------------------
  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "PENDING_APPROVAL",
        approvalToken: token,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to save approval token: ${message}` };
  }

  // --- Mirror update to Supabase work_orders (best-effort) -------------
  try {
    const adminDb = createAdminClient();
    await adminDb
      .from("work_orders")
      .update({ approval_token: token, status: "PENDING_APPROVAL" })
      .eq("id", workOrderId);
  } catch {
    // Non-fatal — Prisma write succeeded; Supabase column may not be
    // migrated yet in the current environment.
  }

  // --- Simulate Twilio SMS ---------------------------------------------
  const portalBaseUrl =
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "https://app.domain.com";
  const portalUrl = `${portalBaseUrl}/portal/${token}`;
  const smsBody =
    `Your mechanic has finished diagnosing your vehicle. ` +
    `Tap here to review and approve the repair quote: ${portalUrl}`;

  simulateTwilioSMS(workOrder.client.phone, smsBody);

  return { success: true, portalUrl, smsBody };
}
