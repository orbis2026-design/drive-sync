"use client";

/**
 * /quotes/[workOrderId]/supplemental — "Broken Bolt" Supplemental Change Order (Issue #52)
 *
 * When a mechanic discovers an unexpected complication mid-repair (e.g. a
 * snapped bolt, a seized GDI injector, hidden rust damage), the original
 * signed contract is no longer sufficient. This page implements the strict
 * "Pause & Delta Quote" workflow:
 *
 *   1. Available only when WorkOrder status is APPROVED (COMPLETE) or IN_PROGRESS (ACTIVE).
 *   2. Displays the original signed contract for reference.
 *   3. Allows the mechanic to add ONLY the newly required parts and additional
 *      extraction / machine-shop labour.
 *   4. Generates a DeltaQuote (stored in `delta_parts_json`) and sends an
 *      urgent SMS to the client.
 *   5. Locks the main WorkOrder to BLOCKED_WAITING_APPROVAL until the client
 *      approves the change order via the portal.
 */

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { submitSupplementalChangeOrder } from "../actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeltaPart {
  id: string;
  name: string;
  partNumber: string;
  retailPriceCents: number;
  quantity: number;
}

interface LaborAddition {
  id: string;
  description: string;
  hours: number;
  rateCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// SupplementalClient
// ---------------------------------------------------------------------------

export default function SupplementalClient({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = use(params);

  const [deltaParts, setDeltaParts] = useState<DeltaPart[]>([]);
  const [laborAdditions, setLaborAdditions] = useState<LaborAddition[]>([]);
  const [newPart, setNewPart] = useState({ name: "", partNumber: "", price: "", qty: "1" });
  const [newLabor, setNewLabor] = useState({ description: "", hours: "", rate: "110" });
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Parts management
  // -------------------------------------------------------------------------

  function addPart() {
    const price = Math.round(parseFloat(newPart.price || "0") * 100);
    const qty = Math.max(1, parseInt(newPart.qty || "1", 10));
    if (!newPart.name.trim() || price <= 0) return;

    setDeltaParts((prev) => [
      ...prev,
      {
        id: uid(),
        name: newPart.name.trim(),
        partNumber: newPart.partNumber.trim() || "TBD",
        retailPriceCents: price,
        quantity: qty,
      },
    ]);
    setNewPart({ name: "", partNumber: "", price: "", qty: "1" });
  }

  function removePart(id: string) {
    setDeltaParts((prev) => prev.filter((p) => p.id !== id));
  }

  // -------------------------------------------------------------------------
  // Labour management
  // -------------------------------------------------------------------------

  function addLabor() {
    const hours = parseFloat(newLabor.hours || "0");
    const rate = Math.round(parseFloat(newLabor.rate || "110") * 100);
    if (!newLabor.description.trim() || hours <= 0) return;

    setLaborAdditions((prev) => [
      ...prev,
      {
        id: uid(),
        description: newLabor.description.trim(),
        hours,
        rateCents: rate,
      },
    ]);
    setNewLabor({ description: "", hours: "", rate: "110" });
  }

  function removeLabor(id: string) {
    setLaborAdditions((prev) => prev.filter((l) => l.id !== id));
  }

  // -------------------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------------------

  const deltaPartsTotalCents = deltaParts.reduce(
    (s, p) => s + p.retailPriceCents * p.quantity,
    0,
  );
  const deltaLaborTotalCents = laborAdditions.reduce(
    (s, l) => s + Math.round(l.hours * l.rateCents),
    0,
  );
  const deltaTotalCents = deltaPartsTotalCents + deltaLaborTotalCents;

  // -------------------------------------------------------------------------
  // Submit change order
  // -------------------------------------------------------------------------

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (deltaParts.length === 0 && laborAdditions.length === 0) {
      setError("Add at least one part or labour item before submitting.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const result = await submitSupplementalChangeOrder(
          workOrderId,
          deltaParts,
          laborAdditions,
        );
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit change order. Please try again.");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Submitted confirmation
  // -------------------------------------------------------------------------

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-10 pb-24 text-center">
        <div className="text-6xl mb-4" aria-hidden="true">📨</div>
        <h1 className="text-2xl font-black text-white mb-2">
          Change Order Submitted
        </h1>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          An urgent SMS has been dispatched to the client requesting their
          approval. The job is now{" "}
          <strong className="text-amber-400">paused</strong> until they sign the
          Change Order in the portal.
        </p>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4 text-sm text-amber-300 font-medium mb-6 text-left">
          <p className="font-bold text-amber-200 mb-1">SMS Sent to Client:</p>
          <p className="italic">
            &quot;URGENT: Your mechanic discovered a secondary issue requiring
            your approval to proceed with the repair. Please review and sign the
            Change Order to continue service.&quot;
          </p>
        </div>
        <Link
          href={`/quotes/${workOrderId}`}
          className="inline-block rounded-xl bg-brand-500 text-black font-black px-6 py-3 text-sm hover:bg-brand-400 transition-colors"
        >
          Return to Work Order
        </Link>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main UI
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/quotes/${workOrderId}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3 inline-block"
        >
          ← Back to Work Order
        </Link>
        <div className="flex items-start gap-3">
          <span className="text-4xl" aria-hidden="true">🔩</span>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Initiate Change Order
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Add ONLY the newly required parts and additional labour. The
              original signed contract remains unchanged.
            </p>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-red-500/10 border border-red-500/40 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <span className="text-2xl flex-shrink-0" aria-hidden="true">⚠️</span>
        <div>
          <p className="text-sm text-red-300 font-bold mb-1">
            Original Contract is Suspended
          </p>
          <p className="text-xs text-red-400/80 leading-snug">
            The job is paused. You may not resume work until the client approves
            this Change Order via their portal link. The original signed quote
            cannot be modified.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Delta Parts                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">
            Additional Parts Required
          </h2>

          {/* Existing delta parts */}
          {deltaParts.length > 0 && (
            <div className="space-y-2 mb-4">
              {deltaParts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      #{p.partNumber} · qty {p.quantity} ·{" "}
                      {formatCents(p.retailPriceCents * p.quantity)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePart(p.id)}
                    className="ml-3 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                    aria-label={`Remove ${p.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add part form */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Part name"
              value={newPart.name}
              onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
              className="col-span-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
            />
            <input
              type="text"
              placeholder="Part # (optional)"
              value={newPart.partNumber}
              onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })}
              className="rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
            />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  value={newPart.price}
                  onChange={(e) => setNewPart({ ...newPart, price: e.target.value })}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
              <input
                type="number"
                min="1"
                placeholder="Qty"
                value={newPart.qty}
                onChange={(e) => setNewPart({ ...newPart, qty: e.target.value })}
                className="w-16 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm text-center focus:outline-none focus:border-brand-400"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={addPart}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-700 hover:border-brand-400 text-gray-500 hover:text-brand-400 py-2 text-sm transition-colors"
          >
            + Add Part
          </button>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Delta Labour                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">
            Additional Labour / Machine Shop
          </h2>

          {/* Existing labour additions */}
          {laborAdditions.length > 0 && (
            <div className="space-y-2 mb-4">
              {laborAdditions.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{l.description}</p>
                    <p className="text-xs text-gray-500">
                      {l.hours}h @ {formatCents(l.rateCents)}/hr ={" "}
                      {formatCents(Math.round(l.hours * l.rateCents))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLabor(l.id)}
                    className="ml-3 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                    aria-label={`Remove ${l.description}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add labour form */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Labour description (e.g. Broken bolt extraction)"
              value={newLabor.description}
              onChange={(e) => setNewLabor({ ...newLabor, description: e.target.value })}
              className="col-span-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="Hours"
                value={newLabor.hours}
                onChange={(e) => setNewLabor({ ...newLabor, hours: e.target.value })}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              />
              <span className="text-gray-500 text-xs flex-shrink-0">hrs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm flex-shrink-0">$</span>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="Rate/hr"
                value={newLabor.rate}
                onChange={(e) => setNewLabor({ ...newLabor, rate: e.target.value })}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              />
              <span className="text-gray-500 text-xs flex-shrink-0">/hr</span>
            </div>
          </div>
          <button
            type="button"
            onClick={addLabor}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-700 hover:border-brand-400 text-gray-500 hover:text-brand-400 py-2 text-sm transition-colors"
          >
            + Add Labour
          </button>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Delta total                                                         */}
        {/* ---------------------------------------------------------------- */}
        {(deltaParts.length > 0 || laborAdditions.length > 0) && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Additional parts</span>
              <span className="font-mono">{formatCents(deltaPartsTotalCents)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Additional labour</span>
              <span className="font-mono">{formatCents(deltaLaborTotalCents)}</span>
            </div>
            <div className="flex justify-between text-white font-bold border-t border-gray-800 pt-2 mt-2">
              <span>Change Order Total</span>
              <span className="font-mono">{formatCents(deltaTotalCents)}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending || (deltaParts.length === 0 && laborAdditions.length === 0)}
          className="w-full rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 text-sm transition-all duration-150 active:scale-95"
        >
          {isPending ? "Submitting…" : "Submit Change Order & Pause Job"}
        </button>

        <p className="text-center text-xs text-gray-600">
          An urgent SMS will be sent to the client requesting approval before
          any additional work proceeds.
        </p>
      </form>
    </div>
  );
}
