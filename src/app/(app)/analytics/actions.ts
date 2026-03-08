"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stripe / Square processing fee approximation: 2.9 % + $0.30 per transaction. */
const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED_CENTS = 30;

/**
 * When partsCostCents is not recorded on a WorkOrder we assume the wholesale
 * cost represents 55% of the retail parts price (i.e. a ~45% gross margin).
 */
const DEFAULT_PARTS_COST_RATIO = 0.55;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinancialMetrics = {
  grossRevenueCents: number;
  partsCOGSCents: number;
  cardFeesCents: number;
  netProfitCents: number;
};

export type WeeklyRevenue = {
  weekLabel: string; // "Mar 1"
  revenueCents: number;
};

export type AnalyticsData = {
  metrics: FinancialMetrics;
  weeklyRevenue: WeeklyRevenue[];
};

// ---------------------------------------------------------------------------
// fetchAnalytics
// ---------------------------------------------------------------------------

/**
 * Aggregates financial data from PAID WorkOrders for the current month
 * and the last 8 weeks.
 *
 * COGS calculation:
 *  - If partsCostCents is recorded: use it directly.
 *  - Otherwise: assume wholesale cost = partsCents × DEFAULT_PARTS_MARGIN.
 *
 * Net Profit = Gross Revenue − Parts COGS − Card Fees
 */
export async function fetchAnalytics(): Promise<
  { data: AnalyticsData } | { data: null; error: string } | { error: string }
> {
  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    // --- MTD window ---
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidMTD = await prisma.workOrder.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "PAID",
        closedAt: { gte: startOfMonth },
      },
      select: {
        laborCents: true,
        partsCents: true,
        partsCostCents: true,
      },
    });

    // Gross Revenue = sum of (labor + parts) * (1 + tax)
    let grossRevenueCents = 0;
    let partsCOGSCents = 0;
    let cardFeesCents = 0;

    for (const wo of paidMTD) {
      const subtotal = wo.laborCents + wo.partsCents;
      const total = Math.round(subtotal * (1 + TAX_RATE));

      grossRevenueCents += total;

      // COGS: actual wholesale cost or estimated from margin
      const cogs =
        wo.partsCostCents !== null
          ? wo.partsCostCents
          : Math.round(wo.partsCents * DEFAULT_PARTS_COST_RATIO);
      partsCOGSCents += cogs;

      // Card processing fees (approximate — applied to the full total)
      cardFeesCents += Math.round(total * CARD_FEE_RATE) + CARD_FEE_FIXED_CENTS;
    }

    const netProfitCents = grossRevenueCents - partsCOGSCents - cardFeesCents;

    // --- Weekly revenue for last 8 weeks ---
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const paidWeekly = await prisma.workOrder.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "PAID",
        closedAt: { gte: eightWeeksAgo },
      },
      select: {
        laborCents: true,
        partsCents: true,
        closedAt: true,
      },
    });

    // Build week buckets (ISO week starting Monday)
    function getWeekStart(date: Date): Date {
      const d = new Date(date);
      const day = d.getDay(); // 0=Sun
      const diff = (day + 6) % 7; // distance to Monday
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    function formatWeekLabel(date: Date): string {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    // Create 8 buckets (oldest first)
    const buckets: Map<string, { label: string; cents: number }> = new Map();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const ws = getWeekStart(d);
      const key = ws.toISOString().slice(0, 10);
      if (!buckets.has(key)) {
        buckets.set(key, { label: formatWeekLabel(ws), cents: 0 });
      }
    }

    for (const wo of paidWeekly) {
      if (!wo.closedAt) continue;
      const ws = getWeekStart(wo.closedAt);
      const key = ws.toISOString().slice(0, 10);
      const subtotal = wo.laborCents + wo.partsCents;
      const total = Math.round(subtotal * (1 + TAX_RATE));
      if (buckets.has(key)) {
        buckets.get(key)!.cents += total;
      }
    }

    const weeklyRevenue: WeeklyRevenue[] = Array.from(buckets.values()).map(
      (b) => ({ weekLabel: b.label, revenueCents: b.cents }),
    );

    return {
      data: {
        metrics: { grossRevenueCents, partsCOGSCents, cardFeesCents, netProfitCents },
        weeklyRevenue,
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { data: null, error: "Database synchronization pending or unreachable." };
    }
    const message =
      err instanceof Error ? err.message : "Failed to load analytics.";
    return { error: message };
  }
}
