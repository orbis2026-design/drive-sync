"use client";

import { useState, useTransition } from "react";
import {
  checkLiveInventory,
  executePurchaseOrder,
  fetchActiveWorkOrders,
  getPartsForCategory,
} from "./actions";
import type { ActiveWorkOrderSummary } from "./schemas";
import type { SupplierPart } from "@/lib/supplier-api";

// ---------------------------------------------------------------------------
// Static vehicle + category data (would come from DB in full production)
// ---------------------------------------------------------------------------

const VEHICLE_YEARS = Array.from({ length: 37 }, (_, i) => 2026 - i);

const VEHICLE_MAKES = [
  "Toyota",
  "Honda",
  "Ford",
  "Chevrolet",
  "BMW",
  "Nissan",
  "Hyundai",
  "Kia",
  "Jeep",
  "RAM",
];

const VEHICLE_MODELS: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "RAV4", "Tacoma", "4Runner", "Highlander"],
  Honda: ["Accord", "Civic", "CR-V", "Pilot", "Odyssey"],
  Ford: ["F-150", "Escape", "Explorer", "Mustang", "Edge"],
  Chevrolet: ["Silverado", "Equinox", "Traverse", "Malibu", "Colorado"],
  BMW: ["3 Series", "5 Series", "X3", "X5", "X1"],
  Nissan: ["Altima", "Sentra", "Rogue", "Pathfinder", "Frontier"],
  Hyundai: ["Elantra", "Tucson", "Santa Fe", "Sonata"],
  Kia: ["Sorento", "Sportage", "Telluride", "Forte"],
  Jeep: ["Grand Cherokee", "Wrangler", "Cherokee", "Compass"],
  RAM: ["1500", "2500", "ProMaster"],
};

