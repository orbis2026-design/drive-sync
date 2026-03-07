"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  lockQuote,
  type QuoteData,
  type SelectedPart,
  type QuoteCalculation,
} from "./actions";

import { TAX_RATE } from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function calcPartsSubtotal(
  parts: SelectedPart[],
  customerSupplied: boolean,
): number {
  return parts.reduce((sum, p) => {
    const unitPrice = customerSupplied
      ? p.wholesalePriceCents
      : p.retailPriceCents;
    return sum + unitPrice * p.quantity;
  }, 0);
}

// ---------------------------------------------------------------------------
// SupplierBadge
// ---------------------------------------------------------------------------

function SupplierBadge({ supplier }: { supplier: SelectedPart["supplier"] }) {
  const isAutoZone = supplier === "AutoZone";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[10px] font-black tracking-widest uppercase",
        isAutoZone
          ? "bg-brand-400/20 text-brand-400 border-brand-400/40"
          : "bg-success-500/20 text-success-400 border-success-500/40",
      ].join(" ")}
    >
      {supplier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PartRow — one line in the parts ledger
// ---------------------------------------------------------------------------

interface PartRowProps {
  part: SelectedPart;
  customerSupplied: boolean;
}

function PartRow({ part, customerSupplied }: PartRowProps) {
  const unitPrice = customerSupplied
    ? part.wholesalePriceCents
    : part.retailPriceCents;
  const lineTotal = unitPrice * part.quantity;

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <SupplierBadge supplier={part.supplier} />
          {customerSupplied && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
              Cust. Supplied
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-white leading-snug">{part.name}</p>
        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {part.partNumber} · Qty {part.quantity}
        </p>
      </div>

      <div className="flex-shrink-0 text-right space-y-0.5">
        {customerSupplied && (
          <p className="text-[10px] text-gray-600 line-through">
            ${formatCents(part.retailPriceCents)}
          </p>
        )}
        <p
          className={[
            "text-base font-black",
            customerSupplied ? "text-brand-400" : "text-white",
          ].join(" ")}
        >
          ${formatCents(lineTotal)}
        </p>
        {part.quantity > 1 && (
          <p className="text-[10px] text-gray-600">
            ${formatCents(unitPrice)} ea
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// EmptyPartsState
// ---------------------------------------------------------------------------

function EmptyPartsState({ workOrderId }: { workOrderId: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-700 bg-gray-900/50 px-5 py-10 text-center space-y-3">
      <p className="text-3xl" aria-hidden="true">
        🔩
      </p>
      <p className="text-sm font-bold text-white">No parts added yet</p>
      <p className="text-xs text-gray-500">
        Source parts for work order{" "}
        <span className="font-mono">{workOrderId}</span> in the Parts Sourcing
        step.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LaborBlock — hours input + live calculation
// ---------------------------------------------------------------------------

interface LaborBlockProps {
  laborHours: number;
  shopRateCents: number;
  onChange: (hours: number) => void;
}

function LaborBlock({ laborHours, shopRateCents, onChange }: LaborBlockProps) {
  const laborSubtotalCents = Math.round(
    Math.max(0, laborHours) * shopRateCents,
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseFloat(e.target.value);
    onChange(isNaN(raw) || raw < 0 ? 0 : Math.min(raw, 200));
  }

  return (
    <section
      aria-labelledby="labor-heading"
      className="rounded-2xl border-2 border-gray-700 bg-gray-900 overflow-hidden"
    >
      <div className="px-5 py-4 space-y-4">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h2
            id="labor-heading"
            className="text-xs font-bold uppercase tracking-widest text-gray-500"
          >
            Labour
          </h2>
          <span className="text-[10px] font-mono text-gray-600">
            @${formatCents(shopRateCents)}/hr
          </span>
        </div>

        {/* Hours input */}
        <div>
          <label
            htmlFor="labor-hours-input"
            className="block text-xs font-semibold text-gray-400 mb-2"
          >
            Industry Labour Hours
          </label>
          <div className="flex items-center gap-3">
            <input
              id="labor-hours-input"
              type="number"
              inputMode="decimal"
              min={0}
              max={200}
              step={0.5}
              placeholder="0.0"
              value={laborHours === 0 ? "" : laborHours}
              onChange={handleChange}
              aria-label="Labour hours"
              className={[
                "flex-1 rounded-xl bg-gray-800 border-2",
                "px-4 py-3 text-2xl font-black text-white text-center",
                "placeholder:text-gray-700 placeholder:font-normal",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                laborHours > 0
                  ? "border-brand-400 shadow-[0_0_16px_4px_rgba(250,204,21,0.2)]"
                  : "border-gray-700",
                "transition-all duration-200",
              ].join(" ")}
            />
            <span className="text-lg font-black text-gray-500">hrs</span>
          </div>
        </div>

        {/* Live calculation display */}
        <div className="flex gap-4 rounded-xl bg-gray-800 px-4 py-3">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Hours × Rate
            </p>
            <p className="text-sm font-black text-gray-400">
              {laborHours} × ${formatCents(shopRateCents)}
            </p>
          </div>
          <div className="flex-1 text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Labour Total
            </p>
            <p
              className="text-sm font-black text-brand-400"
              style={{ textShadow: "0 0 10px rgba(250,204,21,0.5)" }}
            >
              ${formatCents(laborSubtotalCents)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CustomerSuppliedToggle — margin control
// ---------------------------------------------------------------------------

interface CustomerSuppliedToggleProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
}

function CustomerSuppliedToggle({
  enabled,
  onChange,
}: CustomerSuppliedToggleProps) {
  return (
    <section
      aria-labelledby="margin-heading"
      className="rounded-2xl border-2 border-gray-700 bg-gray-900 overflow-hidden"
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2
              id="margin-heading"
              className="text-sm font-bold text-white leading-snug"
            >
              Customer Supplied Parts
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {enabled
                ? "Retail markup stripped — billing at cost."
                : "Retail pricing active — 40 % gross margin included."}
            </p>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Customer supplied parts toggle"
            onClick={() => onChange(!enabled)}
            className={[
              "relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 transition-colors duration-200 ease-in-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
              enabled
                ? "bg-brand-400 border-brand-400"
                : "bg-gray-700 border-gray-600",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-gray-950 shadow",
                "transform transition-transform duration-200 ease-in-out mt-0.5",
                enabled ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// StickyTotalBar — fixed bottom bar with real-time totals and CTA
// ---------------------------------------------------------------------------

interface StickyTotalBarProps {
  workOrderId: string;
  partsSubtotalCents: number;
  laborSubtotalCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  isLocking: boolean;
  isLocked: boolean;
  lockError: string | null;
  lockedCalculation: QuoteCalculation | null;
  onLock: () => void;
}

function StickyTotalBar({
  workOrderId,
  partsSubtotalCents,
  laborSubtotalCents,
  subtotalCents,
  taxCents,
  totalCents,
  isLocking,
  isLocked,
  lockError,
  lockedCalculation,
  onLock,
}: StickyTotalBarProps) {
  // Use server-authoritative numbers after lock, otherwise show live preview.
  const displayParts = lockedCalculation
    ? lockedCalculation.partsSubtotalCents
    : partsSubtotalCents;
  const displayLabor = lockedCalculation
    ? lockedCalculation.laborSubtotalCents
    : laborSubtotalCents;
  const displaySubtotal = lockedCalculation
    ? lockedCalculation.subtotalCents
    : subtotalCents;
  const displayTax = lockedCalculation
    ? lockedCalculation.taxCents
    : taxCents;
  const displayTotal = lockedCalculation
    ? lockedCalculation.totalCents
    : totalCents;

  return (
    <div
      role="region"
      aria-label="Quote totals"
      aria-live="polite"
      className={[
        "fixed bottom-0 left-0 right-0 z-[nav]",
        "bg-gray-900 border-t-2",
        isLocked ? "border-success-500/60" : "border-gray-700",
        "pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-8px_40px_rgba(0,0,0,0.5)]",
      ].join(" ")}
    >
      <div className="mx-auto max-w-lg px-4 pt-3 pb-4 space-y-3">
        {/* Sheet handle */}
        <div className="flex justify-center" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>

        {/* Totals grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              Parts
            </p>
            <p className="text-sm font-black text-white">
              ${formatCents(displayParts)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              Labour
            </p>
            <p className="text-sm font-black text-white">
              ${formatCents(displayLabor)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              Subtotal
            </p>
            <p className="text-sm font-black text-white">
              ${formatCents(displaySubtotal)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              Tax (8.75%)
            </p>
            <p className="text-sm font-black text-white">
              ${formatCents(displayTax)}
            </p>
          </div>
        </div>

        {/* Grand total */}
        <div className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Grand Total
          </p>
          <p
            className={[
              "text-xl font-black",
              isLocked ? "text-success-400" : "text-brand-400",
            ].join(" ")}
            style={{
              textShadow: isLocked
                ? "0 0 16px rgba(74,222,128,0.6)"
                : "0 0 16px rgba(250,204,21,0.5)",
            }}
          >
            ${formatCents(displayTotal)}
          </p>
        </div>

        {/* Lock error */}
        {lockError && (
          <p role="alert" className="text-xs text-danger-400 font-medium">
            {lockError}
          </p>
        )}

        {/* CTA */}
        {isLocked ? (
          <Link
            href={`/quotes/${workOrderId}/send`}
            className={[
              "flex w-full items-center justify-center gap-2",
              "min-h-[64px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest text-gray-950",
              "bg-success-400",
              "shadow-[0_0_32px_8px_rgba(74,222,128,0.45)]",
              "hover:bg-success-300 hover:shadow-[0_0_48px_12px_rgba(74,222,128,0.65)]",
              "active:scale-[0.98]",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-success-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
            ].join(" ")}
          >
            Send to Client →
          </Link>
        ) : (
          <button
            type="button"
            onClick={onLock}
            disabled={isLocking}
            aria-busy={isLocking}
            className={[
              "relative flex w-full items-center justify-center gap-2",
              "min-h-[64px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest text-gray-950",
              "bg-brand-400",
              "shadow-[0_0_32px_8px_rgba(250,204,21,0.45)]",
              "hover:bg-brand-300 hover:shadow-[0_0_48px_12px_rgba(250,204,21,0.65)]",
              "active:scale-[0.98]",
              isLocking ? "opacity-60 cursor-not-allowed shadow-none" : "",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
            ].join(" ")}
          >
            {isLocking ? (
              <>
                <span
                  className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin"
                  aria-hidden="true"
                />
                Calculating…
              </>
            ) : (
              "Review & Lock Quote →"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuoteBuilderClient — top-level client component
// ---------------------------------------------------------------------------

interface QuoteBuilderClientProps {
  data: QuoteData;
}

export function QuoteBuilderClient({ data }: QuoteBuilderClientProps) {
  const { workOrderId, title, parts, shopRateCents } = data;

  // --- Controllable state -----------------------------------------------
  const [laborHours, setLaborHours] = useState(0);
  const [customerSuppliedParts, setCustomerSuppliedParts] = useState(false);

  // --- Lock-quote state ------------------------------------------------
  const [isLocking, startLockTransition] = useTransition();
  const [isLocked, setIsLocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockedCalculation, setLockedCalculation] =
    useState<QuoteCalculation | null>(null);

  // --- Live preview math (client-side) ---------------------------------
  // These are for display only; the server re-calculates everything on lock.
  const partsSubtotalCents = calcPartsSubtotal(parts, customerSuppliedParts);
  const laborSubtotalCents = Math.round(
    Math.max(0, laborHours) * shopRateCents,
  );
  const subtotalCents = partsSubtotalCents + laborSubtotalCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  // --- Lock handler ----------------------------------------------------
  function handleLock() {
    startLockTransition(async () => {
      setLockError(null);

      const result = await lockQuote(workOrderId, {
        laborHours,
        customerSuppliedParts,
      });

      if ("error" in result) {
        setLockError(result.error);
      } else {
        setLockedCalculation(result.calculation);
        setIsLocked(true);
      }
    });
  }

  // --- Render -----------------------------------------------------------
  return (
    <>
      {/* Scroll content — extra bottom padding clears the sticky bar */}
      <div
        className={[
          "min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8",
          // Bottom padding clears the sticky bar (~340 px) plus a 40 px buffer.
          "pb-[calc(env(safe-area-inset-bottom)+380px)]",
        ].join(" ")}
      >
        <div className="mx-auto max-w-lg space-y-6">

          {/* ── Page header ────────────────────────────────────────────── */}
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">
              Quote Builder
            </h1>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              {title}
            </p>
            <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest mt-1">
              WO · {workOrderId}
            </p>
          </div>

          {/* ── Margin controls ────────────────────────────────────────── */}
          <CustomerSuppliedToggle
            enabled={customerSuppliedParts}
            onChange={(v) => {
              setCustomerSuppliedParts(v);
              // Reset lock so the mechanic re-reviews after a margin change.
              if (isLocked) {
                setIsLocked(false);
                setLockedCalculation(null);
              }
            }}
          />

          {/* ── Parts ledger ───────────────────────────────────────────── */}
          <section aria-labelledby="parts-heading">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="parts-heading"
                className="text-xs font-bold uppercase tracking-widest text-gray-500"
              >
                Parts · {parts.length} line{parts.length !== 1 ? "s" : ""}
              </h2>
              {parts.length > 0 && (
                <p className="text-[10px] text-gray-700">
                  {customerSuppliedParts
                    ? "Wholesale (cost)"
                    : "Retail (40 % margin)"}
                </p>
              )}
            </div>

            {parts.length === 0 ? (
              <EmptyPartsState workOrderId={workOrderId} />
            ) : (
              <ul className="space-y-2" aria-label="Parts ledger">
                {parts.map((part) => (
                  <PartRow
                    key={part.partId}
                    part={part}
                    customerSupplied={customerSuppliedParts}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* ── Labour calculator ──────────────────────────────────────── */}
          <LaborBlock
            laborHours={laborHours}
            shopRateCents={shopRateCents}
            onChange={(h) => {
              setLaborHours(h);
              if (isLocked) {
                setIsLocked(false);
                setLockedCalculation(null);
              }
            }}
          />

          {/* ── Locked confirmation (full-width) ───────────────────────── */}
          {isLocked && lockedCalculation && (
            <div className="rounded-2xl border-2 border-success-500/50 bg-success-500/10 px-5 py-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-success-400 text-lg" aria-hidden="true">
                  ✓
                </span>
                <h3 className="text-sm font-bold text-success-400 uppercase tracking-wider">
                  Quote Verified — Server Totals
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Parts", lockedCalculation.partsSubtotalCents],
                  ["Labour", lockedCalculation.laborSubtotalCents],
                  ["Subtotal", lockedCalculation.subtotalCents],
                  ["Tax (8.75%)", lockedCalculation.taxCents],
                ].map(([label, cents]) => (
                  <div key={label} className="bg-success-500/10 rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-success-400/70 font-bold">
                      {label}
                    </p>
                    <p className="text-sm font-black text-success-400">
                      ${formatCents(cents as number)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-success-500/20 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-success-400">
                  Grand Total
                </p>
                <p className="text-xl font-black text-success-400">
                  ${formatCents(lockedCalculation.totalCents)}
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Sticky Total Bar ─────────────────────────────────────────────── */}
      <StickyTotalBar
        workOrderId={workOrderId}
        partsSubtotalCents={partsSubtotalCents}
        laborSubtotalCents={laborSubtotalCents}
        subtotalCents={subtotalCents}
        taxCents={taxCents}
        totalCents={totalCents}
        isLocking={isLocking}
        isLocked={isLocked}
        lockError={lockError}
        lockedCalculation={lockedCalculation}
        onLock={handleLock}
      />
    </>
  );
}
