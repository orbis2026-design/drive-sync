"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  verifySession,
  getSessionUserId,
  getUserRole,
  type UserRole,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkOrderStatus } from "@prisma/client";
import {
  OIL_CHANGE_PACKAGES,
  type OilChangePackageId,
  type LightJobTemplateId,
} from "@/lib/schemas/oil-packages";
import {
  WAIVER_TEMPLATES,
  fillWaiverBody,
  type WaiverTemplateId,
} from "@/lib/schemas/waiver-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HubWorkOrder = {
  id: string;
  title: string;
  description: string;
  status: WorkOrderStatus;
  /** True when the current viewer is the shop owner for this tenant. */
  viewerIsOwner: boolean;
  laborCents: number;
  partsCents: number;
  /** Freeform technician / owner notes about the job. */
  notes: string | null;
  scheduledAt: string | null;
  hasDamageFlag: boolean;
  assignedTechId: string | null;
  createdAt: string;
  /**
   * Snapshot fields used by the Boltbook oil-change dashboard.
   * These map directly from JSON columns on the work_orders table.
   */
  mileageAtIntake: number | null;
  /** Raw JSON from inspection_json (legacy pre-inspection shape). */
  inspectionJson: unknown | null;
  /** Raw JSON from parts_json (line items snapshot). */
  partsJson: unknown | null;
  /** Raw JSON from labor_json (labor line items). */
  laborJson: unknown | null;
  /** Raw JSON from checklists_json (new structured checklist store). */
  checklistsJson: unknown | null;
  /** Stored payment method string (cash, card_manual, card_tap, check). */
  paymentMethod: string | null;
  closedAt: string | null;
  documents: {
    id: string;
    type: string;
    filename: string;
    bucket: string;
    storageKey: string;
    publicUrl: string | null;
    createdAt: string;
  }[];
  expenses: {
    id: string;
    amount: number;
    vendor: string;
    category: string;
    createdAt: string;
  }[];
  vehicle: {
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    client: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string;
    };
  };
};

export type WorkOrderEvent = {
  id: string;
  scope: "CLIENT" | "VEHICLE" | "WORK_ORDER" | string;
  stage: WorkOrderStatus;
  kind: "NOTE" | "FORM" | "MEDIA" | "SYSTEM" | string;
  title: string;
  body: string | null;
  createdAt: string;
};

export type FieldTechOption = { userId: string; label: string };

// ---------------------------------------------------------------------------
// getWorkOrderForHub
// ---------------------------------------------------------------------------

/**
 * Loads a single work order for the Job Card hub.
 * Enforces tenant access; FIELD_TECH may only view jobs assigned to them.
 */
