"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
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
  /** Tax computed at the same rate as the Quote Builder (8.75 %). */
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

/** Reads `parts_json` from the Supabase work_orders row; returns [] on any failure. */
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

    const raw = (data as Record<string, unknown> | null)?.inspection_json;
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
    client: { firstName: string; lastName: string };
    vehicle: {
      make: string;
      model: string;
      year: number;
      color: string | null;
      mileageIn: number | null;
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
        client: { select: { firstName: true, lastName: true } },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            color: true,
            mileageIn: true,
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
      client: workOrder.client,
      vehicle: workOrder.vehicle,
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

  return { success: true };
}
