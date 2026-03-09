"use server";

/**
 * actions.ts — Diagnostic-Only Intake Server Actions (Issue #53)
 */

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/auth";
import { sendSMS } from "@/lib/twilio";

export interface CreateDiagnosticWorkOrderParams {
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  vin?: string;
  mileage?: number;
  symptom: string;
  diagnosticFeeCents: number;
  rollDiagnosticFee: boolean;
}

export async function createDiagnosticWorkOrder(
  params: CreateDiagnosticWorkOrderParams,
): Promise<{ workOrderId: string } | { error: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { error: "Authentication required." };
  }

  try {
    // --- Upsert client --------------------------------------------------
    let client = await prisma.client.findFirst({
      where: { tenantId, phone: params.clientPhone },
      select: { id: true },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId,
          firstName: params.clientFirstName,
          lastName: params.clientLastName,
          phone: params.clientPhone,
        },
        select: { id: true },
      });
    }

    // --- Upsert vehicle -------------------------------------------------
    const vehicleYear = params.vehicleYear > 0 ? params.vehicleYear : null;

    let vehicle = await prisma.vehicle.findFirst({
      where: {
        tenantId,
        clientId: client.id,
        make: params.vehicleMake,
        model: params.vehicleModel,
        ...(vehicleYear !== null ? { year: vehicleYear } : {}),
      },
      select: { id: true },
    });

    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: client.id,
          make: params.vehicleMake,
          model: params.vehicleModel,
          year: vehicleYear ?? new Date().getFullYear(),
          vin: params.vin || null,
          mileageIn: params.mileage || null,
        },
        select: { id: true },
      });
    }

    // --- Create diagnostic WorkOrder ------------------------------------
    const title = vehicleYear
      ? `Diagnostic — ${vehicleYear} ${params.vehicleMake} ${params.vehicleModel}`
      : `Diagnostic — ${params.vehicleMake} ${params.vehicleModel}`;

    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId,
        clientId: client.id,
        vehicleId: vehicle.id,
        title,
        description:
          params.symptom || "OBD-II scan and vehicle inspection.",
        status: "ACTIVE",
        isDiagnostic: true,
        diagnosticFeeCents: params.diagnosticFeeCents,
        rollDiagnosticFee: params.rollDiagnosticFee,
        // If rolling the fee, credit it as labour so it shows on the quote.
        laborCents: params.rollDiagnosticFee ? params.diagnosticFeeCents : 0,
      },
      select: { id: true },
    });

    // Mirror to Supabase (best-effort).
    try {
      const adminDb = createAdminClient();
      await adminDb.from("work_orders").insert({
        id: workOrder.id,
        tenant_id: tenantId,
        title,
        status: "ACTIVE",
        is_diagnostic: true,
        diagnostic_fee_cents: params.diagnosticFeeCents,
        roll_diagnostic_fee: params.rollDiagnosticFee,
      });
    } catch {
      // Non-fatal.
    }

    return { workOrderId: workOrder.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// sendDiagnosticApprovalSms
// ---------------------------------------------------------------------------

export interface SendDiagnosticApprovalSmsParams {
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  vin?: string;
  mileage?: number;
  symptom: string;
  diagnosticFeeCents: number;
  rollDiagnosticFee: boolean;
}

/**
 * Creates a pending diagnostic work order with a unique approvalToken,
 * then sends an SMS to the client with a link to the portal where they can
 * review and sign the Diagnostic Authorization.
 *
 * Returns { ok: true, approvalToken, workOrderId } on success, or
 * { error: string } on failure.
 */
export async function sendDiagnosticApprovalSms(
  params: SendDiagnosticApprovalSmsParams,
): Promise<
  { ok: true; approvalToken: string; workOrderId: string } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { error: "Authentication required." };
  }

  try {
    // --- Upsert client ------------------------------------------------------
    let client = await prisma.client.findFirst({
      where: { tenantId, phone: params.clientPhone },
      select: { id: true },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId,
          firstName: params.clientFirstName,
          lastName: params.clientLastName,
          phone: params.clientPhone,
        },
        select: { id: true },
      });
    }

    // --- Upsert vehicle -----------------------------------------------------
    const vehicleYear = params.vehicleYear > 0 ? params.vehicleYear : null;

    let vehicle = await prisma.vehicle.findFirst({
      where: {
        tenantId,
        clientId: client.id,
        make: params.vehicleMake,
        model: params.vehicleModel,
        ...(vehicleYear !== null ? { year: vehicleYear } : {}),
      },
      select: { id: true },
    });

    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: client.id,
          make: params.vehicleMake,
          model: params.vehicleModel,
          year: vehicleYear ?? new Date().getFullYear(),
          vin: params.vin || null,
          mileageIn: params.mileage || null,
        },
        select: { id: true },
      });
    }

    // --- Create pending diagnostic WorkOrder with unique approval token -----
    const approvalToken = crypto.randomUUID();

    const title = vehicleYear
      ? `Diagnostic — ${vehicleYear} ${params.vehicleMake} ${params.vehicleModel}`
      : `Diagnostic — ${params.vehicleMake} ${params.vehicleModel}`;

    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId,
        clientId: client.id,
        vehicleId: vehicle.id,
        title,
        description:
          params.symptom || "OBD-II scan and vehicle inspection.",
        status: "PENDING_APPROVAL",
        approvalToken,
        isDiagnostic: true,
        diagnosticFeeCents: params.diagnosticFeeCents,
        rollDiagnosticFee: params.rollDiagnosticFee,
        laborCents: params.rollDiagnosticFee ? params.diagnosticFeeCents : 0,
      },
      select: { id: true },
    });

    // --- Send SMS via Twilio ------------------------------------------------
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const portalLink = `${appUrl}/portal/${approvalToken}`;
    const smsBody =
      `Hi ${params.clientFirstName}, please review and sign your ` +
      `Diagnostic Authorization for your ${params.vehicleMake} ${params.vehicleModel}: ` +
      `${portalLink}`;

    await sendSMS(params.clientPhone, smsBody);

    // Mirror to Supabase (best-effort).
    try {
      const adminDb = createAdminClient();
      await adminDb.from("work_orders").insert({
        id: workOrder.id,
        tenant_id: tenantId,
        title,
        status: "PENDING_APPROVAL",
        is_diagnostic: true,
        diagnostic_fee_cents: params.diagnosticFeeCents,
        roll_diagnostic_fee: params.rollDiagnosticFee,
      });
    } catch {
      // Non-fatal.
    }

    return { ok: true, approvalToken, workOrderId: workOrder.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send SMS.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// checkApprovalStatus
// ---------------------------------------------------------------------------

/**
 * Polls the database to check whether the client has signed the Diagnostic
 * Authorization via the portal.
 *
 * Returns { approved: true } when the work order status is no longer
 * PENDING_APPROVAL (i.e., the client has signed), or { approved: false }
 * while still waiting.
 */
export async function checkApprovalStatus(
  approvalToken: string,
): Promise<{ approved: boolean } | { error: string }> {
  if (!approvalToken) {
    return { error: "Missing approval token." };
  }

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { approvalToken },
      select: { status: true },
    });

    if (!workOrder) {
      return { error: "Approval link not found." };
    }

    return { approved: workOrder.status !== "PENDING_APPROVAL" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }
}