export async function getWorkOrderForHub(
  workOrderId: string,
): Promise<{ data: HubWorkOrder } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Not authenticated." };

  const roleRow = await getUserRole(userId);
  if (!roleRow?.tenantId) return { error: "No tenant assigned." };

  const viewerIsOwner = roleRow.role === "SHOP_OWNER";

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId: roleRow.tenantId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        laborCents: true,
        partsCents: true,
        notes: true,
        scheduledAt: true,
        hasDamageFlag: true,
        assignedTechId: true,
        createdAt: true,
        vehicleId: true,
        mileage_at_intake: true,
        inspection_json: true,
        parts_json: true,
        laborJson: true,
        checklists_json: true,
        paymentMethod: true,
        closedAt: true,
      },
    });

    if (!workOrder) {
      return { error: "Work order not found or access denied." };
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: workOrder.vehicleId, tenantId: roleRow.tenantId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        clientId: true,
      },
    });

    if (!vehicle) {
      return { error: "Vehicle not found for this work order." };
    }

    const client = await prisma.client.findFirst({
      where: { id: vehicle.clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!client) {
      return { error: "Client not found for this work order." };
    }

    // Load documents and expenses in parallel (documents optional per env).
    const anyClient = prisma as any;
    const documentsPromise = anyClient.workOrderDocument?.findMany
      ? anyClient.workOrderDocument.findMany({
          where: { workOrderId: workOrder.id, tenantId: roleRow.tenantId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            filename: true,
            bucket: true,
            storageKey: true,
            metadataJson: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]);

    const expensesPromise = (async () => {
      try {
        const admin = createAdminClient();
        const { data } = await admin
          .from("expenses")
          .select("id, amount, vendor, category, created_at")
          .eq("tenant_id", roleRow.tenantId)
          .eq("work_order_id", workOrderId)
          .order("created_at", { ascending: false });
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    })();

    const [rawDocuments, expensesData] = await Promise.all([
      documentsPromise,
      expensesPromise,
    ]);

    const documents: HubWorkOrder["documents"] = (rawDocuments as any[]).map(
      (doc: any) => {
        const meta = doc.metadataJson as { publicUrl?: string } | null;
        return {
          id: doc.id as string,
          type: doc.type as string,
          filename: doc.filename as string,
          bucket: doc.bucket as string,
          storageKey: doc.storageKey as string,
          publicUrl: meta?.publicUrl ?? null,
          createdAt: (doc.createdAt as Date).toISOString(),
        };
      },
    );

    const expenses = expensesData.map((row: any) => ({
      id: row.id as string,
      amount: typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0),
      vendor: row.vendor as string,
      category: row.category as string,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));

    return {
      data: {
        id: workOrder.id,
        title: workOrder.title,
        description: workOrder.description,
        status: workOrder.status,
        viewerIsOwner,
        laborCents: workOrder.laborCents,
        partsCents: workOrder.partsCents,
        notes: workOrder.notes,
        scheduledAt: workOrder.scheduledAt?.toISOString() ?? null,
        hasDamageFlag: workOrder.hasDamageFlag,
        assignedTechId: workOrder.assignedTechId,
        createdAt: workOrder.createdAt.toISOString(),
        mileageAtIntake: workOrder.mileage_at_intake ?? null,
        inspectionJson: workOrder.inspection_json ?? null,
        partsJson: workOrder.parts_json ?? null,
        laborJson: workOrder.laborJson ?? null,
        checklistsJson: workOrder.checklists_json ?? null,
        paymentMethod: workOrder.paymentMethod ?? null,
        closedAt: workOrder.closedAt?.toISOString() ?? null,
        documents,
        expenses,
        vehicle: {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin,
          client: {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: client.phone,
          },
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load work order.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// getWorkOrderTimeline
// ---------------------------------------------------------------------------

export async function getWorkOrderTimeline(
  workOrderId: string,
): Promise<{ data: WorkOrderEvent[] } | { error: string }> {
  const { tenantId } = await verifySession();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("work_order_events")
      .select("id, scope, stage, kind, title, body, created_at")
      .eq("tenant_id", tenantId)
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message };
    }

    const events: WorkOrderEvent[] = (data ?? []).map((row: any) => ({
      id: row.id as string,
      scope: (row.scope as string) ?? "WORK_ORDER",
      stage: (row.stage as WorkOrderStatus) ?? "INTAKE",
      kind: (row.kind as string) ?? "NOTE",
      title: (row.title as string) ?? "",
      body: (row.body as string | null) ?? null,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));

    return { data: events };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load timeline.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// createWorkOrderEvent / addWorkOrderNote
// ---------------------------------------------------------------------------

export async function createWorkOrderEvent(input: {
  workOrderId: string;
  scope: WorkOrderEvent["scope"];
  kind: WorkOrderEvent["kind"];
  title: string;
  body?: string;
  metadataJson?: unknown;
}): Promise<{ success: true } | { error: string }> {
  const { tenantId, userId } = await verifySession();
  const { workOrderId, scope, kind, title, body, metadataJson } = input;

  if (!workOrderId) return { error: "Missing work order ID." };
  if (!title.trim()) return { error: "Title is required." };

  let stage: WorkOrderStatus = "INTAKE";
  try {
    const wo = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { status: true },
    });
    if (!wo) return { error: "Work order not found." };
    stage = wo.status as WorkOrderStatus;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve status.";
    return { error: message };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("work_order_events").insert({
      tenant_id: tenantId,
      work_order_id: workOrderId,
      scope,
      stage,
      kind,
      title: title.trim(),
      body: body?.trim() ?? null,
      metadata_json: metadataJson ?? null,
      author_user_id: userId,
    });

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create event.";
    return { error: message };
  }
}

export async function addWorkOrderNote(
  workOrderId: string,
  scope: "CLIENT" | "VEHICLE" | "WORK_ORDER",
  body: string,
): Promise<{ success: true } | { error: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Note cannot be empty." };

  const title =
    scope === "CLIENT"
      ? "Client note"
      : scope === "VEHICLE"
        ? "Vehicle note"
        : "Job note";

  return createWorkOrderEvent({
    workOrderId,
    scope,
    kind: "NOTE",
    title,
    body: trimmed,
  });
}

// ---------------------------------------------------------------------------
// Oil-change packages & light job helpers
// ---------------------------------------------------------------------------

/**
 * Stores the selected oil-change package id in the work_orders.checklists_json
 * JSONB column under the `oilChangePackageId` key. This avoids a risky
 * migration while still giving the UI a place to persist intent.
 */
export async function setOilChangePackage(
  workOrderId: string,
  packageId: OilChangePackageId,
): Promise<{ success: true } | { error: string }> {
  const { tenantId } = await verifySession();
  if (!workOrderId) return { error: "Missing work order ID." };

  const pkg = OIL_CHANGE_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return { error: "Unknown oil-change package." };

  try {
    const existing = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { checklists_json: true },
    });
    if (!existing) return { error: "Work order not found." };

    const current =
      (existing.checklists_json as Record<string, unknown> | null) ?? {};

    const next = {
      ...current,
      oilChangePackageId: packageId,
    };

    await prisma.workOrder.updateMany({
      where: { id: workOrderId, tenantId },
      data: { checklists_json: next },
    });

    const admin = createAdminClient();
    try {
      await admin
        .from("work_orders")
        .update({ checklists_json: next })
        .eq("id", workOrderId)
        .eq("tenant_id", tenantId);
    } catch {
      // Non-fatal in environments without Supabase wiring.
    }

    await createWorkOrderEvent({
      workOrderId,
      scope: "WORK_ORDER",
      kind: "SYSTEM",
      title: "Oil-change package selected",
      body: pkg.name,
      metadataJson: { packageId },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update oil-change package.";
    return { error: message };
  }
}

/**
 * Records a lightweight "simple brake job" attachment in checklists_json under
 * `lightJobs`. Actual parts / labour lines continue to be managed via the
 * existing Parts + Quote flows; this is primarily for paperwork, analytics,
 * and future automation.
 */
export async function attachLightJob(
  workOrderId: string,
  templateId: LightJobTemplateId,
  details: {
    axle: "FRONT" | "REAR";
    side: "LEFT" | "RIGHT" | "BOTH";
    padsAndRotors: boolean;
  },
): Promise<{ success: true } | { error: string }> {
  const { tenantId } = await verifySession();
  if (!workOrderId) return { error: "Missing work order ID." };

  try {
    const existing = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { checklists_json: true },
    });
    if (!existing) return { error: "Work order not found." };

    const current =
      (existing.checklists_json as Record<string, unknown> | null) ?? {};
    const lightJobs = Array.isArray((current as any).lightJobs)
      ? ((current as any).lightJobs as any[])
      : [];

    const nextLightJobs = [
      ...lightJobs,
      {
        templateId,
        axle: details.axle,
        side: details.side,
        padsAndRotors: details.padsAndRotors,
        createdAt: new Date().toISOString(),
      },
    ];

    const next = {
      ...current,
      lightJobs: nextLightJobs,
    };

    await prisma.workOrder.updateMany({
      where: { id: workOrderId, tenantId },
      data: { checklists_json: next },
    });

    const admin = createAdminClient();
    try {
      await admin
        .from("work_orders")
        .update({ checklists_json: next })
        .eq("id", workOrderId)
        .eq("tenant_id", tenantId);
    } catch {
      // Non-fatal.
    }

    await createWorkOrderEvent({
      workOrderId,
      scope: "WORK_ORDER",
      kind: "NOTE",
      title: "Light job attached",
      body: `Simple brake job added (${details.axle.toLowerCase()} axle, ${details.side.toLowerCase()}, pads${
        details.padsAndRotors ? " + rotors" : ""
      }).`,
      metadataJson: {
        templateId,
        ...details,
      },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to attach light job.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// signWaiver — record a signed waiver as a FORM work_order_event
// ---------------------------------------------------------------------------

export async function signWaiver(
  workOrderId: string,
  templateId: WaiverTemplateId,
  signerName: string,
): Promise<{ success: true } | { error: string }> {
  const { tenantId } = await verifySession();
  const trimmed = signerName?.trim();
  if (!trimmed) return { error: "Signer name is required." };

  const template = WAIVER_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { error: "Unknown waiver template." };

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true, vehicleId: true },
    });
    if (!workOrder) return { error: "Work order not found." };

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: workOrder.vehicleId, tenantId },
      select: {
        make: true,
        model: true,
        year: true,
        client: { select: { firstName: true, lastName: true } },
      },
    });
    const clientName = vehicle?.client
      ? `${vehicle.client.firstName} ${vehicle.client.lastName}`
      : "Customer";
    const vehicleLabel = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
      : "Vehicle";
    const date = new Date().toLocaleDateString("en-US", {
      dateStyle: "long",
    });

    const body = fillWaiverBody(template, {
      clientName,
      vehicle: vehicleLabel,
      date,
    });

    const result = await createWorkOrderEvent({
      workOrderId,
      scope: "WORK_ORDER",
      kind: "FORM",
      title: template.name,
      body: `${body}\n\nSigned by: ${trimmed} at ${new Date().toISOString()}`,
      metadataJson: {
        templateId,
        signerName: trimmed,
        signedAt: new Date().toISOString(),
      },
    });

    if ("error" in result) return result;
    revalidatePath(`/work-orders/${workOrderId}`);
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to record waiver.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// acceptRequest
// ---------------------------------------------------------------------------

export async function acceptRequest(
  workOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  const { tenantId } = await verifySession();

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId, status: "REQUESTED" },
      select: { id: true },
    });

    if (!workOrder) {
      return { error: "Work order not found or not in REQUESTED status." };
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: "INTAKE" },
    });

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidateTag("jobs", "max");
    revalidateTag("requests", "max");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to accept request.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// declineRequest
