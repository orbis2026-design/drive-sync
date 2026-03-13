import { fetchAnalytics } from "./actions";
import { WeeklyRevenueChart } from "./AnalyticsClient";
import { EmptyState } from "@/components/EmptyState";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Money — Boltbook",
  description: "Oil-change metrics, revenue, and weekly trends.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// ---------------------------------------------------------------------------
// KPI metric block component
// ---------------------------------------------------------------------------

function MetricBlock({
  label,
  value,
  accentClass,
  note,
}: {
  label: string;
  value: string;
  accentClass: string;
  note?: string;
}) {
  return (
    <div className="rounded-3xl bg-gray-900 border border-gray-800 p-5">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
        {label}
      </p>
      <p className={["text-4xl font-black leading-none tabular-nums", accentClass].join(" ")}>
        {value}
      </p>
      {note && (
        <p className="text-xs text-gray-600 mt-2">{note}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function AnalyticsPage() {
  let result: Awaited<ReturnType<typeof fetchAnalytics>>;
  try {
    result = await fetchAnalytics();
  } catch (err) {
    console.error("[AnalyticsPage] Database query failed:", err);
    result = { data: null, error: "Database syncing..." };
  }

  const data = "data" in result ? result.data : null;
  const error = "error" in result ? result.error : undefined;

  return (
    <div
      className="flex flex-col min-h-full"
      aria-label="Financials dashboard"
    >
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
        >
          Could not load data: {error}
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4">
        {data ? (
          <>
            {/* Owner dashboard: MTD + YTD in one place */}
            <p className="text-xs text-gray-500 font-mono">
              Shop owner financial dashboard · MTD and YTD
            </p>

            {/* Oil-change focus (Boltbook) */}
            <div className="rounded-3xl bg-gray-900 border border-gray-800 p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Oil-change focus (MTD)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Jobs
                  </p>
                  <p className="text-2xl font-black text-white tabular-nums">
                    {data.oilChange.oilChangeCount}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Avg ticket
                  </p>
                  <p className="text-2xl font-black text-brand-400 tabular-nums">
                    {formatCents(data.oilChange.avgTicketCents)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Add-on rate
                  </p>
                  <p className="text-2xl font-black text-emerald-400 tabular-nums">
                    {data.oilChange.addOnAttachRatePercent}%
                  </p>
                </div>
              </div>
            </div>

            {/* KPI grid — 2 × 2 on mobile, 4 across on large screens */}
            <div className="grid grid-cols-2 gap-3">
              <MetricBlock
                label="Gross Revenue MTD"
                value={formatCents(data.metrics.grossRevenueCents)}
                accentClass="text-white"
              />
              <MetricBlock
                label="Parts COGS"
                value={formatCents(data.metrics.partsCOGSCents)}
                accentClass="text-orange-400"
                note="Wholesale cost of parts"
              />
              <MetricBlock
                label="Card Fees"
                value={formatCents(data.metrics.cardFeesCents)}
                accentClass="text-red-400"
                note="~2.9% + $0.30 / txn"
              />
              <MetricBlock
                label="Net Profit"
                value={formatCents(data.metrics.netProfitCents)}
                accentClass={
                  data.metrics.netProfitCents >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }
                note="Revenue − COGS − Fees"
              />
            </div>

            {/* YTD summary — owner overview */}
            <div className="grid grid-cols-2 gap-3">
              <MetricBlock
                label="Revenue YTD"
                value={formatCents(data.ytd.grossRevenueCents)}
                accentClass="text-white"
              />
              <MetricBlock
                label="Net Profit YTD"
                value={formatCents(data.ytd.netProfitCents)}
                accentClass={
                  data.ytd.netProfitCents >= 0 ? "text-green-400" : "text-red-400"
                }
              />
            </div>

            {/* Weekly revenue chart */}
            <div className="rounded-3xl bg-gray-900 border border-gray-800 p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Weekly Revenue — Last 8 Weeks
              </p>
              <WeeklyRevenueChart data={data.weeklyRevenue} />
            </div>

            {/* Margin insight */}
            {data.metrics.grossRevenueCents > 0 && (
              <div className="rounded-3xl bg-gray-900 border border-gray-800 p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                  Margin Breakdown
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      label: "Gross Revenue",
                      cents: data.metrics.grossRevenueCents,
                      barClass: "bg-white",
                    },
                    {
                      label: "Parts COGS",
                      cents: data.metrics.partsCOGSCents,
                      barClass: "bg-orange-400",
                    },
                    {
                      label: "Card Fees",
                      cents: data.metrics.cardFeesCents,
                      barClass: "bg-red-400",
                    },
                    {
                      label: "Net Profit",
                      cents: Math.max(data.metrics.netProfitCents, 0),
                      barClass: "bg-green-400",
                    },
                  ].map(({ label, cents, barClass }) => {
                    const pct = Math.min(
                      (cents / data.metrics.grossRevenueCents) * 100,
                      100,
                    );
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">{label}</span>
                          <span className="text-xs font-bold text-white tabular-nums">
                            {formatCents(cents)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-800">
                          <div
                            className={["h-2 rounded-full transition-all", barClass].join(" ")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="📊"
            title="No revenue data yet"
            description="Complete your first work order to start seeing revenue charts, average ticket size, and monthly trends."
            action={{ label: "+ New Intake", href: "/intake" }}
          />
        )}
      </div>
    </div>
  );
}
