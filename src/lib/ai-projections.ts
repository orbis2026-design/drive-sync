import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkOrderRow {
  status: string;
  labor_json: unknown;
}

// ---------------------------------------------------------------------------
// generateWeeklyProjection
// Generates a motivational AI projection summary for the shop.
// Intended to be called by a cron job / Edge Function.
// ---------------------------------------------------------------------------

export async function generateWeeklyProjection(
  tenantId: string,
): Promise<string> {
  const admin = createAdminClient();

  // Query work_orders for the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: orders, error } = await admin
    .from("work_orders")
    .select("status, labor_json")
    .eq("tenant_id", tenantId)
    .gte("created_at", sevenDaysAgo.toISOString());

  if (error || !orders) {
    return "📊 Weekly projection unavailable — unable to fetch work order data.";
  }

  const completed = (orders as WorkOrderRow[]).filter(
    (o) => o.status === "COMPLETE" || o.status === "INVOICED" || o.status === "PAID",
  );

  // Sum labor_cents from labor_json array
  // labor_json shape: [{ description, quantity, rate_cents, total_cents }]
  let totalCents = 0;
  for (const order of completed) {
    const labor = order.labor_json;
    if (Array.isArray(labor)) {
      for (const line of labor as { total_cents?: number }[]) {
        if (typeof line.total_cents === "number") {
          totalCents += line.total_cents;
        }
      }
    }
  }

  const totalDollars = Math.round(totalCents / 100);
  const completedCount = completed.length;

  // Rotate through seasonal/operational tips based on the week of year
  const weekOfYear = Math.ceil(
    (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  );
  const TIPS = [
    "Battery failures spike in cold weather — stock up on group sizes 35 and 65.",
    "Coolant flushes are up 40% in spring — upsell during oil change visits.",
    "Check your tire inventory: summer tire changeover season is approaching.",
    "TPMS sensors fail most often at 7–10 years old — flag them on older vehicles.",
    "AC service demand rises in warmer months — pre-order refrigerant now.",
    "Wiper blade replacements peak before rainy season — keep extra stock on hand.",
    "Fleet clients often need brake service every 6 months — schedule proactive outreach.",
  ];
  const tip = TIPS[weekOfYear % TIPS.length];

  const message =
    `📊 Weekly Report: ${completedCount} job${completedCount !== 1 ? "s" : ""} completed, ` +
    `$${totalDollars.toLocaleString()} billed. ` +
    (completedCount > 5
      ? "You're on a roll! Keep up the great work! 🔥 "
      : "Every job counts — stay consistent! 💪 ") +
    `💡 Tip: ${tip}`;

  return message;
}
