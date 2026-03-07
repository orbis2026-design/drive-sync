"use server";

/**
 * actions.ts — Diagnostic-Only Intake Server Actions (Issue #53)
 */

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) {
    return { error: "Tenant not configured (DEMO_TENANT_ID missing)." };
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
