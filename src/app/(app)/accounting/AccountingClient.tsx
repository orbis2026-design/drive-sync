"use client";

import { useState, useTransition } from "react";
import type { MonthlyReport } from "./actions";
import { fetchMonthlyReport } from "./actions";

// ---------------------------------------------------------------------------
// CSV generation (QuickBooks Ledger format)
// ---------------------------------------------------------------------------

/**
 * Generates a CSV formatted for QuickBooks Ledger import.
 * Columns: Date, Description, Account, Debit, Credit, Memo
 */
function buildCSV(report: MonthlyReport): string {
  const { monthLabel, year, month } = report;
  const lastDay = new Date(year, month, 0).getDate();
  const date = `${month.toString().padStart(2, "0")}/${lastDay}/${year}`;

  function cents(c: number): string {
    return (c / 100).toFixed(2);
  }

  const rows: string[][] = [
    ["Date", "Description", "Account", "Debit", "Credit", "Memo"],
    // Labor revenue
    [
      date,
      `Labor Revenue — ${monthLabel}`,
      "4000 · Labor Revenue",
      "",
      cents(report.totalLaborRevenueCents),
      `${report.jobCount} jobs closed`,
    ],
    // Parts revenue
    [
      date,
      `Parts Revenue — ${monthLabel}`,
      "4100 · Parts Revenue",
      "",
      cents(report.totalPartsRevenueCents),
      "Taxable parts sales",
    ],
    // Sales tax collected
    [
      date,
      `Sales Tax Collected — ${monthLabel}`,
      "2200 · Sales Tax Payable",
      "",
      cents(report.totalSalesTaxCollectedCents),
      "Tax due to state",
    ],
    // Parts COGS
    [
      date,
      `Parts COGS — ${monthLabel}`,
      "5000 · Cost of Goods Sold",
      cents(report.partsCOGSCents),
      "",
      "Wholesale parts cost",
    ],
    // Stripe / Card fees
    ...(report.totalStripeFeesCents > 0
      ? [
          [
            date,
            `Card Processing Fees — ${monthLabel}`,
            "6400 · Merchant Service Fees",
            cents(report.totalStripeFeesCents),
            "",
            "~2.9% + $0.30 / txn",
          ],
        ]
      : []),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => (cell.includes(",") ? `"${cell}"` : cell))
        .join(","),
    )
    .join("\n");
}

function downloadCSV(report: MonthlyReport): void {
  const csv = buildCSV(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drivesync-${report.year}-${report.month.toString().padStart(2, "0")}-ledger.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// AccountingClient
// ---------------------------------------------------------------------------

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

interface LineItemProps {
  label: string;
  value: string;
  dim?: boolean;
  debit?: boolean;
  accent?: boolean;
  mono?: boolean;
}

function LineItem({ label, value, dim, debit, accent, mono }: LineItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className={`text-sm font-medium ${dim ? "text-gray-500" : "text-gray-300"}`}>
        {label}
      </span>
      <span
        className={[
          "font-mono text-sm tabular-nums font-bold",
          accent ? "text-green-400" : debit ? "text-red-400" : "text-white",
          mono ? "font-mono" : "",
        ].join(" ")}
      >
        {debit ? `(${value})` : value}
      </span>
    </div>
  );
}

export function AccountingClient({
  initialYear,
  initialMonth,
}: {
  initialYear: number;
  initialMonth: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  function loadReport() {
    setError(null);
    startTransition(async () => {
      const result = await fetchMonthlyReport(year, month);
      if ("error" in result) {
        setError(result.error);
      } else {
        setReport(result.data);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-6 font-mono">
      {/* Terminal header */}
      <div className="rounded-2xl bg-gray-900 border border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-500 text-xs ml-2 font-mono">
            drivesync-accounting $ generate_report
          </span>
        </div>

        {/* Month/Year selector */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
            aria-label="Select month"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
            aria-label="Select year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={loadReport}
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-500 transition-colors disabled:opacity-50 font-mono"
          >
            {isPending ? "Loading…" : "→ Run"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400 font-mono">
          ERROR: {error}
        </div>
      )}

      {/* Report */}
      {report && (
        <>
          <div className="rounded-2xl bg-gray-900 border border-gray-700 p-5">
            <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-1 font-mono">
              Period
            </p>
            <p className="text-white font-black text-2xl mb-1">{report.monthLabel}</p>
            <p className="text-gray-500 text-xs font-mono">
              {report.jobCount} closed job{report.jobCount !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Revenue section */}
          <div className="rounded-2xl bg-gray-900 border border-gray-700 p-5">
            <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-3 font-mono">
              // Revenue
            </p>
            <LineItem label="Labor Revenue (Untaxed)" value={fmt(report.totalLaborRevenueCents)} accent />
            <LineItem label="Parts Revenue (Taxable)" value={fmt(report.totalPartsRevenueCents)} accent />
            <LineItem label="Sales Tax Collected" value={fmt(report.totalSalesTaxCollectedCents)} dim />
          </div>

          {/* Expenses section */}
          <div className="rounded-2xl bg-gray-900 border border-gray-700 p-5">
            <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-3 font-mono">
              // Expenses
            </p>
            <LineItem label="Parts COGS" value={fmt(report.partsCOGSCents)} debit />
            <LineItem label="Card Processing Fees" value={fmt(report.totalStripeFeesCents)} debit />
          </div>

          {/* Net summary */}
          <div
            className="rounded-2xl p-5 border"
            style={{
              background:
                report.netProfitCents >= 0
                  ? "linear-gradient(135deg, #052e16, #14532d)"
                  : "linear-gradient(135deg, #450a0a, #7f1d1d)",
              borderColor:
                report.netProfitCents >= 0 ? "#166534" : "#991b1b",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-2 font-mono text-gray-400">
              // Net Profit
            </p>
            <p
              className={[
                "text-5xl font-black tabular-nums",
                report.netProfitCents >= 0 ? "text-green-400" : "text-red-400",
              ].join(" ")}
            >
              {fmt(Math.abs(report.netProfitCents))}
            </p>
            {report.netProfitCents < 0 && (
              <p className="text-red-400 text-xs mt-1 font-mono">NET LOSS</p>
            )}
          </div>

          {/* Download button */}
          <button
            onClick={() => downloadCSV(report)}
            className="w-full py-5 rounded-3xl font-black text-lg tracking-tight transition-colors"
            style={{
              background: "linear-gradient(135deg, #16a34a, #22c55e)",
              color: "#052e16",
            }}
          >
            ⬇ Download Month-End CSV
            <span className="block text-xs font-mono font-normal opacity-70 mt-0.5">
              QuickBooks Ledger · {report.monthLabel}
            </span>
          </button>
        </>
      )}

      {!report && !isPending && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4" aria-hidden="true">📊</span>
          <p className="text-gray-500 text-sm font-mono">
            Select a month and year, then run the report.
          </p>
        </div>
      )}
    </div>
  );
}
