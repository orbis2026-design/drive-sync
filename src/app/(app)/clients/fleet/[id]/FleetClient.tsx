"use client";

import { useState } from "react";
import type { FleetData, FleetWorkOrder } from "./actions";

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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    INTAKE: "bg-yellow-800/60 text-yellow-200",
    ACTIVE: "bg-blue-800/60 text-blue-200",
    PENDING_APPROVAL: "bg-purple-800/60 text-purple-200",
    COMPLETE: "bg-green-800/60 text-green-200",
    INVOICED: "bg-teal-800/60 text-teal-200",
    PAID: "bg-gray-700/60 text-gray-300",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[status] ?? "bg-gray-700 text-gray-300"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Batch invoice generation (client-side CSV / plain-text)
// ---------------------------------------------------------------------------

function generateBatchInvoice(
  clientName: string,
  orders: FleetWorkOrder[],
): void {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const total = orders.reduce((s, o) => s + o.totalCents, 0);

  const lines = [
    `FLEET INVOICE — NET 30`,
    ``,
    `Bill To: ${clientName}`,
    `Invoice Date: ${today}`,
    `Due Date:     ${dueDateStr}`,
    ``,
    `─────────────────────────────────────────────────────────`,
    `WORK ORDER                    VEHICLE              AMOUNT`,
    `─────────────────────────────────────────────────────────`,
    ...orders.map(
      (o) =>
        `${o.title.padEnd(INVOICE_TITLE_WIDTH).slice(0, INVOICE_TITLE_WIDTH)}  ${o.vehicleLabel.padEnd(INVOICE_VEHICLE_WIDTH).slice(0, INVOICE_VEHICLE_WIDTH)}  ${formatCents(o.totalCents)}`,
    ),
    `─────────────────────────────────────────────────────────`,
    `TOTAL DUE (Net 30):                                 ${formatCents(total)}`,
    ``,
    `Powered by DriveSync`,
  ].join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fleet-invoice-${clientName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Invoice column widths (characters) for plain-text batch invoice
// ---------------------------------------------------------------------------
const INVOICE_TITLE_WIDTH = 30;   // Work order title column
const INVOICE_VEHICLE_WIDTH = 20; // Vehicle label column



export function FleetClient({ data }: { data: FleetData }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(data.completedOrders.map((o) => o.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  const selectedOrders = data.completedOrders.filter((o) =>
    selectedIds.has(o.id),
  );

  const selectedTotal = selectedOrders.reduce((s, o) => s + o.totalCents, 0);

  return (
    <div className="flex flex-col gap-6 px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-6">
      {/* Fleet Spend YTD KPI */}
      <div
        className="rounded-3xl p-5 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
          border: "1px solid #3b82f6",
        }}
      >
        <div>
          <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">
            Fleet Spend YTD
          </p>
          <p className="text-4xl font-black text-white tabular-nums">
            {formatCents(data.fleetSpendYTDCents)}
          </p>
          <p className="text-blue-300 text-xs mt-1">
            {data.clientName} · {new Date().getFullYear()}
          </p>
        </div>
        <div className="text-5xl opacity-40" aria-hidden="true">🏢</div>
      </div>

      {/* Vehicle grid */}
      <section aria-label="Fleet vehicles">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          Active Fleet · {data.vehicles.length} Vehicle{data.vehicles.length !== 1 ? "s" : ""}
        </h2>
        {data.vehicles.length === 0 ? (
          <p className="text-gray-500 text-sm">No vehicles on file.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.vehicles.map((v) => (
              <div
                key={v.id}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-white font-bold text-sm">
                    {v.year} {v.make} {v.model}
                  </p>
                  {v.openJobCount > 0 && (
                    <span className="text-[10px] font-bold bg-yellow-800/60 text-yellow-200 px-2 py-0.5 rounded-full">
                      {v.openJobCount} open
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                  {v.plate && (
                    <span>
                      🔖 {v.plate}
                    </span>
                  )}
                  {v.color && <span>🎨 {v.color}</span>}
                  {v.mileageIn != null && (
                    <span>
                      📏 {v.mileageIn.toLocaleString()} mi
                    </span>
                  )}
                  {v.oilType && <span>🛢 {v.oilType}</span>}
                </div>
                {v.vin && (
                  <p className="text-[10px] text-gray-600 font-mono truncate">
                    {v.vin}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Batch invoice */}
      <section aria-label="Batch invoice">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Completed Work Orders
          </h2>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Select all
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {data.completedOrders.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No completed work orders yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.completedOrders.map((order) => {
              const checked = selectedIds.has(order.id);
              return (
                <label
                  key={order.id}
                  className={[
                    "flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition-all",
                    checked
                      ? "border-yellow-400 bg-yellow-400/5"
                      : "border-gray-800 bg-gray-900 hover:border-gray-700",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOrder(order.id)}
                    className="w-5 h-5 rounded accent-yellow-400 flex-shrink-0"
                    aria-label={`Select ${order.title}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">
                      {order.title}
                    </p>
                    <p className="text-gray-500 text-xs">{order.vehicleLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-white font-bold text-sm tabular-nums">
                      {formatCents(order.totalCents)}
                    </span>
                    <StatusPill status={order.status} />
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Batch invoice action bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+60px)] left-0 right-0 sm:bottom-0 z-40 px-4 py-3 bg-gray-900/95 backdrop-blur border-t border-gray-700">
            <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-black text-lg tabular-nums">
                  {formatCents(selectedTotal)}
                </p>
                <p className="text-gray-400 text-xs">
                  {selectedIds.size} work order{selectedIds.size !== 1 ? "s" : ""} · Net 30
                </p>
              </div>
              <button
                onClick={() =>
                  generateBatchInvoice(data.clientName, selectedOrders)
                }
                className="px-6 py-3 rounded-2xl bg-yellow-400 text-gray-900 font-black text-sm hover:bg-yellow-300 transition-colors"
              >
                📄 Generate Batch Invoice
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
