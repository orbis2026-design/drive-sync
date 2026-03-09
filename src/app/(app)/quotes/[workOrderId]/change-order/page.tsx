"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { submitChangeOrder } from "../actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeltaPart {
  id: string;
  name: string;
  partNumber: string;
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
  customerSupplied: boolean;
}

type ChangeOrderState =
  | "LOCKED"              // Original quote is locked — initiate button shown
  | "BUILDING"            // Mechanic is adding delta parts
  | "SUBMITTED"           // Change order sent to client
  | "APPROVED";           // Client approved the delta

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function calcPartTotal(part: DeltaPart): number {
  const unitPrice = part.customerSupplied
    ? part.wholesalePriceCents
    : part.retailPriceCents;
  return unitPrice * part.quantity;
}

// ---------------------------------------------------------------------------
// LiabilityFlag — shown on customer-supplied parts
// ---------------------------------------------------------------------------

function LiabilityFlag() {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-danger-500/10 border border-danger-500/40 px-4 py-3">
      <span className="text-lg flex-shrink-0" aria-hidden="true">⚠️</span>
      <p className="text-xs text-danger-300 font-medium leading-snug">
        <strong className="text-danger-400">No Warranty</strong> provided for
        labor or failure of Customer-Supplied components. The customer accepts
        all liability for parts they supply.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeltaPartRow
// ---------------------------------------------------------------------------

interface DeltaPartRowProps {
  part: DeltaPart;
  onRemove: (id: string) => void;
}

function DeltaPartRow({ part, onRemove }: DeltaPartRowProps) {
  const lineTotal = calcPartTotal(part);

  return (
    <li className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {part.customerSupplied && (
              <span className="text-[10px] font-black uppercase tracking-widest text-danger-400 border border-danger-500/40 rounded px-1.5 py-0.5">
                Cust. Supplied
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-white leading-snug mt-1">
            {part.name}
          </p>
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            {part.partNumber} · Qty {part.quantity}
          </p>
          {part.customerSupplied && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              Billed at cost — retail markup removed
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          {part.customerSupplied && (
            <p className="text-[10px] text-gray-600 line-through">
              ${formatCents(part.retailPriceCents * part.quantity)}
            </p>
          )}
          <p
            className={[
              "text-base font-black",
              part.customerSupplied ? "text-danger-400" : "text-white",
            ].join(" ")}
          >
            ${formatCents(lineTotal)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(part.id)}
        className="text-[10px] text-gray-600 hover:text-danger-400 transition-colors underline"
      >
        Remove
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// AddPartForm — inline form to add a new delta part
// ---------------------------------------------------------------------------

interface AddPartFormProps {
  onAdd: (part: Omit<DeltaPart, "id">) => void;
}

function AddPartForm({ onAdd }: AddPartFormProps) {
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [wholesaleCents, setWholesaleCents] = useState("");
  const [retailCents, setRetailCents] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customerSupplied, setCustomerSupplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!name.trim() || !partNumber.trim()) {
      setError("Part name and number are required.");
      return;
    }
    const wholesale = Math.round(parseFloat(wholesaleCents || "0") * 100);
    const retail = Math.round(parseFloat(retailCents || "0") * 100);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (retail < 0 || wholesale < 0) {
      setError("Prices cannot be negative.");
      return;
    }

    setError(null);
    onAdd({
      name: name.trim(),
      partNumber: partNumber.trim(),
      wholesalePriceCents: customerSupplied ? 0 : wholesale,
      retailPriceCents: customerSupplied ? 0 : retail,
      quantity: qty,
      customerSupplied,
    });

    // Reset form
    setName("");
    setPartNumber("");
    setWholesaleCents("");
    setRetailCents("");
    setQuantity("1");
    setCustomerSupplied(false);
  }

  const inputClass =
    "w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400";

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
        Add Part / Labor to Change Order
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Part Name *</label>
          <input
            type="text"
            placeholder="e.g. Seized Rear Caliper"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Part Number *</label>
          <input
            type="text"
            placeholder="e.g. 18B4816"
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {customerSupplied ? "Cost (enter 0)" : "Wholesale Cost ($)"}
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={customerSupplied ? "" : wholesaleCents}
            disabled={customerSupplied}
            onChange={(e) => setWholesaleCents(e.target.value)}
            className={`${inputClass} ${customerSupplied ? "opacity-40 cursor-not-allowed" : ""}`}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {customerSupplied ? "Retail (N/A)" : "Retail Price ($)"}
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={customerSupplied ? "" : retailCents}
            disabled={customerSupplied}
            onChange={(e) => setRetailCents(e.target.value)}
            className={`${inputClass} ${customerSupplied ? "opacity-40 cursor-not-allowed" : ""}`}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Qty</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Customer Supplied toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={customerSupplied}
            onChange={(e) => {
              const checked = e.target.checked;
              setCustomerSupplied(checked);
              // Clear pricing fields when customer-supplied — price is $0
              if (checked) {
                setWholesaleCents("");
                setRetailCents("");
              }
            }}
          />
          <div
            className={[
              "w-10 h-6 rounded-full border-2 transition-colors duration-200",
              customerSupplied
                ? "bg-danger-500 border-danger-400"
                : "bg-gray-700 border-gray-600",
            ].join(" ")}
          />
          <div
            className={[
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
              customerSupplied ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Customer Supplied</p>
          <p className="text-xs text-gray-500">
            Price set to $0.00 · Liability flag added
          </p>
        </div>
      </label>

      {customerSupplied && <LiabilityFlag />}

      {error && (
        <p role="alert" className="text-xs text-danger-400 font-medium">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className={[
          "w-full rounded-xl py-2.5 px-4",
          "text-sm font-black uppercase tracking-widest text-gray-950",
          "bg-brand-400 hover:bg-brand-300",
          "active:scale-[0.98] transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        ].join(" ")}
      >
        + Add to Change Order
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChangeOrderPage — main client component
// ---------------------------------------------------------------------------

export default function ChangeOrderPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = use(params);

  const [coState, setCoState] = useState<ChangeOrderState>("LOCKED");
  const [deltaParts, setDeltaParts] = useState<DeltaPart[]>([]);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasCustomerSupplied = deltaParts.some((p) => p.customerSupplied);

  const deltaTotal = deltaParts.reduce(
    (sum, p) => sum + calcPartTotal(p),
    0,
  );
  const deltaTax = Math.round(deltaTotal * 0.0875);
  const deltaGrandTotal = deltaTotal + deltaTax;

  function handleAddPart(part: Omit<DeltaPart, "id">) {
    setDeltaParts((prev) => [
      ...prev,
      { ...part, id: crypto.randomUUID() },
    ]);
  }

  function handleRemovePart(id: string) {
    setDeltaParts((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSubmitChangeOrder() {
    if (deltaParts.length === 0) {
      setSubmitError("Add at least one part or labor item before submitting.");
      return;
    }
    setSubmitError(null);

    startSubmitTransition(async () => {
      try {
        const result = await submitChangeOrder(workOrderId, deltaParts);
        if ("error" in result) {
          setSubmitError(result.error);
          return;
        }
        setCoState("SUBMITTED");
      } catch {
        setSubmitError(
          "Failed to send change order. Please try again.",
        );
      }
    });
  }

  // ── LOCKED state: show the locked original quote notice ──────────────────
  if (coState === "LOCKED") {
    return (
      <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">
              Change Order
            </h1>
            <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest mt-1">
              WO · {workOrderId}
            </p>
          </div>

          {/* Locked original quote notice */}
          <div className="rounded-2xl border-2 border-brand-400/40 bg-brand-400/5 px-5 py-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">🔒</span>
              <div>
                <p className="text-base font-black text-brand-400">
                  Original Quote Locked
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  This Work Order has been approved. The original quote cannot
                  be modified.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              If you discovered additional broken components during the repair,
              initiate a Change Order below. A new SMS approval link will be
              sent to the client.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCoState("BUILDING")}
            className={[
              "w-full min-h-[64px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest text-gray-950",
              "bg-brand-400",
              "shadow-[0_0_32px_8px_rgba(250,204,21,0.4)]",
              "hover:bg-brand-300 hover:shadow-[0_0_48px_12px_rgba(250,204,21,0.55)]",
              "active:scale-[0.98] transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
            ].join(" ")}
          >
            Initiate Change Order →
          </button>

          <Link
            href={`/quotes/${workOrderId}`}
            className="block text-center text-sm text-gray-500 hover:text-gray-400 underline underline-offset-2"
          >
            ← Back to original quote
          </Link>
        </div>
      </div>
    );
  }

  // ── SUBMITTED state ───────────────────────────────────────────────────────
  if (coState === "SUBMITTED") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-12 text-center">
        <div className="text-6xl mb-6" aria-hidden="true">📨</div>
        <h1 className="text-3xl font-black text-white mb-3">
          Change Order Sent
        </h1>
        <p className="text-gray-400 text-base max-w-sm leading-relaxed">
          An SMS has been sent to the client with a link to review and approve
          the additional work. This Work Order is now{" "}
          <strong className="text-brand-400">BLOCKED — WAITING APPROVAL</strong>
          .
        </p>
        <div className="mt-6 rounded-2xl bg-gray-900 border border-gray-700 px-6 py-4 text-left w-full max-w-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            Change Order Summary
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Parts ({deltaParts.length} items)</span>
              <span className="text-white font-bold">${formatCents(deltaTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Tax (8.75%)</span>
              <span className="text-white font-bold">${formatCents(deltaTax)}</span>
            </div>
            <div className="flex justify-between text-base border-t border-gray-700 pt-2 mt-2">
              <span className="text-gray-400 font-bold">Delta Total</span>
              <span className="text-brand-400 font-black">${formatCents(deltaGrandTotal)}</span>
            </div>
          </div>
        </div>
        <Link
          href={`/jobs`}
          className="mt-6 text-sm text-gray-500 hover:text-gray-400 underline underline-offset-2"
        >
          ← Back to Jobs Board
        </Link>
      </div>
    );
  }

  // ── BUILDING state: mechanic adds delta parts ─────────────────────────────
  return (
    <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+80px)]">
      <div className="mx-auto max-w-lg space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-brand-400/20 text-brand-400 px-3 py-1 text-xs font-black uppercase tracking-wide">
              Δ Change Order
            </span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Delta Quote
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            These items will be presented to the client as additional work
            requiring approval.
          </p>
          <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest mt-1">
            WO · {workOrderId}
          </p>
        </div>

        {/* Customer-supplied liability warning */}
        {hasCustomerSupplied && (
          <LiabilityFlag />
        )}

        {/* Delta parts ledger */}
        {deltaParts.length > 0 ? (
          <section aria-labelledby="delta-parts-heading">
            <h2
              id="delta-parts-heading"
              className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
            >
              Delta Parts · {deltaParts.length} line
              {deltaParts.length !== 1 ? "s" : ""}
            </h2>
            <ul className="space-y-2">
              {deltaParts.map((p) => (
                <DeltaPartRow
                  key={p.id}
                  part={p}
                  onRemove={handleRemovePart}
                />
              ))}
            </ul>
          </section>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-gray-700 bg-gray-900/50 px-5 py-10 text-center">
            <p className="text-2xl" aria-hidden="true">🔩</p>
            <p className="text-sm font-bold text-white mt-2">
              No delta parts yet
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Add the newly discovered broken components below.
            </p>
          </div>
        )}

        {/* Add part form */}
        <AddPartForm onAdd={handleAddPart} />

        {/* Delta totals */}
        {deltaParts.length > 0 && (
          <div className="rounded-2xl bg-gray-900 border border-gray-700 px-5 py-4 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Delta Totals
            </h2>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Parts</span>
              <span className="text-white font-bold">${formatCents(deltaTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Tax (8.75%)</span>
              <span className="text-white font-bold">${formatCents(deltaTax)}</span>
            </div>
            <div className="flex justify-between text-base border-t border-gray-700 pt-2">
              <span className="text-gray-400 font-bold">Delta Total</span>
              <span
                className="text-brand-400 font-black"
                style={{ textShadow: "0 0 12px rgba(250,204,21,0.5)" }}
              >
                ${formatCents(deltaGrandTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Submit change order */}
        <div className="space-y-3">
          {submitError && (
            <p role="alert" className="text-sm text-danger-400 font-medium text-center">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmitChangeOrder}
            disabled={isSubmitting || deltaParts.length === 0}
            className={[
              "w-full min-h-[64px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest text-gray-950",
              "bg-brand-400",
              "shadow-[0_0_32px_8px_rgba(250,204,21,0.4)]",
              "hover:bg-brand-300 hover:shadow-[0_0_48px_12px_rgba(250,204,21,0.55)]",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
            ].join(" ")}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-3">
                <span className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Sending…
              </span>
            ) : (
              "Send Change Order to Client →"
            )}
          </button>

          <p className="text-center text-xs text-gray-600">
            Client will receive an SMS: &ldquo;Your mechanic discovered an issue
            that requires your approval to proceed.&rdquo; Work Order will be
            set to <strong className="text-gray-500">BLOCKED — WAITING APPROVAL</strong>.
          </p>

          <button
            type="button"
            onClick={() => setCoState("LOCKED")}
            className="w-full text-sm text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors"
          >
            ← Cancel Change Order
          </button>
        </div>
      </div>
    </div>
  );
}
