"use server";

/**
 * actions.ts — Tax & Fee Matrix Settings (Issue #51)
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { TaxMatrix } from "@/lib/math-engine";

export async function saveTaxMatrix(
  matrix: TaxMatrix,
): Promise<{ error?: string }> {
  const tenantId = process.env.DEMO_TENANT_ID;
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
