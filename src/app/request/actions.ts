"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntakePayload = {
  tenantId: string;
  // Step 1 — Vehicle
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  // Step 2 — Client info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // Step 3 — 3 Cs
  complaint: string;
  cause: string;
  correction: string;
  // Step 4 — Photo (Supabase Storage path, already uploaded)
  photoPath: string | null;
};

// ---------------------------------------------------------------------------
// submitIntakeRequest
// ---------------------------------------------------------------------------

/**
 * Creates a new WorkOrder with status REQUESTED from the self-service intake
 * wizard. Also triggers a basic in-app notification via the work_orders table
 * row (the dashboard polls for REQUESTED status).
 */
export async function submitIntakeRequest(
  payload: IntakePayload,
): Promise<{ success: true; workOrderId: string } | { error: string }> {
  if (
    !payload.tenantId ||
    !payload.firstName ||
    !payload.lastName ||
    !payload.phone ||
    !payload.complaint
  ) {
    return { error: "Missing required fields." };
  }

  // Build the photo URL from Supabase Storage public URL if path supplied.
  let intakePhotoUrl: string | null = null;
  if (payload.photoPath) {
    try {
      const adminDb = createAdminClient();
      const { data } = adminDb.storage
        .from("intake-photos")
        .getPublicUrl(payload.photoPath);
      intakePhotoUrl = data.publicUrl;
    } catch {
      // Non-fatal — proceed without photo URL.
    }
  }

  try {
    // Upsert the client first.
    const existingClient = await prisma.client.findFirst({
      where: { tenantId: payload.tenantId, phone: payload.phone },
      select: { id: true },
    });

    let clientId: string;
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const newClient = await prisma.client.create({
        data: {
          tenantId: payload.tenantId,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email || undefined,
          phone: payload.phone,
        },
        select: { id: true },
      });
      clientId = newClient.id;
    }

    // Create a minimal Vehicle record.
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: payload.tenantId,
        clientId,
        make: payload.make || "Unknown",
        model: payload.model || "Unknown",
        year: payload.year || new Date().getFullYear(),
        vin: payload.vin || undefined,
        plate: payload.plate || undefined,
      },
      select: { id: true },
    });

    // Build the title from complaint.
    const title = payload.complaint.slice(0, 80);
    const description = [
      `Complaint: ${payload.complaint}`,
      payload.cause ? `Cause: ${payload.cause}` : null,
      payload.correction ? `Correction: ${payload.correction}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Create the WorkOrder with REQUESTED status.
    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: payload.tenantId,
        clientId,
        vehicleId: vehicle.id,
        status: "REQUESTED",
        title,
        description,
        notes: intakePhotoUrl ? `Intake photo: ${intakePhotoUrl}` : undefined,
      },
      select: { id: true },
    });

    // Mirror to Supabase (best-effort) so the dashboard can receive the
    // real-time push notification via Supabase Realtime subscriptions.
    try {
      const adminDb = createAdminClient();
      await adminDb.from("work_orders").insert({
        id: workOrder.id,
        tenant_id: payload.tenantId,
        status: "REQUESTED",
        title,
        description,
        notes: intakePhotoUrl ? `Intake photo: ${intakePhotoUrl}` : null,
        intake_photo_url: intakePhotoUrl,
      });
    } catch {
      // Non-fatal.
    }

    return { success: true, workOrderId: workOrder.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// getUploadUrl — returns a signed upload URL for the intake photo bucket
// ---------------------------------------------------------------------------

export async function getPhotoUploadUrl(
  tenantId: string,
  fileName: string,
): Promise<{ uploadUrl: string; path: string } | { error: string }> {
  if (!tenantId || !fileName) {
    return { error: "Missing required parameters." };
  }

  try {
    const adminDb = createAdminClient();
    const path = `${tenantId}/${Date.now()}-${fileName}`;
    const { data, error } = await adminDb.storage
      .from("intake-photos")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return { error: error?.message ?? "Failed to create upload URL." };
    }

    return { uploadUrl: data.signedUrl, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage error.";
    return { error: message };
  }
}
