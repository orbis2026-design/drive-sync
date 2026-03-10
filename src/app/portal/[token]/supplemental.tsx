"use client";

/**
 * supplemental.tsx — Client Portal: Supplemental Change Order View (Issue #52)
 *
 * Rendered inside the Client Approval Portal when a mechanic has initiated
 * a "Broken Bolt" Change Order.  The client sees:
 *   1. The original signed contract (read-only, greyed out).
 *   2. The new DeltaQuote with only the additional parts and labour.
 *   3. A secondary signature pad requiring explicit approval before the
 *      mechanic's app unlocks the WorkOrder status.
 */

import { useRef, useState, useTransition } from "react";
import SignatureCanvas from "react-signature-canvas";
import { approveChangeOrder } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeltaPart {
  id: string;
  name: string;
  partNumber: string;
  retailPriceCents: number;
  quantity: number;
}

export interface OriginalContract {
  title: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  totalCents: number;
  signedAt?: string;
}

export interface SupplementalProps {
  workOrderId: string;
  approvalToken: string;
  originalContract: OriginalContract;
  deltaParts: DeltaPart[];
  /** Additional labour hours (decimal) added in the change order. */
  deltaLaborCents: number;
  /** Shop labour rate in cents/hour for the delta. */
  clientPhone?: string;
  onApproved?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// SupplementalChangeOrder
// ---------------------------------------------------------------------------

export function SupplementalChangeOrder({
  workOrderId,
  originalContract,
  deltaParts,
  deltaLaborCents,
  onApproved,
}: SupplementalProps) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [hasSig, setHasSig] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deltaPartsTotalCents = deltaParts.reduce(
    (s, p) => s + p.retailPriceCents * p.quantity,
    0,
  );
  const deltaTotalCents = deltaPartsTotalCents + deltaLaborCents;

  // -------------------------------------------------------------------------
  // Signature handlers
  // -------------------------------------------------------------------------

  function handleClear() {
    sigRef.current?.clear();
    setHasSig(false);
  }

  function handleSign() {
    if (!sigRef.current?.isEmpty()) {
      setHasSig(true);
    }
  }

  // -------------------------------------------------------------------------
  // Submit secondary approval
  // -------------------------------------------------------------------------

  function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSig || sigRef.current?.isEmpty()) {
      setError("Please provide your signature to approve the Change Order.");
      return;
    }
    setError(null);

    const dataUrl = sigRef.current!.toDataURL("image/png");

    startTransition(async () => {
      try {
        const result = await approveChangeOrder(workOrderId, approvalToken, dataUrl);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setApproved(true);
        onApproved?.();
      } catch {
        setError("Failed to record approval. Please try again.");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Approved confirmation
  // -------------------------------------------------------------------------

  if (approved) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">✅</div>
        <h2 className="text-xl font-black text-emerald-800 mb-2">
          Change Order Approved
        </h2>
        <p className="text-emerald-700 text-sm leading-relaxed">
          Thank you. Your mechanic has been notified and will resume work
          immediately. You will receive a final invoice upon completion.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main view
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Original contract — read-only                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-gray-50 border border-gray-200 p-5 opacity-60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            Original Signed Contract
          </h2>
          <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
            ✓ Signed
          </span>
        </div>
        <p className="text-base font-semibold text-gray-800 mb-3">
          {originalContract.title}
        </p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Labour</span>
            <span className="font-mono">{fmt(originalContract.laborCents)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Parts</span>
            <span className="font-mono">{fmt(originalContract.partsCents)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Tax</span>
            <span className="font-mono">{fmt(originalContract.taxCents)}</span>
          </div>
          <div className="flex justify-between text-gray-900 font-bold border-t border-gray-200 pt-2 mt-2">
            <span>Total (signed)</span>
            <span className="font-mono">{fmt(originalContract.totalCents)}</span>
          </div>
        </div>
        {originalContract.signedAt && (
          <p className="text-xs text-gray-400 mt-3">
            Signed {new Date(originalContract.signedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Urgent banner                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">🚨</span>
          <div>
            <h2 className="text-base font-black text-amber-800">
              URGENT: Secondary Approval Required
            </h2>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              Your mechanic has discovered an unexpected complication and has
              paused the repair. The additional work listed below requires your
              explicit written approval before the mechanic can continue.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Change Order — delta items                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">
          Change Order — Additional Work
        </h2>

        {/* Delta parts */}
        {deltaParts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Additional Parts
            </p>
            <div className="divide-y divide-gray-100">
              {deltaParts.map((p) => (
                <div key={p.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      #{p.partNumber} × {p.quantity}
                    </p>
                  </div>
                  <span className="font-mono text-gray-700 self-center">
                    {fmt(p.retailPriceCents * p.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delta labour */}
        {deltaLaborCents > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Additional Labour
            </p>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-700">Extraction / Machine shop work</span>
              <span className="font-mono text-gray-700">{fmt(deltaLaborCents)}</span>
            </div>
          </div>
        )}

        {/* Delta total */}
        <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold text-gray-900">
          <span>Change Order Total</span>
          <span className="font-mono">{fmt(deltaTotalCents)}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Signature                                                             */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleApprove} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">
          Your Signature — Change Order Approval
        </h2>
        <p className="text-xs text-gray-500 mb-4 leading-snug">
          By signing below, you authorise the additional work and additional
          charges listed above. The total authorised amount will be added to
          your final invoice.
        </p>

        <div className="rounded-xl border-2 border-gray-300 bg-gray-50 overflow-hidden mb-3">
          <SignatureCanvas
            ref={sigRef}
            canvasProps={{ className: "w-full h-36", style: { touchAction: "none" } }}
            onEnd={handleSign}
            penColor="#1e293b"
          />
        </div>

        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 rounded-xl border border-gray-200 text-gray-600 font-semibold py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !hasSig}
          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 text-sm transition-all duration-150 active:scale-95"
        >
          {isPending ? "Processing…" : "Approve Change Order & Resume Repair"}
        </button>
      </form>
    </div>
  );
}
