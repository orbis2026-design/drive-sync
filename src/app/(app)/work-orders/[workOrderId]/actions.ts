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
  notes: string | null;
  scheduledAt: string | null;
  hasDamageFlag: boolean;
  assignedTechId: string | null;
  createdAt: string;
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
        ...(roleRow.role === "FIELD_TECH"
          ? { assignedTechId: userId }
          : {}),
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
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!workOrder) {
      return { error: "Work order not found or access denied." };
    }

    // Load related documents separately (WorkOrder has no typed relation in this client).
    const rawDocuments = await prisma.workOrderDocument.findMany({
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
    });

    const documents = rawDocuments.map((doc) => {
      const meta = doc.metadataJson as { publicUrl?: string } | null;
      return {
        id: doc.id,
        type: doc.type,
        filename: doc.filename,
        bucket: doc.bucket,
        storageKey: doc.storageKey,
        publicUrl: meta?.publicUrl ?? null,
        createdAt: doc.createdAt.toISOString(),
      };
    });

    // Load linked expenses from Supabase (best-effort).
    let expenses: {
      id: string;
      amount: number;
      vendor: string;
      category: string;
      createdAt: string;
    }[] = [];

    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("expenses")
        .select("id, amount, vendor, category, created_at")
        .eq("tenant_id", roleRow.tenantId)
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false });

      if (Array.isArray(data)) {
        expenses = data.map((row: any) => ({
          id: row.id as string,
          amount: typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0),
          vendor: row.vendor as string,
          category: row.category as string,
          createdAt: new Date(row.created_at as string).toISOString(),
        }));
      }
    } catch {
      expenses = [];
    }

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
        documents,
        expenses,
        vehicle: {
          id: workOrder.vehicle.id,
          make: workOrder.vehicle.make,
          model: workOrder.vehicle.model,
          year: workOrder.vehicle.year,
          vin: workOrder.vehicle.vin,
          client: {
            id: workOrder.vehicle.client.id,
            firstName: workOrder.vehicle.client.firstName,
            lastName: workOrder.vehicle.client.lastName,
            email: workOrder.vehicle.client.email,
            phone: workOrder.vehicle.client.phone,
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
    revalidateTag("jobs");
    revalidateTag("requests");
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
    revalidateTag("jobs");
    revalidateTag("requests");
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
    revalidateTag("jobs");
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
