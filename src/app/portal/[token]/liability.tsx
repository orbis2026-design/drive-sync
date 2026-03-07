"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

// ---------------------------------------------------------------------------
// LiabilityWaiverModal
//
// Displayed when a client is authorizing a repair where at least one MPI item
// was marked FAIL - SAFETY CRITICAL by the mechanic. The client must
// digitally sign a specific clause before they can approve the rest of the
// work order.
// ---------------------------------------------------------------------------

interface Props {
  /** Called when the client successfully signs the waiver. */
  onAccept: (signatureDataUrl: string) => void;
  /** Called when the client cancels (should prevent quote approval). */
  onCancel: () => void;
  /** List of safety-critical categories that were flagged (e.g. ["brakes"]). */
  failedCategories: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  fluids: "Fluid Levels",
  tires: "Tires & Wheels",
  brakes: "Brake System",
  belts: "Belts & Hoses",
};

export function LiabilityWaiverModal({
  onAccept,
  onCancel,
  failedCategories,
}: Props) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryList = failedCategories
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .join(", ");

  function handleStrokeEnd() {
    setIsSigned(!(sigRef.current?.isEmpty() ?? true));
    setError(null);
  }

  function handleClear() {
    sigRef.current?.clear();
    setIsSigned(false);
    setError(null);
  }

  function handleAccept() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("You must sign the waiver before proceeding.");
      return;
    }
    const dataUrl = sigRef.current.toDataURL("image/png");
    onAccept(dataUrl);
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waiver-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg mx-0 sm:mx-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
        {/* Warning header */}
        <div className="bg-red-600 rounded-t-3xl sm:rounded-t-3xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="white"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
              </svg>
            </div>
            <div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest">
                Safety Warning
              </p>
              <h2
                id="waiver-title"
                className="text-white text-lg font-black leading-tight"
              >
                Liability Waiver Required
              </h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Alert message */}
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
            <p className="text-red-800 text-sm font-semibold mb-1">
              Your mechanic has identified the following safety-critical
              issue{failedCategories.length > 1 ? "s" : ""}:
            </p>
            <p className="text-red-700 text-sm font-bold">{categoryList}</p>
          </div>

          {/* Waiver text */}
          <div className="text-gray-700 text-sm leading-relaxed space-y-3">
            <p className="font-semibold text-gray-900">
              VEHICLE SAFETY DISCLAIMER AND RELEASE OF LIABILITY
            </p>
            <p>
              I, the undersigned vehicle owner/authorized representative, hereby
              acknowledge that I have been advised by a licensed automotive
              technician that the above-listed component(s) of my vehicle
              present a <span className="font-bold text-red-700">safety risk</span> and
              require immediate professional repair.
            </p>
            <p>
              Despite this professional recommendation, I am choosing to
              decline the identified safety repairs at this time and elect to
              operate this vehicle in its current condition.
            </p>
            <p>
              By signing below, I acknowledge that I am operating an unsafe
              vehicle <span className="font-bold">against professional advice</span>,
              and I release the repair facility and its technicians from all
              liability for any accidents, injuries, property damage, or
              consequential losses arising from or related to the unrepaired
              safety deficiency described above.
            </p>
          </div>

          {/* Signature area */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Sign to acknowledge and continue
            </p>
            <div className="relative rounded-xl border-2 border-dashed border-red-300 bg-red-50 overflow-hidden">
              <SignatureCanvas
                ref={sigRef}
                penColor="#7f1d1d"
                canvasProps={{
                  className: "w-full block",
                  style: {
                    height: 140,
                    touchAction: "none",
                    display: "block",
                  },
                }}
                onEnd={handleStrokeEnd}
              />
              {!isSigned && (
                <p
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center text-sm text-red-300 pointer-events-none select-none"
                >
                  Sign to acknowledge
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              Clear
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium bg-red-50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!isSigned}
              className={[
                "flex-1 py-3 rounded-2xl text-sm font-bold transition-colors",
                isSigned
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed",
              ].join(" ")}
            >
              I Understand the Risk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
