"use client";

import { useState } from "react";
import type { ConsumableRow } from "./actions";
import { restockConsumable, createConsumable } from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// ConsumableCard
// ---------------------------------------------------------------------------

function ConsumableCard({
  item,
  onRestock,
}: {
  item: ConsumableRow;
  onRestock: (id: string, qty: number) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRestock(delta: number) {
    const amount = delta !== 0 ? delta : parseFloat(qty);
    if (isNaN(amount) || amount === 0) return;
    setBusy(true);
    await onRestock(item.id, amount);
    setQty("");
    setBusy(false);
  }

  return (
    <div
      className={[
        "rounded-2xl border p-4 flex flex-col gap-3 transition-all",
        item.isLow
          ? "border-red-500 bg-gray-950 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
          : "border-gray-800 bg-gray-900",
      ].join(" ")}
    >
      {/* Name + low-stock badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-white font-bold text-sm leading-tight">{item.name}</p>
          <p className="text-gray-500 text-xs">{item.unit}</p>
        </div>
        {item.isLow && (
          <span
            className="flex-shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-red-900 animate-pulse"
            style={{ background: "linear-gradient(135deg, #ef4444, #ff6b6b)" }}
            role="status"
            aria-label="Low stock warning"
          >
            ⚠ Low Stock
          </span>
        )}
      </div>

      {/* Stock numbers */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-gray-800 p-2">
          <p className={["text-2xl font-black tabular-nums", item.isLow ? "text-red-400" : "text-white"].join(" ")}>
            {item.currentStock % 1 === 0
              ? item.currentStock
              : item.currentStock.toFixed(1)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
            In Stock
          </p>
        </div>
        <div className="rounded-xl bg-gray-800 p-2">
          <p className="text-2xl font-black tabular-nums text-gray-400">
            {item.lowStockThreshold % 1 === 0
              ? item.lowStockThreshold
              : item.lowStockThreshold.toFixed(1)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
            Threshold
          </p>
        </div>
        <div className="rounded-xl bg-gray-800 p-2">
          <p className="text-lg font-black tabular-nums text-green-400">
            {formatCents(item.costPerUnitCents)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
            / {item.unit}
          </p>
        </div>
      </div>

      {/* Restock input */}
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qty"
          min="0.1"
          step="0.1"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder:text-gray-600"
          aria-label={`Restock quantity for ${item.name}`}
        />
        <button
          onClick={() => handleRestock(0)}
          disabled={busy || !qty}
          className="px-4 py-2 rounded-xl bg-yellow-400 text-gray-900 font-bold text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Restock
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddConsumableModal
// ---------------------------------------------------------------------------

function AddConsumableModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: {
    name: string;
    unit: string;
    currentStock: number;
    lowStockThreshold: number;
    costPerUnitCents: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Quart");
  const [stock, setStock] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [cost, setCost] = useState("0.00");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onAdd({
      name,
      unit,
      currentStock: parseFloat(stock) || 0,
      lowStockThreshold: parseFloat(threshold) || 5,
      costPerUnitCents: Math.round(parseFloat(cost) * 100) || 0,
    });
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 rounded-t-3xl border border-gray-700 p-6">
        <h2 className="text-xl font-black text-white mb-4">Add Consumable</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="5W-30 Synthetic"
              required
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder:text-gray-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Unit</label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Quart"
                required
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Current Stock</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                min="0"
                step="0.1"
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Low-Stock Threshold</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min="0"
                step="0.1"
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Cost / Unit ($)</label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                min="0"
                step="0.01"
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-800 text-white font-bold text-sm hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-3 rounded-2xl bg-yellow-400 text-gray-900 font-bold text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InventoryClient — main exported component
// ---------------------------------------------------------------------------

export function InventoryClient({ initial }: { initial: ConsumableRow[] }) {
  const [items, setItems] = useState<ConsumableRow[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleRestock(id: string, qty: number) {
    const result = await restockConsumable(id, qty);
    if ("error" in result) {
      showMsg(`Error: ${result.error}`);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newStock = Math.max(0, item.currentStock + qty);
        return {
          ...item,
          currentStock: newStock,
          isLow: newStock < item.lowStockThreshold,
        };
      }),
    );
    showMsg("Stock updated ✓");
  }

  async function handleAdd(data: {
    name: string;
    unit: string;
    currentStock: number;
    lowStockThreshold: number;
    costPerUnitCents: number;
  }) {
    const result = await createConsumable(data);
    if ("error" in result) {
      showMsg(`Error: ${result.error}`);
      return;
    }
    const newItem: ConsumableRow = {
      id: result.id,
      ...data,
      isLow: data.currentStock < data.lowStockThreshold,
    };
    setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
    showMsg("Consumable added ✓");
  }

  const lowCount = items.filter((i) => i.isLow).length;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-bold shadow-xl bg-gray-700 text-white"
        >
          {toast}
        </div>
      )}

      {/* Low-stock summary banner */}
      {lowCount > 0 && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-2xl border border-red-700 bg-red-950 px-4 py-3 flex items-center gap-3"
        >
          <span className="text-red-400 text-lg">⚠</span>
          <p className="text-red-300 text-sm font-semibold">
            {lowCount} item{lowCount > 1 ? "s are" : " is"} below the low-stock
            threshold. Order now to avoid delays.
          </p>
        </div>
      )}

      {/* Grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <span className="text-6xl mb-4" aria-hidden="true">🧴</span>
          <p className="text-2xl font-black text-white mb-2">No consumables yet</p>
          <p className="text-base text-gray-400 mb-8">
            Add your first supply item to start tracking stock.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-3 rounded-2xl bg-yellow-400 text-gray-900 font-bold text-sm hover:bg-yellow-300 transition-colors"
          >
            + Add First Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-6">
          {items.map((item) => (
            <ConsumableCard key={item.id} item={item} onRestock={handleRestock} />
          ))}
        </div>
      )}

      {/* FAB */}
      {items.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full bg-yellow-400 text-gray-900 text-2xl font-black shadow-lg hover:bg-yellow-300 transition-colors flex items-center justify-center"
          aria-label="Add consumable"
        >
          +
        </button>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddConsumableModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
    </>
  );
}
