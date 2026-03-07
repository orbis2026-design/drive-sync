"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  uploadAndParseReceipt,
  confirmExpense,
  fetchExpenses,
  type OcrResult,
  type ExpenseRecord,
} from "./actions";

// ─── Category options ─────────────────────────────────────────────────────────

const CATEGORIES = [
  "Parts",
  "Supplies",
  "Tools",
  "Fuel",
  "Shop Fees",
  "General",
];

// ─── Expense list item ────────────────────────────────────────────────────────

function ExpenseRow({ expense }: { expense: ExpenseRecord }) {
  return (
    <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{expense.vendor}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {expense.category} ·{" "}
          {new Date(expense.created_at).toLocaleDateString()}
        </p>
      </div>
      <span className="text-amber-400 font-bold text-base ml-4">
        ${expense.amount.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [view, setView] = useState<"list" | "confirm">("list");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  // OCR state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Confirmation form state
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("General");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load expenses ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchExpenses().then((result) => {
      if ("error" in result) {
        setListError(result.error);
      } else {
        setExpenses(result.data);
      }
    });
  }, []);

  // ── Snap receipt ───────────────────────────────────────────────────────────
  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPreviewUrl(URL.createObjectURL(file));
      setIsUploading(true);
      setUploadError(null);
      setOcrResult(null);

      const formData = new FormData();
      formData.append("receipt", file);

      const result = await uploadAndParseReceipt(formData);

      if ("error" in result) {
        setUploadError(result.error);
        setIsUploading(false);
        return;
      }

      setImageUrl(result.imageUrl);
      setOcrResult(result.data);
      setVendor(result.data.vendor ?? "");
      setAmount(result.data.amount != null ? String(result.data.amount) : "");
      setIsUploading(false);
      setView("confirm");
    },
    []
  );

  // ── Confirm and save ───────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setSaveError("Enter a valid amount.");
      return;
    }
    if (!vendor.trim()) {
      setSaveError("Vendor name is required.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const result = await confirmExpense({
      amount: amountNum,
      vendor,
      category,
      receiptImageUrl: imageUrl,
    });

    if ("error" in result) {
      setSaveError(result.error);
      setIsSaving(false);
      return;
    }

    // Prepend new expense to list and return to list view
    setExpenses((prev) => [result.data, ...prev]);
    setView("list");
    setPreviewUrl(null);
    setImageUrl(null);
    setOcrResult(null);
    setIsSaving(false);
  }, [amount, vendor, category, imageUrl]);

  const handleDeny = useCallback(() => {
    setView("list");
    setPreviewUrl(null);
    setImageUrl(null);
    setOcrResult(null);
    setUploadError(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Confirmation screen ────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  if (view === "confirm") {
    const parsedAmount = parseFloat(amount);

    return (
      <div className="min-h-screen bg-gray-950 text-white pb-8">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-4">
          <h1 className="text-xl font-bold">🧾 Confirm Expense</h1>
        </div>

        <div className="px-4 py-6 max-w-sm mx-auto space-y-6">
          {/* Receipt preview */}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt"
              className="w-full max-h-56 object-cover rounded-2xl border border-gray-700 opacity-90"
            />
          )}

          {/* AI-generated summary */}
          {ocrResult && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-extrabold text-amber-400">
                {!isNaN(parsedAmount) && parsedAmount > 0
                  ? `$${parsedAmount.toFixed(2)}`
                  : "Amount TBD"}
              </p>
              <p className="text-gray-300 text-sm mt-0.5">
                at{" "}
                <span className="text-white font-semibold">
                  {vendor || "Unknown Vendor"}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1 italic">
                AI-extracted — please verify below
              </p>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. AutoZone"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Total Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {saveError && (
            <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
              ⚠️ {saveError}
            </div>
          )}

          {/* Yes / No confirmation buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleDeny}
              disabled={isSaving}
              className="py-5 text-lg font-extrabold rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all text-white border border-gray-700 disabled:opacity-40"
            >
              ✗ No
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className="py-5 text-lg font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 shadow-lg shadow-amber-500/30 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "✓ Yes"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Expense list ───────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-4">
        <h1 className="text-xl font-bold">🧾 Expenses</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Track shop expenses — snap a receipt and the AI does the rest.
        </p>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="mx-4 mt-4 bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
          ⚠️ {uploadError}
        </div>
      )}

      {/* Expense list */}
      <div className="px-4 py-4 space-y-2 max-w-2xl mx-auto">
        {listError && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
            ⚠️ {listError}
          </div>
        )}

        {expenses.length === 0 && !listError && (
          <div className="text-center text-gray-600 py-16">
            <span className="text-5xl block mb-3">🧾</span>
            <p className="font-medium">No expenses yet</p>
            <p className="text-xs mt-1">Tap &ldquo;Snap Receipt&rdquo; to add your first one.</p>
          </div>
        )}

        {expenses.map((exp) => (
          <ExpenseRow key={exp.id} expense={exp} />
        ))}
      </div>

      {/* Snap Receipt FAB */}
      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-6">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="w-full max-w-sm py-5 text-xl font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 shadow-xl shadow-amber-500/30 disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {isUploading ? (
            <>
              <span className="animate-spin text-2xl">⚙️</span>
              Analysing receipt…
            </>
          ) : (
            <>
              <span className="text-3xl">📷</span>
              Snap Receipt
            </>
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />
    </div>
  );
}
