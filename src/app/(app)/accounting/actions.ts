"use server";

import { prisma } from "@/lib/prisma";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { verifySession, getUserRole } from "@/lib/auth";
import { isCardPayment, computeCardFeeCents } from "@/lib/payment-fees";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PARTS_COST_RATIO = 0.55; // Assumed wholesale cost when partsCostCents is null

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonthlyReport = {
  year: number;
  month: number; // 1-12
  monthLabel: string; // e.g. "March 2026"
  totalLaborRevenueCents: number;       // Untaxed
  totalPartsRevenueCents: number;       // Taxable
  totalSalesTaxCollectedCents: number;
  totalStripeFeesCents: number;
  netRevenueCents: number;
  partsCOGSCents: number;
  netProfitCents: number;
  jobCount: number;
};

// ---------------------------------------------------------------------------
// fetchMonthlyReport
// ---------------------------------------------------------------------------

export async function fetchMonthlyReport(
  year: number,
  month: number,
): Promise<{ data: MonthlyReport } | { error: string }> {
  if (!year || !month || month < 1 || month > 12) {
    return { error: "Invalid year or month." };
  }

  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { error: "Only shop owners can view accounting reports." };
  }

  try {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive

    const paidOrders = await prisma.workOrder.findMany({
      where: {
        tenantId,
        status: "PAID",
        closedAt: { gte: start, lt: end },
      },
      select: {
        laborCents: true,
        partsCents: true,
        partsCostCents: true,
        paymentMethod: true,
      },
    });

    let totalLaborRevenueCents = 0;
    let totalPartsRevenueCents = 0;
    let totalSalesTaxCollectedCents = 0;
    let totalStripeFeesCents = 0;
    let partsCOGSCents = 0;

    for (const wo of paidOrders) {
      totalLaborRevenueCents += wo.laborCents;
      totalPartsRevenueCents += wo.partsCents;

      const subtotal = wo.laborCents + wo.partsCents;
      const tax = Math.round(subtotal * TAX_RATE);
      totalSalesTaxCollectedCents += tax;

      const total = subtotal + tax;

      // Card fees only for card payments (cash/check/null = no fee)
      if (isCardPayment(wo.paymentMethod)) {
        totalStripeFeesCents += computeCardFeeCents(total);
      }

      const cogs =
        wo.partsCostCents !== null
          ? wo.partsCostCents
          : Math.round(wo.partsCents * DEFAULT_PARTS_COST_RATIO);
      partsCOGSCents += cogs;
    }

    const netRevenueCents =
      totalLaborRevenueCents +
      totalPartsRevenueCents +
      totalSalesTaxCollectedCents;

    const netProfitCents =
      netRevenueCents - partsCOGSCents - totalStripeFeesCents;

    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );

    return {
      data: {
        year,
        month,
        monthLabel,
        totalLaborRevenueCents,
        totalPartsRevenueCents,
        totalSalesTaxCollectedCents,
        totalStripeFeesCents,
        netRevenueCents,
        partsCOGSCents,
        netProfitCents,
        jobCount: paidOrders.length,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load report.";
    return { error: message };
  }
}
