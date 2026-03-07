"use client";

/**
 * Fleet Manager Batch Invoicing Engine — Client Component  (Issue #61)
 *
 * Allows a Shop Owner to:
 *   1. Select a commercial fleet client and date range.
 *   2. View all APPROVED / COMPLETE WorkOrders within that range.
 *   3. Click "Roll Up to Batch Invoice" to create a single consolidated
 *      Stripe Invoice covering all selected line items.
 *   4. All rolled-up WorkOrders are then moved to BATCHED_PENDING_PAYMENT.
 */

import { useState, useTransition } from "react";
import type { FleetWorkOrder, FleetClient } from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FleetBillingClientProps {
  clients: FleetClient[];
  initialWorkOrders: FleetWorkOrder[];
  initialClientId: string | null;
  initialFrom: string;
  initialTo: string;
}

export function FleetBillingClient({
  clients,
  initialWorkOrders,
  initialClientId,
  initialFrom,
  initialTo,
}: FleetBillingClientProps) {
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [workOrders, setWorkOrders] =
    useState<FleetWorkOrder[]>(initialWorkOrders);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isRolling, setIsRolling] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Toggle a single row in the selection set.
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Toggle all rows.
  function toggleAll() {
    if (selected.size === workOrders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(workOrders.map((wo) => wo.id)));
    }
  }

  // Re-fetch work orders when filter inputs change.
  async function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    startTransition(async () => {
      const params = new URLSearchParams({ clientId, from, to });
      const res = await fetch(`/api/fleet/work-orders?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { workOrders: FleetWorkOrder[] };
        setWorkOrders(data.workOrders);
        setSelected(new Set());
      }
    });
  }

  // Create the batch invoice via the API route.
  async function handleRollUp() {
    if (selected.size === 0 || !clientId) return;
    setIsRolling(true);
    setToast(null);
    try {
      const res = await fetch("/api/stripe/batch-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          workOrderIds: Array.from(selected),
        }),
      });
      const data = (await res.json()) as {
        invoiceId?: string;
        invoiceUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setToast({ type: "error", message: data.error ?? "Failed to create invoice." });
      } else {
        setToast({
          type: "success",
          message: `Batch invoice created (${data.invoiceId}). ${selected.size} work order(s) moved to BATCHED_PENDING_PAYMENT.`,
        });
        // Remove rolled-up orders from the list.
        setWorkOrders((prev) => prev.filter((wo) => !selected.has(wo.id)));
        setSelected(new Set());
      }
    } catch {
      setToast({ type: "error", message: "Network error — please try again." });
    } finally {
      setIsRolling(false);
    }
  }

  const totalSelected = workOrders
    .filter((wo) => selected.has(wo.id))
    .reduce((sum, wo) => sum + wo.totalCents, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Fleet Batch Invoicing</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Roll up completed fleet WorkOrders into a single consolidated
            Net-30 Stripe invoice.
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={[
              "rounded-lg px-4 py-3 text-sm font-medium",
              toast.type === "success"
                ? "bg-green-900/60 text-green-300 border border-green-700"
                : "bg-red-900/60 text-red-300 border border-red-700",
            ].join(" ")}
          >
            {toast.message}
          </div>
        )}

        {/* Filter form */}
        <form
          onSubmit={applyFilter}
          className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-wrap gap-4 items-end"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Fleet Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              required
            >
              <option value="">Select a fleet client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !clientId}
            className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Loading…" : "Apply Filter"}
          </button>
        </form>

        {/* Work order table */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">
              Completed WorkOrders
              {workOrders.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">
                  ({workOrders.length})
                </span>
              )}
            </h2>
            {workOrders.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs text-yellow-400 hover:text-yellow-300 font-medium"
              >
                {selected.size === workOrders.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            )}
          </div>

          {workOrders.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-500 text-sm">
              No completed WorkOrders found for this client and date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="w-12 px-4 py-3 text-left">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Vehicle / Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Completed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {workOrders.map((wo) => (
                    <tr
                      key={wo.id}
                      className={[
                        "cursor-pointer transition-colors",
                        selected.has(wo.id)
                          ? "bg-yellow-900/20"
                          : "hover:bg-gray-800/50",
                      ].join(" ")}
                      onClick={() => toggleRow(wo.id)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(wo.id)}
                          onChange={() => toggleRow(wo.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-600 bg-gray-700 accent-yellow-400"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{wo.title}</p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          {wo.vehicleLabel}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {wo.closedAt
                          ? new Date(wo.closedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-yellow-300">
                        {centsToDollars(wo.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Roll-up footer */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 bg-gray-800 border border-gray-600 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-white">
                {selected.size} work order{selected.size !== 1 ? "s" : ""}{" "}
                selected
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Invoice total:{" "}
                <span className="text-yellow-300 font-mono font-semibold">
                  {centsToDollars(totalSelected)}
                </span>
              </p>
            </div>
            <button
              onClick={handleRollUp}
              disabled={isRolling}
              className="px-6 py-3 bg-yellow-400 text-gray-900 rounded-xl font-bold text-sm hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRolling
                ? "Creating Invoice…"
                : "🧾 Roll Up to Batch Invoice"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
