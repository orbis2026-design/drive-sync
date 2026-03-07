"use client";

import { useState, useTransition, useCallback } from "react";
import {
  getQboOAuthUrl,
  disconnectQbo,
  getQboChartOfAccounts,
  syncPaidWorkOrders,
} from "./actions";
import type {
  QboStatus,
  ChartOfAccountsEntry,
  CategoryMapping,
  SyncResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QboClientProps {
  initialStatus: QboStatus;
}

// ---------------------------------------------------------------------------
// Category labels mapped to their account key
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: { key: keyof CategoryMapping; label: string; description: string }[] = [
  {
    key: "labor",
    label: "Labor Revenue",
    description: "Income from mechanic labor / service hours",
  },
  {
    key: "parts",
    label: "Parts Revenue",
    description: "Income from parts sold to clients",
  },
  {
    key: "envFees",
    label: "Environmental Fees",
    description: "Shop supplies, hazmat disposal, recycling",
  },
  {
    key: "salesTax",
    label: "Sales Tax",
    description: "Tax collected from clients (liability account)",
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QboClient({ initialStatus }: QboClientProps) {
  const [status, setStatus] = useState<QboStatus>(initialStatus);
  const [accounts, setAccounts] = useState<ChartOfAccountsEntry[] | null>(null);
  const [mapping, setMapping] = useState<CategoryMapping>({
    labor: "",
    parts: "",
    envFees: "",
    salesTax: "",
  });
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ---------------------------------------------------------------------------
  // Load chart of accounts when connected
  // ---------------------------------------------------------------------------

  const loadAccounts = useCallback(() => {
    startTransition(async () => {
      const res = await getQboChartOfAccounts();
      if ("error" in res) {
        showToast(res.error);
      } else {
        setAccounts(res);
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // OAuth connect
  // ---------------------------------------------------------------------------

  function handleConnect() {
    startTransition(async () => {
      const { url } = await getQboOAuthUrl();
      window.location.href = url;
    });
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectQbo();
      setStatus({ connected: false, realmId: null, companyName: null });
      setAccounts(null);
      setSyncResult(null);
      showToast("QuickBooks Online disconnected.");
    });
  }

  // ---------------------------------------------------------------------------
  // Sync work orders
  // ---------------------------------------------------------------------------

  function handleSync() {
    if (!mapping.labor || !mapping.parts) {
      showToast("Map at least Labor and Parts accounts first.");
      return;
    }
    startTransition(async () => {
      const res = await syncPaidWorkOrders(mapping);
      if ("error" in res) {
        showToast(res.error);
      } else {
        setSyncResult(res);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render — not connected
  // ---------------------------------------------------------------------------

  if (!status.connected) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-600 text-sm text-white px-4 py-2 rounded-xl shadow-2xl max-w-xs text-center">
            {toast}
          </div>
        )}

        <div className="max-w-xl mx-auto px-4 pt-6 pb-20">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">📚</div>
            <h2 className="text-xl font-bold text-white mb-2">
              Connect QuickBooks Online
            </h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Connect your QuickBooks account to automatically sync closed work
              orders as invoices — no more manual data entry.
            </p>

            <ul className="text-left space-y-2 mb-6">
              {[
                "One-click sync of PAID work orders",
                "Map income categories to your Chart of Accounts",
                "Automatic labor, parts & tax line items",
                "Secure OAuth 2.0 — we never store your password",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-400 text-xs">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handleConnect}
              disabled={isPending}
              className="w-full bg-[#2CA01C] hover:bg-[#25890F] text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {isPending ? "Redirecting…" : "Connect to QuickBooks →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — connected
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-600 text-sm text-white px-4 py-2 rounded-xl shadow-2xl max-w-xs text-center">
          {toast}
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 pt-6 pb-20 space-y-5">
        {/* Connection status */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-white text-sm">
                QuickBooks Online Connected
              </p>
              {status.companyName && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {status.companyName}
                </p>
              )}
              {status.realmId && (
                <p className="text-xs text-gray-600 mt-0.5 font-mono">
                  Realm: {status.realmId}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>

        {/* Chart of Accounts mapper */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">
              Chart of Accounts Mapping
            </h3>
            {!accounts && (
              <button
                onClick={loadAccounts}
                disabled={isPending}
                className="text-xs text-sky-400 hover:text-sky-300 border border-sky-900 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? "Loading…" : "Load Accounts"}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Match each DriveSync income category to the correct line in your
            QuickBooks Chart of Accounts.
          </p>

          <div className="space-y-4">
            {CATEGORY_LABELS.map(({ key, label, description }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-300 mb-0.5">
                  {label}
                </label>
                <p className="text-xs text-gray-600 mb-1">{description}</p>
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="">— Select account —</option>
                  {(accounts ?? []).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.accountType})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={isPending || !mapping.labor || !mapping.parts}
          className="w-full bg-[#2CA01C] hover:bg-[#25890F] text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Syncing…" : "⬆ Sync PAID Work Orders → QuickBooks"}
        </button>

        {/* Sync result */}
        {syncResult && (
          <div className="bg-gray-900 border border-green-800 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-lg font-bold text-green-400 mb-1">
              Sync Complete
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              {syncResult.synced} invoice{syncResult.synced !== 1 ? "s" : ""}{" "}
              successfully synced to QuickBooks
              {syncResult.failed > 0
                ? `, ${syncResult.failed} failed`
                : ""}.
            </p>

            {syncResult.invoiceIds.length > 0 && (
              <div className="text-left bg-gray-800/60 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Invoice IDs
                </p>
                {syncResult.invoiceIds.map((id) => (
                  <p key={id} className="text-xs text-gray-300 font-mono">
                    {id}
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={() => setSyncResult(null)}
              className="mt-4 text-xs text-gray-500 hover:text-gray-300"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
