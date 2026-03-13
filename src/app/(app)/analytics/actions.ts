"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { verifySession, getUserRole } from "@/lib/auth";
import { isCardPayment, computeCardFeeCents } from "@/lib/payment-fees";

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

/** Boltbook oil-change focused metrics (MTD). */
export type OilChangeMetrics = {
  oilChangeCount: number;
  avgTicketCents: number;
  /** Percentage of PAID jobs with at least one light job (e.g. brake) in checklists_json. */
  addOnAttachRatePercent: number;
};

export type AnalyticsData = {
  metrics: FinancialMetrics;
  ytd: FinancialMetrics;
  weeklyRevenue: WeeklyRevenue[];
  oilChange: OilChangeMetrics;
};

// ---------------------------------------------------------------------------
// fetchAnalytics
// ---------------------------------------------------------------------------

/**
 * Aggregates financial data from PAID WorkOrders: MTD, YTD, and last 8 weeks.
 *
 * COGS calculation:
 *  - If partsCostCents is recorded: use it directly.
 *  - Otherwise: assume wholesale cost = partsCents × DEFAULT_PARTS_MARGIN.
 *
 * Net Profit = Gross Revenue − Parts COGS − Card Fees
 */
export async function fetchAnalytics(): Promise<
  { data: AnalyticsData } | { data: null; error: string }
> {
  const { tenantId, userId } = await verifySession();

  const roleRow = await getUserRole(userId);
  if (roleRow?.role !== "SHOP_OWNER") {
    return { data: null, error: "Only shop owners can view financial analytics." };
  }

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const eightWeeksAgo = new Date(now);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const [paidMTD, paidYTD, paidWeekly] = await Promise.all([
      prisma.workOrder.findMany({
        where: {
          tenantId,
          status: "PAID",
          closedAt: { gte: startOfMonth },
        },
        select: {
          laborCents: true,
          partsCents: true,
          partsCostCents: true,
          paymentMethod: true,
        },
      }),
      prisma.workOrder.findMany({
        where: {
          tenantId,
          status: "PAID",
          closedAt: { gte: startOfYear },
        },
        select: {
          laborCents: true,
          partsCents: true,
          partsCostCents: true,
          paymentMethod: true,
        },
      }),
      prisma.workOrder.findMany({
        where: {
          tenantId,
          status: "PAID",
          closedAt: { gte: eightWeeksAgo },
        },
        select: {
          laborCents: true,
          partsCents: true,
          closedAt: true,
        },
      }),
    ]);

    // --- MTD metrics ---
    let grossRevenueCents = 0;
    let partsCOGSCents = 0;
    let cardFeesCents = 0;
    for (const wo of paidMTD) {
      const subtotal = wo.laborCents + wo.partsCents;
      const total = Math.round(subtotal * (1 + TAX_RATE));
      grossRevenueCents += total;
      const cogs =
        wo.partsCostCents !== null
          ? wo.partsCostCents
          : Math.round(wo.partsCents * DEFAULT_PARTS_COST_RATIO);
      partsCOGSCents += cogs;
      if (isCardPayment(wo.paymentMethod)) {
        cardFeesCents += computeCardFeeCents(total);
      }
    }
    const netProfitCents = grossRevenueCents - partsCOGSCents - cardFeesCents;

    // --- YTD metrics ---
    let ytdGrossRevenueCents = 0;
    let ytdPartsCOGSCents = 0;
    let ytdCardFeesCents = 0;
    for (const wo of paidYTD) {
      const subtotal = wo.laborCents + wo.partsCents;
      const total = Math.round(subtotal * (1 + TAX_RATE));
      ytdGrossRevenueCents += total;
      const cogs =
        wo.partsCostCents !== null
          ? wo.partsCostCents
          : Math.round(wo.partsCents * DEFAULT_PARTS_COST_RATIO);
      ytdPartsCOGSCents += cogs;
      if (isCardPayment(wo.paymentMethod)) {
        ytdCardFeesCents += computeCardFeeCents(total);
      }
    }
    const ytdNetProfitCents =
      ytdGrossRevenueCents - ytdPartsCOGSCents - ytdCardFeesCents;

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

    // --- Oil-change focused metrics (MTD): count, avg ticket, add-on attach rate ---
    const paidMTDWithChecklists = await prisma.workOrder.findMany({
      where: {
        tenantId,
        status: "PAID",
        closedAt: { gte: startOfMonth },
        isDiagnostic: false,
      },
      select: {
        laborCents: true,
        partsCents: true,
        checklists_json: true,
      },
    });

    const oilChangeCount = paidMTDWithChecklists.length;
    let totalTicketCents = 0;
    let withAddOn = 0;
    for (const wo of paidMTDWithChecklists) {
      const subtotal = wo.laborCents + wo.partsCents;
      totalTicketCents += Math.round(subtotal * (1 + TAX_RATE));
      const raw = wo.checklists_json as { lightJobs?: unknown[] } | null;
      if (Array.isArray(raw?.lightJobs) && raw.lightJobs.length > 0) {
        withAddOn += 1;
      }
    }
    const avgTicketCents =
      oilChangeCount > 0 ? Math.round(totalTicketCents / oilChangeCount) : 0;
    const addOnAttachRatePercent =
      oilChangeCount > 0
        ? Math.round((withAddOn / oilChangeCount) * 100)
        : 0;

    return {
      data: {
        metrics: { grossRevenueCents, partsCOGSCents, cardFeesCents, netProfitCents },
        ytd: {
          grossRevenueCents: ytdGrossRevenueCents,
          partsCOGSCents: ytdPartsCOGSCents,
          cardFeesCents: ytdCardFeesCents,
          netProfitCents: ytdNetProfitCents,
        },
        weeklyRevenue,
        oilChange: {
          oilChangeCount,
          avgTicketCents,
          addOnAttachRatePercent,
        },
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { data: null, error: "Database synchronization pending or unreachable." };
    }
    const message =
      err instanceof Error ? err.message : "Failed to load analytics.";
    return { data: null, error: message };
  }
}
