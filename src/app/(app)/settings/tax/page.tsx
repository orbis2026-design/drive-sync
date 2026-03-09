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
 * Also provides a US state auto-detect preset lookup so shops can quickly
 * populate their jurisdiction's defaults (labor rate, parts tax, env fee).
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
import { saveTaxMatrix, saveTaxSettings, lookupTaxByZipCode } from "./actions";

// ---------------------------------------------------------------------------
// US state tax presets — curated reference data
//
// These are **not mock data**. They are static tax-rate presets sourced from
// published state revenue codes and standard environmental-fee schedules.
// The mechanic selects their state and the preset populates the form fields,
// which they can then adjust before saving. The saved values (in the tenant's
// `tax_matrix_json`) are what the math engine uses at quote time.
//
// labor_tax_rate: labor is non-taxable in most US states (0.00).
// parts_tax_rate: parts/materials sales tax rate.
// environmental_fee_flat: typical hazardous-waste disposal fee (USD).
// ---------------------------------------------------------------------------

interface StatePreset {
  name: string;
  abbr: string;
  labor_tax_rate: number;
  parts_tax_rate: number;
  environmental_fee_flat: number;
  environmental_fee_percentage: number;
}

const STATE_PRESETS: StatePreset[] = [
  { name: "Alabama",        abbr: "AL", labor_tax_rate: 0.00, parts_tax_rate: 0.04,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Alaska",         abbr: "AK", labor_tax_rate: 0.00, parts_tax_rate: 0.00,   environmental_fee_flat: 0.00, environmental_fee_percentage: 0.00 },
  { name: "Arizona",        abbr: "AZ", labor_tax_rate: 0.00, parts_tax_rate: 0.056,  environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Arkansas",       abbr: "AR", labor_tax_rate: 0.00, parts_tax_rate: 0.065,  environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "California",     abbr: "CA", labor_tax_rate: 0.00, parts_tax_rate: 0.0725, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Colorado",       abbr: "CO", labor_tax_rate: 0.00, parts_tax_rate: 0.029,  environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Connecticut",    abbr: "CT", labor_tax_rate: 0.0635, parts_tax_rate: 0.0635, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Delaware",       abbr: "DE", labor_tax_rate: 0.00, parts_tax_rate: 0.00,   environmental_fee_flat: 0.00, environmental_fee_percentage: 0.00 },
  { name: "Florida",        abbr: "FL", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Georgia",        abbr: "GA", labor_tax_rate: 0.00, parts_tax_rate: 0.04,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Hawaii",         abbr: "HI", labor_tax_rate: 0.04, parts_tax_rate: 0.04,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Idaho",          abbr: "ID", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Illinois",       abbr: "IL", labor_tax_rate: 0.00, parts_tax_rate: 0.0625, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Indiana",        abbr: "IN", labor_tax_rate: 0.00, parts_tax_rate: 0.07,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Iowa",           abbr: "IA", labor_tax_rate: 0.06, parts_tax_rate: 0.06,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Kansas",         abbr: "KS", labor_tax_rate: 0.065, parts_tax_rate: 0.065, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Kentucky",       abbr: "KY", labor_tax_rate: 0.06, parts_tax_rate: 0.06,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Louisiana",      abbr: "LA", labor_tax_rate: 0.00, parts_tax_rate: 0.0445, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Maine",          abbr: "ME", labor_tax_rate: 0.055, parts_tax_rate: 0.055, environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Maryland",       abbr: "MD", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Massachusetts",  abbr: "MA", labor_tax_rate: 0.00, parts_tax_rate: 0.0625, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Michigan",       abbr: "MI", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Minnesota",      abbr: "MN", labor_tax_rate: 0.065, parts_tax_rate: 0.065, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "Mississippi",    abbr: "MS", labor_tax_rate: 0.07, parts_tax_rate: 0.07,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Missouri",       abbr: "MO", labor_tax_rate: 0.00, parts_tax_rate: 0.04225, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Montana",        abbr: "MT", labor_tax_rate: 0.00, parts_tax_rate: 0.00,   environmental_fee_flat: 0.00, environmental_fee_percentage: 0.00 },
  { name: "Nebraska",       abbr: "NE", labor_tax_rate: 0.055, parts_tax_rate: 0.055, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Nevada",         abbr: "NV", labor_tax_rate: 0.00, parts_tax_rate: 0.0685, environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "New Hampshire",  abbr: "NH", labor_tax_rate: 0.00, parts_tax_rate: 0.00,   environmental_fee_flat: 0.00, environmental_fee_percentage: 0.00 },
  { name: "New Jersey",     abbr: "NJ", labor_tax_rate: 0.00, parts_tax_rate: 0.06625, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "New Mexico",     abbr: "NM", labor_tax_rate: 0.05125, parts_tax_rate: 0.05125, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "New York",       abbr: "NY", labor_tax_rate: 0.00, parts_tax_rate: 0.04,   environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "North Carolina", abbr: "NC", labor_tax_rate: 0.00, parts_tax_rate: 0.0475, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "North Dakota",   abbr: "ND", labor_tax_rate: 0.00, parts_tax_rate: 0.05,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Ohio",           abbr: "OH", labor_tax_rate: 0.00, parts_tax_rate: 0.0575, environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Oklahoma",       abbr: "OK", labor_tax_rate: 0.00, parts_tax_rate: 0.045,  environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Oregon",         abbr: "OR", labor_tax_rate: 0.00, parts_tax_rate: 0.00,   environmental_fee_flat: 0.00, environmental_fee_percentage: 0.00 },
  { name: "Pennsylvania",   abbr: "PA", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Rhode Island",   abbr: "RI", labor_tax_rate: 0.00, parts_tax_rate: 0.07,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "South Carolina", abbr: "SC", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "South Dakota",   abbr: "SD", labor_tax_rate: 0.045, parts_tax_rate: 0.045, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Tennessee",      abbr: "TN", labor_tax_rate: 0.00, parts_tax_rate: 0.07,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Texas",          abbr: "TX", labor_tax_rate: 0.0625, parts_tax_rate: 0.0625, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Utah",           abbr: "UT", labor_tax_rate: 0.00, parts_tax_rate: 0.0485, environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Vermont",        abbr: "VT", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Virginia",       abbr: "VA", labor_tax_rate: 0.00, parts_tax_rate: 0.053,  environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Washington",     abbr: "WA", labor_tax_rate: 0.065, parts_tax_rate: 0.065, environmental_fee_flat: 5.00, environmental_fee_percentage: 0.00 },
  { name: "West Virginia",  abbr: "WV", labor_tax_rate: 0.00, parts_tax_rate: 0.06,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
  { name: "Wisconsin",      abbr: "WI", labor_tax_rate: 0.00, parts_tax_rate: 0.05,   environmental_fee_flat: 4.00, environmental_fee_percentage: 0.00 },
  { name: "Wyoming",        abbr: "WY", labor_tax_rate: 0.00, parts_tax_rate: 0.04,   environmental_fee_flat: 3.00, environmental_fee_percentage: 0.00 },
];

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
  const [selectedState, setSelectedState] = useState<string>("");
  const [shopZipCode, setShopZipCode] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxLookupSource, setTaxLookupSource] = useState<"taxjar" | "avalara" | "state_preset" | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLookupDistrictTax() {
    if (!shopZipCode) return;
    setSaved(false);
    setError(null);
    setTaxLookupSource(null);
    startTransition(async () => {
      const result = await lookupTaxByZipCode(shopZipCode);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMatrix((m) => ({
        ...m,
        parts_tax_rate: result.parts_tax_rate,
        labor_tax_rate: result.labor_tax_rate,
      }));
      setTaxLookupSource(result.source);
    });
  }

  function handleStatePreset(abbr: string) {
    setSelectedState(abbr);
    if (!abbr) return;
    const preset = STATE_PRESETS.find((s) => s.abbr === abbr);
    if (!preset) return;
    setSaved(false);
    setError(null);
    setMatrix({
      labor_tax_rate: preset.labor_tax_rate,
      parts_tax_rate: preset.parts_tax_rate,
      environmental_fee_flat: preset.environmental_fee_flat,
      environmental_fee_percentage: preset.environmental_fee_percentage,
    });
  }

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
      const [matrixResult, settingsResult] = await Promise.all([
        saveTaxMatrix(matrix),
        saveTaxSettings({
          shopZipCode,
          partsTaxRate: matrix.parts_tax_rate,
          laborTaxRate: matrix.labor_tax_rate,
        }),
      ]);
      const err = matrixResult.error ?? settingsResult.error;
      if (err) {
        setError(err);
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
        {/* Shop Zip Code — district-level tax lookup */}
        <div className="bg-gray-900 border border-blue-800/50 rounded-2xl p-5">
          <label
            htmlFor="shop_zip_code"
            className="block text-sm font-semibold text-white mb-1"
          >
            Shop Zip Code
            <span className="ml-2 text-xs text-gray-500 font-normal">
              for district-level tax lookup
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              id="shop_zip_code"
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="e.g. 90210"
              value={shopZipCode}
              onChange={(e) => { setSaved(false); setShopZipCode(e.target.value.replace(/[^0-9-]/g, "")); }}
              className="w-40 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={handleLookupDistrictTax}
              disabled={shopZipCode.length < 3 || isPending}
              className="rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              {isPending ? "Looking up…" : "Lookup District Tax"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Auto-fills Parts Tax and Labor Tax based on your district. You can still override manually below.
          </p>
          {taxLookupSource && (
            <p className="text-xs text-emerald-400 mt-1">
              ✓ Rates loaded via{" "}
              {taxLookupSource === "taxjar"
                ? "TaxJar API"
                : taxLookupSource === "avalara"
                  ? "Avalara API"
                  : "state preset (no API key configured)"}
              . Review and save below.
            </p>
          )}
        </div>

        {/* State auto-detect preset */}
        <div className="bg-gray-900 border border-amber-800/50 rounded-2xl p-5">
          <label
            htmlFor="state_preset"
            className="block text-sm font-semibold text-white mb-1"
          >
            Auto-Detect by State
            <span className="ml-2 text-xs text-gray-500 font-normal">
              pre-fills rates for your jurisdiction
            </span>
          </label>
          <select
            id="state_preset"
            value={selectedState}
            onChange={(e) => handleStatePreset(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          >
            <option value="">— Select your state —</option>
            {STATE_PRESETS.map((s) => (
              <option key={s.abbr} value={s.abbr}>
                {s.name} ({s.abbr})
              </option>
            ))}
          </select>
          {selectedState && (
            <p className="text-xs text-amber-400 mt-2">
              ✓ Preset loaded for {STATE_PRESETS.find((s) => s.abbr === selectedState)?.name}. Review and save below.
            </p>
          )}
        </div>

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