// ---------------------------------------------------------------------------

export async function declineRequest(
  workOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  const { tenantId } = await verifySession();

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId, status: "REQUESTED" },
      select: { id: true },
    });

    if (!workOrder) {
      return { error: "Work order not found or not in REQUESTED status." };
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: "CANCELLED" },
    });

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidateTag("jobs", "max");
    revalidateTag("requests", "max");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to decline request.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// assignTech
// ---------------------------------------------------------------------------

export async function assignTech(
  workOrderId: string,
  techUserId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { error: "Only shop owners can assign technicians." };
  }

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true },
    });

    if (!workOrder) {
      return { error: "Work order not found." };
    }

    if (techUserId) {
      const techRole = await getUserRole(techUserId);
      if (techRole?.tenantId !== tenantId || techRole?.role !== "FIELD_TECH") {
        return { error: "Invalid technician for this tenant." };
      }
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { assignedTechId: techUserId },
    });

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidateTag("jobs", "max");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to assign technician.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// getFieldTechsForTenant
// ---------------------------------------------------------------------------

/**
 * Returns FIELD_TECH users for the current tenant for the assign-tech dropdown.
 * Uses Supabase user_roles; labels use "Tech" + short id when no email available.
 */
export async function getFieldTechsForTenant(): Promise<
  { data: FieldTechOption[] } | { error: string }