const PART_CATEGORIES: Record<string, string[]> = {
  Brakes: ["Rotors", "Pads — Ceramic", "Pads — Semi-Metallic", "Calipers"],
  Engine: ["Filters", "Ignition", "Belts & Hoses", "Gaskets"],
  Suspension: ["Shocks & Struts", "Control Arms", "Ball Joints"],
  Steering: ["Tie Rods", "Rack & Pinion", "Power Steering"],
  Electrical: ["Sensors", "Alternators", "Starters", "Batteries"],
  Cooling: ["Water Pumps", "Thermostats", "Radiators", "Hoses"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectedVehicle {
  year: number;
  make: string;
  model: string;
  vin?: string;
}

interface CartItem extends Omit<SupplierPart, "inStock"> {
  qty: number;
  inStock: boolean | null; // null = not yet checked
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepHeader({
  num,
  label,
  done,
}: {
  num: number;
  label: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          done
            ? "bg-green-500 text-black"
            : "bg-gray-700 text-gray-300 border border-gray-600"
        }`}
      >
        {done ? "✓" : num}
      </div>
      <span
        className={`font-semibold text-sm ${done ? "text-green-400" : "text-gray-200"}`}
      >
        {label}
      </span>
    </div>
  );
}

function InventoryBadge({ inStock }: { inStock: boolean | null }) {
  if (inStock === null)
    return (
      <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full">
        Check Stock
      </span>
    );
  return inStock ? (
    <span className="text-xs bg-green-900/40 border border-green-700 text-green-400 px-2 py-0.5 rounded-full">
      ✓ In Stock
    </span>
  ) : (
    <span className="text-xs bg-red-900/40 border border-red-700 text-red-400 px-2 py-0.5 rounded-full">
      ✗ Out of Stock
    </span>
  );
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

// ---------------------------------------------------------------------------
// Main catalog client component
// ---------------------------------------------------------------------------

export default function PartsCatalogClient() {
  // -- Vehicle selection --
  const [vehicle, setVehicle] = useState<Partial<SelectedVehicle>>({});

  // -- Category tree --
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  // -- Parts list --
  const [parts, setParts] = useState<SupplierPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

  // -- Cart --
  const [cart, setCart] = useState<CartItem[]>([]);

  // -- "Pull from Active Job" modal state (Issue #108) --
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [activeJobs, setActiveJobs] = useState<ActiveWorkOrderSummary[]>([]);
  const [jobPickerLoading, setJobPickerLoading] = useState(false);
  const [jobPickerError, setJobPickerError] = useState<string | null>(null);

  // -- UI state --
  const [toast, setToast] = useState<string | null>(null);
  const [poResult, setPoResult] = useState<{
    poNumber: string;
    estimatedReadyAt: string;
    deliveryType: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const vehicleComplete =
    !!vehicle.year && !!vehicle.make && !!vehicle.model;

  // -- Helpers --

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  /** Opens the "Pull from Active Job" panel and loads active work orders. */
  async function handleOpenJobPicker() {
    setShowJobPicker(true);
    setJobPickerError(null);
    setJobPickerLoading(true);
    const res = await fetchActiveWorkOrders();
    setJobPickerLoading(false);
    if ("error" in res) {
      setJobPickerError(res.error);
    } else {
      setActiveJobs(res.data);
    }
  }

  /** Auto-fills the vehicle form fields from the selected work order. */
  function handleSelectJob(job: ActiveWorkOrderSummary) {
    setVehicle({
      year: job.vehicle.year,
      make: job.vehicle.make,
      model: job.vehicle.model,
      vin: job.vehicle.vin ?? undefined,
    });
    setParts([]);
    setSelectedCategory(null);
    setSelectedSub(null);
    setShowJobPicker(false);
    showToast(
      `Filled from: ${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`,
    );
  }

  async function handleSelectSub(category: string, sub: string) {
    setSelectedCategory(category);
    setSelectedSub(sub);
    setParts([]);
    setPartsLoading(true);
    const res = await getPartsForCategory(
      category,
      sub,
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.vin,
    );
    setPartsLoading(false);
    if ("error" in res) {
      showToast(res.error);
    } else {
      setParts(res.parts);
    }
  }

  function addToCart(part: SupplierPart) {
    setCart((prev) => {
      const existing = prev.find((c) => c.partNumber === part.partNumber);
      if (existing) {
        return prev.map((c) =>
          c.partNumber === part.partNumber ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [...prev, { ...part, qty: 1, inStock: null }];
    });
    showToast(`${part.name} added to order.`);
  }

  function removeFromCart(partNumber: string) {
    setCart((prev) => prev.filter((c) => c.partNumber !== partNumber));
  }

  async function handleInventoryCheck(partNumber: string) {
    const res = await checkLiveInventory(partNumber);
    if ("error" in res) {
      showToast(res.error);
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.partNumber === partNumber
          ? { ...c, inStock: res.inStock }
          : c,
      ),
    );
    showToast(
      res.inStock
        ? `✓ ${partNumber}: ${res.qty} units in stock (~${res.etaMinutes} min eta)`
        : `✗ ${partNumber} is out of stock at the local warehouse.`,
    );
  }

  function handleExecutePO(deliveryType: "WILL_CALL" | "DELIVERY") {
    if (cart.length === 0) return;
    const anyOutOfStock = cart.some((c) => c.inStock === false);
    if (anyOutOfStock) {
      showToast("Remove out-of-stock items before placing the order.");
      return;
    }
    startTransition(async () => {
      const res = await executePurchaseOrder(
        cart.map((c) => ({
          partNumber: c.partNumber,
          qty: c.qty,
          wholesalePriceCents: c.wholesalePriceCents,
        })),
        deliveryType,
      );
      if ("error" in res) {
        showToast(res.error);
      } else {
        setPoResult({
          poNumber: res.poNumber,
          estimatedReadyAt: res.estimatedReadyAt,
          deliveryType,
        });
        setCart([]);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-32">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-600 text-sm text-white px-4 py-2 rounded-xl shadow-2xl max-w-xs text-center">
          {toast}
        </div>
      )}

      {/* ── "Pull from Active Job" slide-out modal (Issue #108) ── */}
      {showJobPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setShowJobPicker(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base text-white">
                Active Work Orders
              </h2>
              <button
                onClick={() => setShowJobPicker(false)}
                className="text-gray-500 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {jobPickerLoading && (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-brand-400 rounded-full" />
                Loading active jobs…
              </div>
            )}

            {jobPickerError && (
              <p className="text-red-400 text-sm">{jobPickerError}</p>
            )}

            {!jobPickerLoading && !jobPickerError && activeJobs.length === 0 && (
              <p className="text-gray-500 text-sm py-4 text-center">
                No active work orders found.
              </p>
            )}

            {!jobPickerLoading && !jobPickerError && activeJobs.length > 0 && (
              <ul className="overflow-y-auto space-y-2">
                {activeJobs.map((job) => (
                  <li key={job.id}>
                    <button
                      onClick={() => handleSelectJob(job)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-brand-400/50 rounded-xl p-3 transition-colors"
                    >
                      <p className="font-semibold text-sm text-white truncate">
                        {job.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {job.vehicle.year} {job.vehicle.make}{" "}
                        {job.vehicle.model}
                        {job.vehicle.vin
                          ? ` · VIN ${job.vehicle.vin}`
                          : ""}
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-500 uppercase tracking-wide">
                        {job.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* PO Success overlay */}
      {poResult && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-green-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-green-400 mb-2">
              Purchase Order Confirmed
            </h2>
            <p className="text-gray-400 text-sm mb-1">PO #{poResult.poNumber}</p>
            <p className="text-gray-400 text-sm mb-4 capitalize">
              {poResult.deliveryType === "WILL_CALL"
                ? "Ready for Will Call pickup"
                : "En route for delivery"}
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Est. ready:{" "}
              {new Date(poResult.estimatedReadyAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <button
              onClick={() => setPoResult(null)}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* ── Step 1: Select Vehicle ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <StepHeader
            num={1}
            label="Select Vehicle"
            done={vehicleComplete}
          />

          {/* Pull from Active Job button (Issue #108) */}
          <button
            onClick={handleOpenJobPicker}
            className="w-full mb-4 flex items-center justify-center gap-2 bg-brand-400/10 hover:bg-brand-400/20 border border-brand-400/40 text-brand-400 font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            <span>⚡</span> Pull from Active Job
          </button>

          <div className="grid grid-cols-3 gap-3">
            {/* Year */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Year</label>
              <select
                value={vehicle.year ?? ""}
                onChange={(e) => {
                  setVehicle({ year: Number(e.target.value) });
                  setParts([]);
                  setSelectedCategory(null);
                  setSelectedSub(null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-400"
              >
                <option value="">Year</option>
                {VEHICLE_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Make */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Make</label>
              <select
                value={vehicle.make ?? ""}
                onChange={(e) => {
                  setVehicle((prev) => ({
                    ...prev,
                    make: e.target.value,
                    model: undefined,
                  }));
                  setParts([]);
                  setSelectedCategory(null);
                  setSelectedSub(null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-400"
              >
                <option value="">Make</option>
                {VEHICLE_MAKES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Model
              </label>
              <select
                value={vehicle.model ?? ""}
                onChange={(e) => {
                  setVehicle((prev) => ({ ...prev, model: e.target.value }));
                  setParts([]);
                  setSelectedCategory(null);
                  setSelectedSub(null);
                }}
                disabled={!vehicle.make}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-400 disabled:opacity-50"
              >
                <option value="">Model</option>
                {(vehicle.make ? VEHICLE_MODELS[vehicle.make] ?? [] : []).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* VIN — optional text input (Issue #107) */}
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">
              VIN <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={vehicle.vin ?? ""}
              onChange={(e) =>
                setVehicle((prev) => ({
                  ...prev,
                  vin: e.target.value.trim() || undefined,
                }))
              }
              maxLength={17}
              placeholder="17-character VIN for exact fitment"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-400 font-mono uppercase"
            />
          </div>

          {vehicleComplete && (
            <p className="mt-3 text-xs text-brand-400 font-medium">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.vin ? ` · VIN ${vehicle.vin}` : ""} — fitment confirmed
            </p>
          )}
        </div>

        {/* ── Step 2: Browse Categories ── */}
        <div
          className={`bg-gray-900 rounded-2xl p-5 border border-gray-800 transition-opacity ${
            vehicleComplete ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          <StepHeader
            num={2}
            label="Browse Parts"
            done={!!selectedSub}
          />

          <div className="space-y-3">
            {Object.entries(PART_CATEGORIES).map(([cat, subs]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                  {cat}
                </p>
                <div className="flex flex-wrap gap-2">
                  {subs.map((sub) => {
                    const active =
                      selectedCategory === cat && selectedSub === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => handleSelectSub(cat, sub)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          active
                            ? "bg-brand-400 border-brand-400 text-black font-semibold"
                            : "border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
                        }`}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 3: Parts List ── */}
        {(partsLoading || parts.length > 0) && (
          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <StepHeader
              num={3}
              label={`${selectedCategory} › ${selectedSub}`}
              done={cart.length > 0}
            />

            {partsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-brand-400 rounded-full" />
                Querying supplier inventory…
              </div>
            ) : (
              <div className="space-y-3">
                {parts.map((part) => (
                  <div
                    key={part.partNumber}
                    className="flex items-start justify-between gap-3 bg-gray-800/60 border border-gray-700 rounded-xl p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-white truncate">
                        {part.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {part.brand} · #{part.partNumber}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">
                          Cost {formatCents(part.wholesalePriceCents)}
                        </span>
                        <span className="text-xs font-semibold text-white">
                          Retail {formatCents(part.retailPriceCents)}
                        </span>
                        <span className="text-xs text-gray-500">
                          ~{part.etaMinutes} min
                        </span>
                        {/* Supplier source badge */}
                        <a
                          href={part.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
                          title={`View on ${part.source}`}
                        >
                          {part.source}
                        </a>
                        {/* Availability badge */}
                        {part.availabilityType === "SAME_DAY" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 border border-green-700 text-green-400 font-semibold">
                            Same Day
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700 text-amber-400 font-semibold">
                            Order Only
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => addToCart(part)}
                      className="shrink-0 bg-brand-400 hover:bg-brand-300 text-black text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Order Cart ── */}
        {cart.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <StepHeader num={4} label="Order Cart" done={false} />

            <div className="space-y-3 mb-4">
              {cart.map((item) => (
                <div
                  key={item.partNumber}
                  className={`flex items-center gap-3 border rounded-xl p-3 ${
                    item.inStock === false
                      ? "border-red-800 bg-red-900/10"
                      : "border-gray-700 bg-gray-800/60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      #{item.partNumber} · Qty {item.qty}
                    </p>
                    <div className="mt-1">
                      <InventoryBadge inStock={item.inStock} />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-bold text-white">
                      {formatCents(item.retailPriceCents * item.qty)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleInventoryCheck(item.partNumber)}
                        className="text-xs border border-sky-700 text-sky-400 hover:bg-sky-900/30 px-2 py-1 rounded-lg transition-colors"
                      >
                        Check
                      </button>
                      <button
                        onClick={() => removeFromCart(item.partNumber)}
                        className="text-xs border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-700 px-2 py-1 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-gray-800 pt-3 mb-4">
              <div className="flex justify-between text-sm text-gray-400">
                <span>Wholesale</span>
                <span>
                  {formatCents(
                    cart.reduce(
                      (s, c) => s + c.wholesalePriceCents * c.qty,
                      0,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-white mt-1">
                <span>Retail Total</span>
                <span>
                  {formatCents(
                    cart.reduce(
                      (s, c) => s + c.retailPriceCents * c.qty,
                      0,
                    ),
                  )}
                </span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExecutePO("WILL_CALL")}
                disabled={isPending}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                🏪 Will Call
              </button>
              <button
                onClick={() => handleExecutePO("DELIVERY")}
                disabled={isPending}
                className="flex-1 bg-brand-400 hover:bg-brand-300 text-black text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {isPending ? "Placing…" : "🚚 Delivery"}
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center mt-2">
              Execute Purchase Order — triggered on client quote approval
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
