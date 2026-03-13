"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { verifySession } from "@/lib/auth";
import { renderContractPdf } from "@/lib/pdf-renderer";
import { sendContractEmail } from "@/lib/email";
import { createWorkOrderEvent } from "@/app/(app)/work-orders/[workOrderId]/actions";

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

  let workOrder:
    | {
        id: string;
        title: string;
        status: string;
        laborCents: number;
        partsCents: number;
        closedAt: Date | null;
        paymentMethod: string | null;
        vehicleId: string;
      }
    | null = null;

  try {
    workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        laborCents: true,
        partsCents: true,
        closedAt: true,
        paymentMethod: true,
        vehicleId: true,
      },
    });
  } catch {
    // Database unavailable in demo — fall through to error below.
  }

  if (!workOrder) {
    return { error: "Work order not found." };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: workOrder.vehicleId, tenantId },
    select: {
      make: true,
      model: true,
      year: true,
      clientId: true,
    },
  });

  if (!vehicle) {
    return { error: "Vehicle not found for this work order." };
  }

  const client = await prisma.client.findFirst({
    where: { id: vehicle.clientId },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
    },
  });

  if (!client) {
    return { error: "Client not found for this work order." };
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
      client: {
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
      },
      vehicle: {
        make: vehicle.make ?? "",
        model: vehicle.model ?? "",
        year: vehicle.year ?? 0,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Server Action — generateAndSendInvoice
// ---------------------------------------------------------------------------

/**
 * Generates a simple invoice PDF and emails it to the client, then marks the
 * work order as INVOICED. Uses the same PDF renderer as the signed contract,
 * but without requiring a live signature (the signature block is left blank).
 */
export async function generateAndSendInvoice(
  workOrderId: string,
): Promise<{ success: true } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  try {
    const [workOrder, tenant] = await Promise.all([
      prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: {
          id: true,
          status: true,
          laborCents: true,
          partsCents: true,
          vehicleId: true,
        },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
    ]);

    if (!workOrder || !tenant) {
      return { error: "Work order not found." };
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: workOrder.vehicleId, tenantId },
      select: { clientId: true },
    });

    if (!vehicle) {
      return { error: "Vehicle not found for this work order." };
    }

    const client = await prisma.client.findFirst({
      where: { id: vehicle.clientId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!client) {
      return { error: "Client not found for this work order." };
    }

    if (workOrder.status !== "COMPLETE" && workOrder.status !== "INVOICED") {
      return {
        error:
          "Invoice can only be generated for completed jobs.",
      };
    }

    const subtotalCents = workOrder.laborCents + workOrder.partsCents;
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;
    const totalDollars = (totalCents / 100).toFixed(2);

    const clientName = `${client.firstName} ${client.lastName}`;
    const clientEmail = client.email ?? undefined;

    const formattedSignedAt = new Date().toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "long",
    });

    // Empty transparent PNG for the signature block (optional for invoices).
    const EMPTY_SIGNATURE =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAuMBgVYBoakAAAAASUVORK5CYII=";

    const pdfBytes = renderContractPdf({
      workOrderId: workOrder.id,
      shopName: tenant.name,
      clientName,
      clientEmail: clientEmail ?? "N/A",
      totalDollars,
      formattedSignedAt,
      clientIp: "Not recorded",
      preInspectionMediaPaths: [],
      signatureDataUrl: EMPTY_SIGNATURE,
      generatedAt: new Date().toISOString(),
    });

    // Upload to Supabase Storage
    const adminDb = createAdminClient();
    const fileName = `invoices/${workOrder.id}/invoice-${Date.now()}.pdf`;

    const { error: uploadError } = await adminDb.storage
      .from("contracts")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      // Non-fatal in development where bucket may not exist.
      console.warn("[generateAndSendInvoice] Storage upload skipped:", uploadError.message);
    }

    const { data: urlData } = adminDb.storage
      .from("contracts")
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // Register WorkOrderDocument (best-effort)
    try {
      await prisma.workOrderDocument.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          type: "INVOICE",
          storageKey: fileName,
          bucket: "contracts",
          filename: fileName.split("/").pop() ?? "invoice.pdf",
          metadataJson: { publicUrl: pdfUrl },
        },
      });
    } catch {
      // Non-fatal.
    }

    // Email invoice (best-effort)
    if (clientEmail) {
      const attachmentName = `invoice-${workOrder.id}.pdf`;
      await sendContractEmail({
        to: clientEmail,
        clientName,
        shopName: tenant.name,
        workOrderId: workOrder.id,
        pdfBuffer: pdfBytes,
        pdfFileName: attachmentName,
      });
    }

    // Transition to INVOICED if still COMPLETE.
    if (workOrder.status === "COMPLETE") {
      await prisma.workOrder.updateMany({
        where: { id: workOrder.id, tenantId },
        data: { status: "INVOICED" },
      });

      try {
        await adminDb
          .from("work_orders")
          .update({ status: "INVOICED" })
          .eq("id", workOrder.id)
          .eq("tenant_id", tenantId);
      } catch {
        // Non-fatal.
      }
    }

    revalidatePath("/jobs");
    revalidatePath(`/work-orders/${workOrder.id}`);
    revalidateTag("jobs", "max");
    revalidateTag("work-orders", "max");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { error: `Failed to generate invoice: ${message}` };
  }
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

  const { tenantId, userId } = await verifySession();

  // --- Fetch work order to validate state and get amounts for audit ----------
  let workOrder: {
    id: string;
    status: string;
    title: string;
    laborCents: number;
    partsCents: number;
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true, status: true, title: true, laborCents: true, partsCents: true },
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

  // Determine the stored payment method string (must match isCardPayment in payment-fees.ts).
  let storedMethod: string;
  if (paymentMethod === "card") {
    storedMethod = cardDetails ? "card_manual" : "card_tap";
  } else {
    // cash_check — caller passes "cash" or "check" as the brand field; normalize to avoid invalid values
    const raw = cardDetails?.brand ?? "cash";
    storedMethod = raw === "check" ? "check" : "cash";
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
          vehicleId: true,
        },
      });

      let oilType: string | null = null;
      if (wo?.vehicleId) {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: wo.vehicleId, tenantId },
          select: { oilType: true },
        });
        oilType = (vehicle?.oilType as string | null) ?? null;
      }

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

  // --- Audit trail: record payment in work_order_events ---------------------
  const totalCents = Math.round(
    (workOrder.laborCents + workOrder.partsCents) * (1 + TAX_RATE),
  );
  const totalFormatted = (totalCents / 100).toFixed(2);
  try {
    await createWorkOrderEvent({
      workOrderId,
      scope: "WORK_ORDER",
      kind: "SYSTEM",
      title: "Payment recorded",
      body: `Payment recorded: $${totalFormatted} (labor + parts + tax). Method: ${storedMethod}.`,
      metadataJson: {
        actorUserId: userId,
        amountCents: totalCents,
        paymentMethod: storedMethod,
        closedAt: closedAt.toISOString(),
      },
    });
  } catch {
    // Non-fatal — payment already persisted; audit event is best-effort.
  }

  revalidatePath("/jobs");
  revalidateTag("jobs", "max");
  revalidateTag("work-orders", "max");
  return { success: true, closedAt: closedAt.toISOString() };
}