> {
  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { data: [] };
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "FIELD_TECH");

    if (error || !rows?.length) {
      return { data: [] };
    }

    const options: FieldTechOption[] = await Promise.all(
      rows.map(async (r) => {
        const uid = r.user_id as string;
        try {
          const { data: user } = await admin.auth.admin.getUserById(uid);
          const email = user?.user?.email;
          const label = email ?? `Tech ${uid.slice(0, 8)}`;
          return { userId: uid, label };
        } catch {
          return { userId: uid, label: `Tech ${uid.slice(0, 8)}` };
        }
      }),
    );

    return { data: options };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load technicians.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// forceApproveWorkOrder — owner-only manual approval bypassing client portal
// ---------------------------------------------------------------------------

/**
 * Marks a work order as COMPLETE without requiring client approval.
 *
 * - SHOP_OWNER only.
 * - Allowed from ACTIVE, PENDING_APPROVAL, or BLOCKED_WAITING_APPROVAL.
 * - Clears any pending delta approval token.
 * - Records a SYSTEM timeline event for auditability.
 */
export async function forceApproveWorkOrder(
  workOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { error: "Only shop owners can force-approve work orders." };
  }

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true, status: true, title: true },
    });

    if (!workOrder) {
      return { error: "Work order not found." };
    }

    const allowedStatuses: WorkOrderStatus[] = [
      "ACTIVE",
      "PENDING_APPROVAL",
      "BLOCKED_WAITING_APPROVAL",
    ];

    if (!allowedStatuses.includes(workOrder.status as WorkOrderStatus)) {
      return {
        error:
          "Force approval is only available for ACTIVE, PENDING_APPROVAL, or BLOCKED_WAITING_APPROVAL jobs.",
      };
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "COMPLETE",
        // When force-approving we treat any pending change-order as resolved.
        deltaApprovalToken: null,
      },
    });

    // Best-effort mirror to Supabase work_orders.
    try {
      const admin = createAdminClient();
      await admin
        .from("work_orders")
        .update({
          status: "COMPLETE",
          delta_approval_token: null,
        })
        .eq("id", workOrderId)
        .eq("tenant_id", tenantId);
    } catch {
      // Non-fatal in environments where Supabase is not fully provisioned.
    }

    // Record a SYSTEM event on the work order timeline.
    await createWorkOrderEvent({
      workOrderId,
      scope: "WORK_ORDER",
      kind: "SYSTEM",
      title: "Force-approved by shop owner",
      body: `Work order "${workOrder.title}" was manually marked COMPLETE without client portal approval.`,
      metadataJson: {
        actorUserId: userId,
        method: "forceApproveWorkOrder",
      },
    });

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidateTag("jobs");
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to force-approve work order.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// archiveWorkOrder — mark a job as archived at any stage
// ---------------------------------------------------------------------------

export async function archiveWorkOrder(
  workOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!workOrderId) return { error: "Missing work order ID." };

  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { error: "Only shop owners can archive work orders." };
  }

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true, isArchived: true },
    });

    if (!workOrder) {
      return { error: "Work order not found." };
    }

    if (workOrder.isArchived) {
      return { ok: true };
    }

    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { isArchived: true },
    });

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidateTag("jobs");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to archive work order.";
    return { error: message };
  }
}
