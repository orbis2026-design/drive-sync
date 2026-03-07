"use client";

/**
 * /expenses/ocr — AI Expense & Dashboard OCR (Issue #48)
 *
 * Fast camera UI for capturing:
 *   - Paper receipts  → extracts vendor, total, and line items
 *   - Dashboard photo → identifies illuminated warning lights
 *
 * The image is sent to POST /api/ai/ocr which uses the OpenAI Vision API.
 * The parsed result is rendered in an editable form so the mechanic can
 * verify before saving to the Expenses table.
 */

import { useCallback, useRef, useState } from "react";
import { confirmExpense } from "../actions";
import type { OcrResult, LineItem } from "@/app/api/ai/ocr/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix: "data:<type>;base64,"
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Line item row (editable)
// ---------------------------------------------------------------------------

function LineItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (index: number, field: keyof LineItem, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={item.description}
        onChange={(e) => onChange(index, "description", e.target.value)}
        placeholder="Item description"
        className="flex-1 rounded-xl bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-400"
      />
      <input
        type="number"
        value={item.amount}
        onChange={(e) => onChange(index, "amount", e.target.value)}
        placeholder="0.00"
        step="0.01"
        min="0"
        className="w-24 rounded-xl bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white text-right placeholder-gray-600 focus:outline-none focus:border-brand-400"
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        aria-label="Remove line item"
        className="text-gray-600 hover:text-danger-400 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExpensesOcrPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  // Editable receipt fields
  const [vendor, setVendor] = useState("");
  const [total, setTotal] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Dashboard fields
  const [warningLights, setWarningLights] = useState<string[]>([]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Capture / analyse ──────────────────────────────────────────────────────

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPreviewUrl(URL.createObjectURL(file));
      setIsAnalysing(true);
      setAnalyseError(null);
      setResult(null);
      setSaved(false);

      try {
        const base64Image = await toBase64(file);
        const res = await fetch("/api/ai/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64Image, mimeType: file.type || "image/jpeg" }),
        });

        const json = await res.json() as { result?: OcrResult; error?: string };

        if (!res.ok || json.error) {
          throw new Error(json.error ?? "Analysis failed.");
        }

        const ocrResult = json.result!;
        setResult(ocrResult);

        if (ocrResult.type === "receipt") {
          setVendor(ocrResult.vendor ?? "");
          setTotal(ocrResult.total != null ? String(ocrResult.total) : "");
          setLineItems(ocrResult.line_items ?? []);
        } else {
          setWarningLights(ocrResult.warning_lights ?? []);
        }
      } catch (err) {
        setAnalyseError(
          err instanceof Error ? err.message : "Analysis failed. Please try again."
        );
      } finally {
        setIsAnalysing(false);
        // Reset the input so the same file can be re-selected.
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    []
  );

  // ── Line item helpers ──────────────────────────────────────────────────────

  function handleLineItemChange(index: number, field: keyof LineItem, value: string) {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, [field]: field === "amount" ? parseFloat(value) || 0 : value }
          : item
      )
    );
  }

  function handleLineItemRemove(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddLineItem() {
    setLineItems((prev) => [...prev, { description: "", amount: 0 }]);
  }

  // ── Save expense ───────────────────────────────────────────────────────────

  async function handleSave() {
    if (result?.type !== "receipt") return;
    const amount = parseFloat(total);
    if (!vendor.trim() || isNaN(amount) || amount <= 0) return;

    setIsSaving(true);
    setSaveError(null);

    const saveResult = await confirmExpense({
      amount,
      vendor: vendor.trim(),
      category: "Parts",
      receiptImageUrl: null,
    });

    if ("error" in saveResult) {
      setSaveError(saveResult.error);
    } else {
      setSaved(true);
    }

    setIsSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+80px)]">
      <div className="mx-auto max-w-lg space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            AI OCR Scanner
          </h1>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            Point your camera at a receipt or dashboard to auto-fill the form.
          </p>
        </div>

        {/* Camera capture */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="sr-only"
            aria-label="Capture image"
            id="ocr-capture"
          />
          <label
            htmlFor="ocr-capture"
            className={[
              "flex flex-col items-center justify-center gap-3",
              "min-h-[160px] rounded-2xl border-2 border-dashed cursor-pointer",
              "transition-colors duration-200",
              isAnalysing
                ? "border-brand-400 bg-brand-400/10"
                : "border-gray-700 bg-gray-900 hover:border-gray-500",
            ].join(" ")}
          >
            {isAnalysing ? (
              <>
                <span className="h-10 w-10 rounded-full border-4 border-brand-400 border-t-transparent animate-spin" />
                <p className="text-sm font-bold text-brand-400">Analysing…</p>
              </>
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Captured"
                className="w-full max-h-48 object-cover rounded-xl opacity-80"
              />
            ) : (
              <>
                <span className="text-5xl" aria-hidden="true">📷</span>
                <p className="text-base font-bold text-white">Snap Receipt or Dashboard</p>
                <p className="text-xs text-gray-500">Uses your rear camera</p>
              </>
            )}
          </label>
        </div>

        {analyseError && (
          <p role="alert" className="text-sm text-danger-400 font-medium">
            {analyseError}
          </p>
        )}

        {/* ── Receipt result form ──────────────────────────────────────────── */}
        {result?.type === "receipt" && !saved && (
          <form
            onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
            className="space-y-5"
          >
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
                Receipt Detected
              </p>
              <p className="text-sm text-gray-300">
                Verify the details below before saving.
              </p>
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <label
                htmlFor="ocr-vendor"
                className="block text-xs font-bold uppercase tracking-widest text-gray-500"
              >
                Vendor
              </label>
              <input
                id="ocr-vendor"
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. O'Reilly Auto Parts"
                required
                className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-400"
              />
            </div>

            {/* Total */}
            <div className="space-y-1.5">
              <label
                htmlFor="ocr-total"
                className="block text-xs font-bold uppercase tracking-widest text-gray-500"
              >
                Total ($)
              </label>
              <input
                id="ocr-total"
                type="number"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
                className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-400"
              />
            </div>

            {/* Line items */}
            {lineItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Line Items
                </p>
                <div className="space-y-2">
                  {lineItems.map((item, i) => (
                    <LineItemRow
                      key={i}
                      item={item}
                      index={i}
                      onChange={handleLineItemChange}
                      onRemove={handleLineItemRemove}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-bold"
                >
                  + Add line item
                </button>
              </div>
            )}

            {saveError && (
              <p role="alert" className="text-sm text-danger-400 font-medium">
                {saveError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSaving || !vendor.trim() || !total}
              className={[
                "w-full min-h-[64px] rounded-2xl font-black text-lg uppercase tracking-widest",
                "bg-brand-400 text-gray-950",
                "shadow-[0_0_40px_10px_rgba(250,204,21,0.50)]",
                "hover:bg-brand-300 transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
              ].join(" ")}
            >
              {isSaving ? "Saving…" : "Save Expense"}
            </button>
          </form>
        )}

        {/* ── Dashboard result ─────────────────────────────────────────────── */}
        {result?.type === "dashboard" && (
          <div className="space-y-4">
            <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-danger-400 mb-1">
                Dashboard Detected
              </p>
              <p className="text-sm text-gray-300">
                {warningLights.length === 0
                  ? "No illuminated warning lights detected."
                  : `${warningLights.length} warning light${warningLights.length !== 1 ? "s" : ""} identified.`}
              </p>
            </div>

            {warningLights.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Warning Lights
                </p>
                <ul className="space-y-2">
                  {warningLights.map((light, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-700 px-4 py-3"
                    >
                      <span className="text-xl" aria-hidden="true">⚠️</span>
                      <span className="text-sm font-semibold text-white">{light}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setResult(null); setPreviewUrl(null); }}
              className="w-full min-h-[56px] rounded-2xl border border-gray-700 text-gray-300 font-bold text-sm hover:border-gray-500 transition-colors"
            >
              Scan Another
            </button>
          </div>
        )}

        {/* ── Success state ─────────────────────────────────────────────────── */}
        {saved && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="text-6xl" aria-hidden="true">✅</span>
            <p className="text-xl font-black text-white">Expense Saved!</p>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPreviewUrl(null);
                setSaved(false);
                setVendor("");
                setTotal("");
                setLineItems([]);
              }}
              className="text-sm text-brand-400 font-bold hover:text-brand-300 transition-colors"
            >
              Scan another receipt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
