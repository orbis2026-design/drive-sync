"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { type WeeklyRevenue } from "./actions";

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
// WeeklyRevenueChart — recharts bar chart
// ---------------------------------------------------------------------------

export function WeeklyRevenueChart({ data }: { data: WeeklyRevenue[] }) {
  const chartData = data.map((d) => ({
    week: d.weekLabel,
    revenue: d.revenueCents / 100,
  }));

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  // Custom tooltip
  function CustomTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 shadow-xl">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-base font-black text-white">
          {formatCents(payload[0].value * 100)}
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="#374151"
        />
        <XAxis
          dataKey="week"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1f2937" }} />
        <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.revenue === maxRevenue ? "#facc15" : "#374151"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
