"use server";

import { prisma } from "@/lib/prisma";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Card processing fee approximation — mirrors the same values in analytics/actions.ts.
// Both should be updated together if the payment processor's rate changes.
const CARD_FEE_RATE = 0.029;       // 2.9% of transaction total
const CARD_FEE_FIXED_CENTS = 30;   // $0.30 flat fee per transaction
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

  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive

    const paidOrders = await prisma.workOrder.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
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

      // Card fees only if paid by card
      if (
        wo.paymentMethod === "card_tap" ||
        wo.paymentMethod === "card_manual"
      ) {
        totalStripeFeesCents +=
          Math.round(total * CARD_FEE_RATE) + CARD_FEE_FIXED_CENTS;
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
