"use client";

import { useState, useRef, useCallback } from "react";
import { appendStepsToWorkOrder } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RepairStep = {
  step: number;
  action: string;
  notes: string;
  suggestedParts: string[];
};

// ─── Helper: read file as base64 ──────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data-URI prefix to get pure base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function VisionPage({
  params,
}: {
  params: { vehicleId: string };
}) {
  const { vehicleId } = params;

  const [preview, setPreview] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [editedSteps, setEditedSteps] = useState<RepairStep[]>([]);
  const [status, setStatus] = useState<
    "idle" | "analysing" | "done" | "appending" | "appended" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Handle image capture ──────────────────────────────────────────────────

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPreview(URL.createObjectURL(file));
      setEditedSteps([]);
      setOpenIndex(null);
      setStatus("analysing");
      setErrorMsg("");

      const fileMimeType = file.type || "image/jpeg";
      const b64 = await fileToBase64(file);

      try {
        const res = await fetch("/api/ai/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Image: b64,
            mimeType: fileMimeType,
            workOrderId: vehicleId,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error ?? "Unknown error from AI service.");
        }

        const parsed: RepairStep[] = Array.isArray(json.repairSteps)
          ? json.repairSteps
          : [];
        setEditedSteps(JSON.parse(JSON.stringify(parsed))); // deep copy for editing
        setStatus("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Unexpected error.");
        setStatus("error");
      }
    },
    [vehicleId]
  );

  // ─── Edit helpers ──────────────────────────────────────────────────────────

  const updateAction = (i: number, val: string) => {
    setEditedSteps((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], action: val };
      return next;
    });
  };

  const updateNotes = (i: number, val: string) => {
    setEditedSteps((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], notes: val };
      return next;
    });
  };

  // ─── Append to work order ─────────────────────────────────────────────────

  const appendToWorkOrder = useCallback(async () => {
    if (!editedSteps.length) return;
    setStatus("appending");

    const result = await appendStepsToWorkOrder(vehicleId, editedSteps);

    if ("error" in result) {
      setErrorMsg(result.error);
      setStatus("error");
    } else {
      setStatus("appended");
    }
  }, [editedSteps, vehicleId]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-4">
        <h1 className="text-xl font-bold tracking-tight">
          🔬 AI Visual Diagnostics
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Snap a photo of the damaged component — the AI will draft repair notes
          instantly.
        </p>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto">
        {/* Camera capture */}
        <div
          className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-2xl h-64 bg-gray-900 cursor-pointer active:scale-95 transition-transform"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Captured component"
              className="absolute inset-0 w-full h-full object-cover rounded-2xl opacity-80"
            />
          ) : (
            <>
              <span className="text-5xl mb-3">📸</span>
              <p className="text-gray-400 font-medium">Tap to snap a photo</p>
              <p className="text-xs text-gray-600 mt-1">
                Uses your device camera
              </p>
            </>
          )}
          {status === "analysing" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 rounded-2xl">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-2">⚙️</div>
                <p className="text-amber-400 font-semibold">
                  AI is analysing…
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input with camera capture */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCapture}
        />

        {/* Error state */}
        {status === "error" && (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Results accordion */}
        {status === "done" && editedSteps.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-amber-400">
              🛠 Recommended Repair Steps
            </h2>
            <p className="text-xs text-gray-500">
              Tap each step to expand and edit before appending.
            </p>

            {editedSteps.map((step, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden"
              >
                {/* Accordion header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">
                      {step.step}
                    </span>
                    <span className="font-medium text-sm">{step.action}</span>
                  </div>
                  <span className="text-gray-500 text-lg">
                    {openIndex === i ? "▲" : "▼"}
                  </span>
                </button>

                {/* Accordion body */}
                {openIndex === i && (
                  <div className="px-4 pb-4 border-t border-gray-800 space-y-3 pt-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Action
                      </label>
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        value={step.action}
                        onChange={(e) => updateAction(i, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Notes / Cause &amp; Correction
                      </label>
                      <textarea
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                        value={step.notes}
                        onChange={(e) => updateNotes(i, e.target.value)}
                      />
                    </div>
                    {step.suggestedParts.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">
                          Suggested Parts
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {step.suggestedParts.map((part, j) => (
                            <span
                              key={j}
                              className="bg-blue-900/40 border border-blue-700 text-blue-300 text-xs px-2 py-0.5 rounded-full"
                            >
                              {part}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No results from AI */}
        {status === "done" && editedSteps.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <span className="text-4xl block mb-2">🤷</span>
            The AI could not identify a damaged component. Try a clearer photo.
          </div>
        )}

        {/* Success banner */}
        {status === "appended" && (
          <div className="bg-green-900/50 border border-green-700 rounded-xl p-4 text-green-300 text-sm font-semibold text-center">
            ✅ Repair steps appended to Work Order #{vehicleId}
          </div>
        )}
      </div>

      {/* Append to Work Order CTA — fixed at bottom */}
      {(status === "done" || status === "appending") &&
        editedSteps.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950/95 backdrop-blur border-t border-gray-800">
            <button
              disabled={status === "appending"}
              onClick={appendToWorkOrder}
              className="w-full py-5 text-lg font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/30"
            >
              {status === "appending"
                ? "⏳ Appending…"
                : "📋 Append to Work Order"}
            </button>
          </div>
        )}
    </div>
  );
}
