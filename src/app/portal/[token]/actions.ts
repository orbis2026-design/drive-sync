"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MpiStatus = "PASS" | "MONITOR" | "FAIL" | null;

export interface MpiPoint {
  status: MpiStatus;
  note: string;
}

export interface MpiData {
  fluids: MpiPoint;
  tires: MpiPoint;
  brakes: MpiPoint;
  belts: MpiPoint;
}

export interface SelectedPart {
  partId: string;
  name: string;
  partNumber: string;
  supplier: "AutoZone" | "Worldpac";
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
}

export interface PortalData {
  workOrderId: string;
  title: string;
  status: string;
  laborCents: number;
  partsCents: number;
  /** Tax computed at the same rate as the Quote Builder (TAX_RATE). */
  taxCents: number;
  /** Grand total including tax. */
  totalCents: number;
  parts: SelectedPart[];
  mpi: MpiData | null;
  client: {
    firstName: string;
    lastName: string;
  };
  vehicle: {
    make: string;
    model: string;
    year: number;
    color: string | null;
    mileageIn: number | null;
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Casts an unknown Supabase row value to a plain object record so that
 * JSON columns can be accessed without TypeScript `any`.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Reads `parts_json` from the Supabase work_orders row; returns [] on any failure. */
async function fetchPartsJson(workOrderId: string): Promise<SelectedPart[]> {
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("work_orders")
      .select("parts_json")
      .eq("id", workOrderId)
      .single();

    const row = asRecord(data);
    if (row && Array.isArray(row.parts_json)) {
      return row.parts_json as SelectedPart[];
    }
  } catch {
    // Supabase unavailable — return empty array.
  }
  return [];
}

/** Reads `inspection_json` from the Supabase work_orders row; returns null on any failure. */
async function fetchInspectionJson(workOrderId: string): Promise<MpiData | null> {
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("work_orders")
      .select("inspection_json")
      .eq("id", workOrderId)
      .single();

    const raw = asRecord(data)?.inspection_json;
    if (raw && typeof raw === "object") {
      return raw as MpiData;
    }
  } catch {
    // Supabase unavailable — return null.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server Action — getPortalData
// ---------------------------------------------------------------------------

/**
 * Verifies the approval token and returns all data needed to render the
 * customer portal. No authentication is required; the token is the proof.
 */
export async function getPortalData(
  token: string,
): Promise<{ data: PortalData } | { error: string }> {
  if (!token) {
    return { error: "Invalid or expired approval link." };
  }

  let workOrder: {
    id: string;
    title: string;
    status: string;
    laborCents: number;
    partsCents: number;
    vehicle: {
      make: string | null;
      model: string | null;
      year: number | null;
      color: string | null;
      mileageIn: number | null;
      client: { firstName: string; lastName: string };
    };
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { approvalToken: token },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            color: true,
            mileageIn: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  } catch {
    // Database unavailable.
  }

  if (!workOrder) {
    return { error: "Invalid or expired approval link." };
  }

  const [parts, mpi] = await Promise.all([
    fetchPartsJson(workOrder.id),
    fetchInspectionJson(workOrder.id),
  ]);

  const subtotalCents = workOrder.laborCents + workOrder.partsCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  return {
    data: {
      workOrderId: workOrder.id,
      title: workOrder.title,
      status: workOrder.status,
      laborCents: workOrder.laborCents,
      partsCents: workOrder.partsCents,
      taxCents,
      totalCents,
      parts,
      mpi,
      client: workOrder.vehicle.client,
      vehicle: {
        make: workOrder.vehicle.make ?? "",
        model: workOrder.vehicle.model ?? "",
        year: workOrder.vehicle.year ?? 0,
        color: workOrder.vehicle.color,
        mileageIn: workOrder.vehicle.mileageIn,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Server Action — approveQuote
// ---------------------------------------------------------------------------

/**
 * Records the customer's digital signature and marks the work order as COMPLETE.
 *
 * Steps:
 *   1. Validates the token and current status (must be PENDING_APPROVAL).
 *   2. Uploads the signature PNG to Supabase Storage (`signatures` bucket).
 *   3. Transitions the WorkOrder status to COMPLETE via Prisma.
 *   4. Mirrors the status update to the Supabase work_orders row (best-effort).
 */
export async function approveQuote(
  token: string,
  signatureDataUrl: string,
): Promise<{ success: true } | { error: string }> {
  if (!token) {
    return { error: "Invalid approval link." };
  }

  if (
    !signatureDataUrl ||
    !signatureDataUrl.startsWith("data:image/png;base64,")
  ) {
    return { error: "A valid signature is required." };
  }

  // --- Validate token and current status -----------------------------------
  let workOrderId: string | null = null;
  let currentStatus: string | null = null;

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { approvalToken: token },
      select: { id: true, status: true },
    });
    if (workOrder) {
      workOrderId = workOrder.id;
      currentStatus = workOrder.status;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  if (!workOrderId) {
    return { error: "Invalid or expired approval link." };
  }

  // Idempotent: already approved.
  if (currentStatus === "COMPLETE") {
    return { success: true };
  }

  if (currentStatus !== "PENDING_APPROVAL") {
    return { error: "This quote is not awaiting approval." };
  }

  // --- Upload signature to Supabase Storage --------------------------------
  try {
    const adminDb = createAdminClient();

    // Convert base64 data URL to a Buffer for upload.
    const base64Data = signatureDataUrl.replace(
      /^data:image\/png;base64,/,
      "",
    );
    const buffer = Buffer.from(base64Data, "base64");
    const filePath = `${workOrderId}/signature.png`;

    await adminDb.storage
      .from("signatures")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });
  } catch {
    // Non-fatal — proceed even if storage upload fails.
    // The signature data URL will still be saved via the status transition.
  }

  // --- Transition to COMPLETE via Prisma -----------------------------------
  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: "COMPLETE" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to record approval: ${message}` };
  }

  // --- Mirror to Supabase work_orders (best-effort) ------------------------
  try {
    const adminDb = createAdminClient();
    await adminDb
      .from("work_orders")
      .update({ status: "COMPLETE" })
      .eq("id", workOrderId);
  } catch {
    // Non-fatal.
  }

  revalidatePath("/jobs");
  return { success: true };
}

// ---------------------------------------------------------------------------
// getSupplementalPortalData — for change-order portal (deltaApprovalToken)
// ---------------------------------------------------------------------------

export interface SupplementalPortalData {
  workOrderId: string;
  approvalToken: string;
  originalContract: {
    title: string;
    laborCents: number;
    partsCents: number;
    taxCents: number;
    totalCents: number;
    signedAt?: string;
  };
  deltaParts: Array<{
    id: string;
    name: string;
    partNumber: string;
    retailPriceCents: number;
    quantity: number;
  }>;
  deltaLaborCents: number;
}

/**
 * Looks up work order by deltaApprovalToken (change-order link).
 * Returns data needed to render SupplementalChangeOrder.
 */
export async function getSupplementalPortalData(
  token: string,
): Promise<{ data: SupplementalPortalData } | { error: string }> {
  if (!token) return { error: "Invalid or expired link." };

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { deltaApprovalToken: token, status: "BLOCKED_WAITING_APPROVAL" },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        deltaPartsJson: true,
        vehicle: {
          select: { client: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (!workOrder) return { error: "Invalid or expired change-order link." };

    const laborCents = workOrder.laborCents;
    const partsCents = workOrder.partsCents;
    const subtotalCents = laborCents + partsCents;
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;

    const rawDelta = workOrder.deltaPartsJson as
      | { parts?: Array<{ partId?: string; name: string; partNumber: string; retailPriceCents: number; quantity: number }>; laborAdditions?: Array<{ hours: number; rateCents: number }> }
      | null
      | unknown;
    const partsArray = rawDelta && typeof rawDelta === "object" && Array.isArray((rawDelta as { parts?: unknown }).parts)
      ? (rawDelta as { parts: Array<{ partId?: string; name: string; partNumber: string; retailPriceCents: number; quantity: number }> }).parts
      : Array.isArray(workOrder.deltaPartsJson)
        ? (workOrder.deltaPartsJson as Array<{ partId?: string; name: string; partNumber: string; retailPriceCents: number; quantity: number }>)
        : [];
    const deltaParts = partsArray.map((p, i) => ({
      id: p.partId ?? `p-${i}`,
      name: p.name ?? "",
      partNumber: p.partNumber ?? "",
      retailPriceCents: p.retailPriceCents ?? 0,
      quantity: p.quantity ?? 1,
    }));
    const laborAdditions = rawDelta && typeof rawDelta === "object" && Array.isArray((rawDelta as { laborAdditions?: unknown }).laborAdditions)
      ? (rawDelta as { laborAdditions: Array<{ hours: number; rateCents: number }> }).laborAdditions
      : [];
    const deltaLaborCents = Math.round(
      laborAdditions.reduce((s, a) => s + a.hours * a.rateCents, 0),
    );

    return {
      data: {
        workOrderId: workOrder.id,
        approvalToken: token,
        originalContract: {
          title: workOrder.title,
          laborCents,
          partsCents,
          taxCents,
          totalCents,
        },
        deltaParts,
        deltaLaborCents,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load change order.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// approveChangeOrder — record client signature and unblock work order
// ---------------------------------------------------------------------------

/**
 * Validates deltaApprovalToken and BLOCKED_WAITING_APPROVAL status,
 * uploads signature to Supabase Storage, sets status to PENDING_APPROVAL,
 * and clears deltaApprovalToken.
 */
export async function approveChangeOrder(
  workOrderId: string,
  deltaApprovalToken: string,
  signatureDataUrl: string,
): Promise<{ success: true } | { error: string }> {
  if (
    !signatureDataUrl ||
    !signatureDataUrl.startsWith("data:image/png;base64,")
  ) {
    return { error: "A valid signature is required." };
  }

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        deltaApprovalToken,
        status: "BLOCKED_WAITING_APPROVAL",
      },
      select: { id: true },
    });

    if (!workOrder) {
      return { error: "Invalid or expired change-order link." };
    }

    const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const filePath = `${workOrderId}/change-order-signature.png`;

    try {
      const adminDb = createAdminClient();
      await adminDb.storage.from("signatures").upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });
    } catch {
      // Non-fatal.
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "PENDING_APPROVAL",
        deltaApprovalToken: null,
      },
    });

    try {
      const adminDb = createAdminClient();
      await adminDb
        .from("work_orders")
        .update({
          status: "PENDING_APPROVAL",
          delta_approval_token: null,
        })
        .eq("id", workOrderId);
    } catch {
      // Non-fatal.
    }

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record approval.";
    return { error: message };
  }
}
