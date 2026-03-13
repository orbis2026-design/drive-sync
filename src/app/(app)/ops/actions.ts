"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, getUserRole } from "@/lib/auth";

export type OpsContext = {
  userId: string;
  role: string;
  tenantId: string | null;
};

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
};

export async function getOpsContext(): Promise<
  { context: OpsContext; tenants: TenantSummary[] } | { error: string }
> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "Not authenticated." };
  }

  try {
    const roleRow = await getUserRole(userId);

    // Scope tenants to the current user:
    // - SHOP_OWNER: all shops where they are the owner
    // - FIELD_TECH / FLEET_CLIENT: just their assigned tenant (if any)
    const whereClause =
      roleRow?.role === "SHOP_OWNER"
        ? { ownerUserId: userId }
        : roleRow?.tenantId
          ? { id: roleRow.tenantId }
          : { id: undefined };

    const tenants = await prisma.tenant.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true },
    });

    return {
      context: {
        userId,
        role: roleRow?.role ?? "UNKNOWN",
        tenantId: roleRow?.tenantId ?? null,
      },
      tenants,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load operator context.";
    return { error: message };
  }
}

export async function switchTenantForCurrentUser(
  tenantId: string,
): Promise<{ ok: true } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "Not authenticated." };
  }

  if (!tenantId) {
    return { error: "Tenant ID is required." };
  }

  try {
    const exists = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!exists) {
      return { error: "Tenant not found." };
    }

    await prisma.userRole.update({
      where: { userId },
      data: { tenantId },
    });

    revalidateTag("clients", "max");
    revalidateTag("jobs", "max");
    revalidatePath("/clients");
    revalidatePath("/jobs");

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to switch tenant.";
    return { error: message };
  }
}

