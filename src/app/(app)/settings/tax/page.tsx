"use client";

/**
 * /settings/tax — Tax & Environmental Fee Matrix (Issue #51)
 *
 * Allows the mechanic to configure per-state tax rules:
 *   - Labor tax rate (0% in most US states)
 *   - Parts/materials sales tax rate
 *   - Environmental / hazardous-waste fee (flat dollar amount)
 *   - Environmental fee percentage (applied to parts subtotal)
 *
 * The mechanic's choices are stored in `tenants.tax_matrix_json` and consumed
 * by the math-engine.ts utility during quote generation.
 */

import { useState, useTransition } from "react";
import {
  DEFAULT_TAX_MATRIX,
  formatCentsAsDollars,
  type TaxMatrix,
} from "@/lib/math-engine";
import { saveTaxMatrix } from "./actions";

// ---------------------------------------------------------------------------
// Client UI
// ---------------------------------------------------------------------------

function pct(rate: number): string {
  return (rate * 100).toFixed(2);
}

function parsePct(value: string): number {
  const n = parseFloat(value);
  if (!isFinite(n) || n < 0 || n > 100) return 0;
  return n / 100;
}

function parseDollar(value: string): number {
  const n = parseFloat(value);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export default function TaxSettingsPage() {
  const [matrix, setMatrix] = useState<TaxMatrix>({ ...DEFAULT_TAX_MATRIX });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(field: keyof TaxMatrix, raw: string) {
    setSaved(false);
    setError(null);
    if (field === "environmental_fee_flat") {
      setMatrix((m) => ({ ...m, [field]: parseDollar(raw) }));
    } else {
      setMatrix((m) => ({ ...m, [field]: parsePct(raw) }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveTaxMatrix(matrix);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  // Live preview — example with $1,000 parts and 2 hours at $110/hr
  const examplePartsSubtotal = 100000; // $1,000.00 in cents
  const exampleLaborSubtotal = 22000;  // $220.00 in cents (2h × $110)
  const examplePartsTax = Math.round(examplePartsSubtotal * matrix.parts_tax_rate);
  const exampleLaborTax = Math.round(exampleLaborSubtotal * matrix.labor_tax_rate);
  const exampleEnvFlat = Math.round(matrix.environmental_fee_flat * 100);
  const exampleEnvPct = Math.round(examplePartsSubtotal * matrix.environmental_fee_percentage);
  const exampleEnvTotal = exampleEnvFlat + exampleEnvPct;
  const exampleTotal =
    examplePartsSubtotal + exampleLaborSubtotal + examplePartsTax + exampleLaborTax + exampleEnvTotal;

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <a
          href="/settings"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3 inline-block"
        >
          ← Settings
        </a>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Tax &amp; Fee Matrix
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure your jurisdiction&apos;s tax rules. Labor is often
          non-taxable; parts are usually subject to sales tax. Environmental
          fees apply when fluids (oil, brake fluid, coolant) are on the invoice.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Labor tax rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <label
            htmlFor="labor_tax_rate"
            className="block text-sm font-semibold text-white mb-1"
          >
            Labor Tax Rate
            <span className="ml-2 text-xs text-gray-500 font-normal">
              (0% in most states — labour is not taxable)
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="labor_tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={pct(matrix.labor_tax_rate)}
              onChange={(e) => handleChange("labor_tax_rate", e.target.value)}
              className="w-32 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-400"
            />
            <span className="text-gray-400 text-sm">%</span>
          </div>
        </div>

        {/* Parts tax rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <label
            htmlFor="parts_tax_rate"
            className="block text-sm font-semibold text-white mb-1"
          >
            Parts / Materials Tax Rate
            <span className="ml-2 text-xs text-gray-500 font-normal">
              (sales tax on parts, e.g. 8.5% in California)
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="parts_tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={pct(matrix.parts_tax_rate)}
              onChange={(e) => handleChange("parts_tax_rate", e.target.value)}
              className="w-32 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-400"
            />
            <span className="text-gray-400 text-sm">%</span>
          </div>
        </div>

        {/* Environmental fee — flat */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <label
            htmlFor="environmental_fee_flat"
            className="block text-sm font-semibold text-white mb-1"
          >
            Environmental / Hazardous Waste Fee (Flat)
            <span className="ml-2 text-xs text-gray-500 font-normal">
              added when fluids appear in the parts list
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">$</span>
            <input
              id="environmental_fee_flat"
              type="number"
              step="0.01"
              min="0"
              value={matrix.environmental_fee_flat.toFixed(2)}
              onChange={(e) =>
                handleChange("environmental_fee_flat", e.target.value)
              }
              className="w-32 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-400"
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Triggers on: motor oil, brake fluid, coolant, transmission fluid,
            refrigerant, grease, and other fluids.
          </p>
        </div>

        {/* Environmental fee — percentage */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <label
            htmlFor="environmental_fee_percentage"
            className="block text-sm font-semibold text-white mb-1"
          >
            Environmental Fee (% of Parts Subtotal)
            <span className="ml-2 text-xs text-gray-500 font-normal">
              optional — stacks on top of the flat fee
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="environmental_fee_percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={pct(matrix.environmental_fee_percentage)}
              onChange={(e) =>
                handleChange("environmental_fee_percentage", e.target.value)
              }
              className="w-32 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-400"
            />
            <span className="text-gray-400 text-sm">%</span>
          </div>
        </div>

        {/* Live preview */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">
            Live Preview
            <span className="ml-2 text-xs text-gray-500 font-normal">
              example: $1,000 parts + 2 hr labour at $110/hr (with fluid)
            </span>
          </h2>
          <div className="space-y-1.5 text-sm">
            <PreviewLine label="Parts subtotal" value={formatCentsAsDollars(examplePartsSubtotal)} />
            <PreviewLine label="Labour subtotal" value={formatCentsAsDollars(exampleLaborSubtotal)} />
            <PreviewLine
              label={`Parts tax (${pct(matrix.parts_tax_rate)}%)`}
              value={formatCentsAsDollars(examplePartsTax)}
              muted
            />
            <PreviewLine
              label={`Labour tax (${pct(matrix.labor_tax_rate)}%)`}
              value={formatCentsAsDollars(exampleLaborTax)}
              muted
            />
            <PreviewLine
              label={`Environmental fee (flat)`}
              value={formatCentsAsDollars(exampleEnvFlat)}
              muted
              highlight={exampleEnvFlat > 0}
            />
            {exampleEnvPct > 0 && (
              <PreviewLine
                label={`Environmental fee (${pct(matrix.environmental_fee_percentage)}%)`}
                value={formatCentsAsDollars(exampleEnvPct)}
                muted
                highlight
              />
            )}
            <div className="border-t border-gray-800 mt-2 pt-2">
              <PreviewLine
                label="Grand Total"
                value={formatCentsAsDollars(exampleTotal)}
                bold
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            ✓ Tax matrix saved successfully.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-black py-4 text-sm transition-all duration-150 active:scale-95"
        >
          {isPending ? "Saving…" : "Save Tax Matrix"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PreviewLine({
  label,
  value,
  muted,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={[
          "text-sm",
          muted ? "text-gray-500" : "text-gray-300",
          highlight ? "text-amber-400 font-medium" : "",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        className={[
          "font-mono text-sm tabular-nums",
          bold ? "text-white font-bold" : muted ? "text-gray-400" : "text-white",
          highlight ? "text-amber-300" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
