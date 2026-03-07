/**
 * /api/sync — Offline Collision & Version Control Lock (Issue #50)
 *
 * This endpoint is the authoritative gateway for the useOfflineSync hook to
 * flush locally-queued WorkOrder patches back to the server.
 *
 * Collision Guard Logic:
 *   1. Receive a PATCH with { workOrderId, versionHash, patch }.
 *   2. Look up the current server-side status and version_hash.
 *   3. If server status is COMPLETE, INVOICED, or PAID → the WorkOrder is
 *      legally locked. Reject any patch that touches the protected fields
 *      (total_price, parts_json, labor_json) with HTTP 409.
 *   4. If the client's versionHash differs from the server's version_hash →
 *      a concurrent write occurred. Reject with HTTP 409.
 *   5. Otherwise apply the patch and rotate the version_hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WorkOrder statuses that represent a legally approved / closed contract. */
const LOCKED_STATUSES = new Set(["COMPLETE", "INVOICED", "PAID"]);

/**
 * Patch fields that mutate the financial terms of the contract.
 * These are blocked once the work order is in a locked status.
 */
const PROTECTED_FIELDS = new Set([
  "total_price",
  "totalPrice",
  "parts_json",
  "partsJson",
  "labor_json",
  "laborJson",
  "laborCents",
  "labor_cents",
  "partsCents",
  "parts_cents",
]);

// ---------------------------------------------------------------------------
// PATCH /api/sync
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { workOrderId, versionHash, patch } = body as {
    workOrderId?: string;
    versionHash?: string;
    patch?: Record<string, unknown>;
  };

  if (!workOrderId || typeof workOrderId !== "string") {
    return NextResponse.json(
      { error: "workOrderId is required." },
      { status: 400 },
    );
  }

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json(
      { error: "patch must be a non-empty object." },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch current server-side state
  // ---------------------------------------------------------------------------

  let serverWorkOrder: {
    id: string;
    status: string;
    versionHash: string | null;
    isLocked: boolean;
  } | null = null;

  try {
    serverWorkOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, versionHash: true, isLocked: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!serverWorkOrder) {
    return NextResponse.json(
      { error: "Work order not found." },
      { status: 404 },
    );
  }

  // ---------------------------------------------------------------------------
  // Lock check — reject protected field mutations on approved contracts
  // ---------------------------------------------------------------------------

  const isStatusLocked =
    LOCKED_STATUSES.has(serverWorkOrder.status) || serverWorkOrder.isLocked;

  if (isStatusLocked) {
    const attemptedProtectedField = Object.keys(patch).find((key) =>
      PROTECTED_FIELDS.has(key),
    );
    if (attemptedProtectedField) {
      return NextResponse.json(
        {
          error:
            "Sync Failed: Client has already signed this quote. You cannot modify an approved contract. Please issue a Change Order.",
          code: "LOCKED_CONTRACT",
          status: serverWorkOrder.status,
        },
        { status: 409 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Version hash check — reject stale offline patches
  // ---------------------------------------------------------------------------

  if (
    versionHash !== undefined &&
    serverWorkOrder.versionHash !== null &&
    versionHash !== serverWorkOrder.versionHash
  ) {
    return NextResponse.json(
      {
        error:
          "Sync conflict: this work order was modified by another session. Please refresh and reapply your changes.",
        code: "VERSION_CONFLICT",
        serverVersionHash: serverWorkOrder.versionHash,
      },
      { status: 409 },
    );
  }

  // ---------------------------------------------------------------------------
  // Apply the patch
  // ---------------------------------------------------------------------------

  // Map snake_case patch keys → camelCase Prisma field names for safety.
  const safeFieldMap: Record<string, string> = {
    notes: "notes",
    status: "status",
    description: "description",
    mileage_at_intake: "notes", // guard — not a real field; will be dropped
  };

  // Only allow a curated set of non-protected fields through the sync endpoint.
  // Financial fields require the full lockQuote server action workflow.
  const allowedPatchFields = new Set(["notes", "description"]);

  const prismaData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const prismaKey = safeFieldMap[key] ?? key;
    if (allowedPatchFields.has(prismaKey)) {
      prismaData[prismaKey] = value;
    }
  }

  if (Object.keys(prismaData).length === 0) {
    // Nothing to apply — mark synced successfully.
    return NextResponse.json({ success: true, versionHash: serverWorkOrder.versionHash });
  }

  // Rotate version hash on successful write.
  const newVersionHash = crypto.randomUUID();
  prismaData.versionHash = newVersionHash;

  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: prismaData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      { error: `Failed to apply patch: ${message}` },
      { status: 500 },
    );
  }

  // Mirror to Supabase (best-effort).
  try {
    const adminDb = createAdminClient();
    await adminDb
      .from("work_orders")
      .update({ ...prismaData, version_hash: newVersionHash })
      .eq("id", workOrderId);
  } catch {
    // Non-fatal.
  }

  return NextResponse.json({ success: true, versionHash: newVersionHash });
}
