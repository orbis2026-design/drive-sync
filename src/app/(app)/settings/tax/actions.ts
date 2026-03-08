"use server";

/**
 * actions.ts — Tax & Fee Matrix Settings (Issue #51 / #113)
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { TaxMatrix } from "@/lib/math-engine";
import { getSessionUserId, getUserRole } from "@/lib/auth";

export async function saveTaxMatrix(
  matrix: TaxMatrix,
): Promise<{ error?: string }> {
  // Resolve the tenant ID from the authenticated session.
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "You must be signed in to save the tax matrix." };
  }

  const roleRow = await getUserRole(userId);
  const tenantId = roleRow?.tenantId;
  if (!tenantId) {
    return { error: "Tenant not configured." };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { taxMatrixJson: matrix as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  return {};
}

/**
 * saveTaxSettings — persists zip-code based tax scalars (Issue #113).
 * Updates the Tenant's shopZipCode, partsTaxRate, laborTaxRate scalar fields
 * AND keeps taxMatrixJson in sync with the new rates.
 */
export async function saveTaxSettings(params: {
  shopZipCode: string;
  partsTaxRate: number;
  laborTaxRate: number;
}): Promise<{ error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "You must be signed in to save tax settings." };
  }

  const roleRow = await getUserRole(userId);
  const tenantId = roleRow?.tenantId;
  if (!tenantId) {
    return { error: "Tenant not configured." };
  }

  try {
    // Fetch existing taxMatrixJson to merge the new rates in without losing env fees.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { taxMatrixJson: true },
    });

    const existing = (tenant?.taxMatrixJson as Record<string, number> | null) ?? {};
    const updatedMatrix: TaxMatrix = {
      labor_tax_rate: params.laborTaxRate,
      parts_tax_rate: params.partsTaxRate,
      environmental_fee_flat: existing.environmental_fee_flat ?? 0,
      environmental_fee_percentage: existing.environmental_fee_percentage ?? 0,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        shopZipCode: params.shopZipCode || null,
        partsTaxRate: params.partsTaxRate,
        laborTaxRate: params.laborTaxRate,
        taxMatrixJson: updatedMatrix as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return { error: message };
  }

  return {};
}
