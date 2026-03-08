"use server";

/**
 * actions.ts — Tax & Fee Matrix Settings (Issue #51)
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
  const tenantId = roleRow?.tenantId ?? process.env.DEMO_TENANT_ID;
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
