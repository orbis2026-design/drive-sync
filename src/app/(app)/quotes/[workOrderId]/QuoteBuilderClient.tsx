"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  lockQuote,
  updateCustomerSuppliedParts,
  type QuoteData,
  type SelectedPart,
  type QuoteCalculation,
} from "./actions";
import { type DueService, formatMilesUntilDue } from "@/lib/predictive-service";

import { TAX_RATE } from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function calcPartsSubtotal(parts: (SelectedPart & { customerSupplied?: boolean })[]): number {
  return parts.reduce((sum, p) => {
    const isCustomerSupplied = !!p.customerSupplied;
    const unitPrice = isCustomerSupplied
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
  part: SelectedPart & { customerSupplied?: boolean };
  onToggleCustomerSupplied: () => void;
}

function PartRow({ part, onToggleCustomerSupplied }: PartRowProps) {
  const isCustomerSupplied = !!part.customerSupplied;
  const unitPrice = isCustomerSupplied
    ? part.wholesalePriceCents
    : part.retailPriceCents;
  const lineTotal = unitPrice * part.quantity;

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <SupplierBadge supplier={part.supplier} />
          <button
            type="button"
            onClick={onToggleCustomerSupplied}
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
              isCustomerSupplied
                ? "border-brand-400 text-brand-400 bg-brand-400/10"
                : "border-gray-600 text-gray-400 bg-gray-800",
            ].join(" ")}
          >
            {isCustomerSupplied ? "Cust. Supplied" : "Shop Supplied"}
          </button>
        </div>
        <p className="text-sm font-bold text-white leading-snug">{part.name}</p>
        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {part.partNumber} · Qty {part.quantity}
        </p>
      </div>

      <div className="flex-shrink-0 text-right space-y-0.5">
        {isCustomerSupplied && (
          <p className="text-[10px] text-gray-600 line-through">
            ${formatCents(part.retailPriceCents)}
          </p>
        )}
        <p
          className={[
            "text-base font-black",
            isCustomerSupplied ? "text-brand-400" : "text-white",
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
// DueServicesSection — Manufacturer Recommended Due Services (Issue #57)
// ---------------------------------------------------------------------------

interface DueServicesSectionProps {
  dueServices: DueService[];
  addedTasks: string[];
  onToggle: (task: string) => void;
}

function DueServicesSection({
  dueServices,
  addedTasks,
  onToggle,
}: DueServicesSectionProps) {
  if (dueServices.length === 0) return null;

  return (
    <section aria-labelledby="due-services-heading">
      <div className="rounded-2xl border-2 border-brand-400/40 bg-brand-400/5 px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">🔧</span>
          <h2
            id="due-services-heading"
            className="text-sm font-black text-brand-400 uppercase tracking-wider"
          >
            Manufacturer Recommended Due Services
          </h2>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Based on current mileage. Tap a service to add it to the labor quote.
        </p>

        <div className="flex flex-wrap gap-2">
          {dueServices.map((service) => {
            const isAdded = addedTasks.includes(service.task);
            return (
              <button
                key={`${service.mileage}-${service.task}`}
                type="button"
                onClick={() => onToggle(service.task)}
                aria-pressed={isAdded}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
                  "text-xs font-bold transition-all duration-150",
                  isAdded
                    ? "bg-brand-400 border-brand-400 text-gray-950"
                    : "bg-transparent border-brand-400/50 text-brand-400 hover:bg-brand-400/10",
                ].join(" ")}
              >
                {isAdded ? "✓ " : "+ "}
                {service.task}
                <span
                  className={[
                    "text-[10px] font-normal opacity-75",
                    isAdded ? "text-gray-950" : "text-brand-400/60",
                  ].join(" ")}
                >
                  {formatMilesUntilDue(service.milesUntilDue)}
                </span>
              </button>
            );
          })}
        </div>

        {addedTasks.length > 0 && (
          <p className="text-[10px] text-brand-400/70 pt-1">
            {addedTasks.length} service{addedTasks.length !== 1 ? "s" : ""} added
            — each adds 1 labor hour to the estimate.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuoteBuilderClient — top-level client component
// ---------------------------------------------------------------------------

interface QuoteBuilderClientProps {
  data: QuoteData;
}

export function QuoteBuilderClient({ data }: QuoteBuilderClientProps) {
  const { workOrderId, title, parts, shopRateCents, dueServices } = data;

  // --- Controllable state -----------------------------------------------
  const [laborHours, setLaborHours] = useState(0);
  const [partsState, setPartsState] = useState<
    (SelectedPart & { customerSupplied?: boolean })[]
  >(() => parts.map((p) => ({ ...p, customerSupplied: !!p.customerSupplied })));
  // Tasks added from the Due Services section (each adds 1 labor hour).
  const [addedTasks, setAddedTasks] = useState<string[]>([]);

  // --- Lock-quote state ------------------------------------------------
  const [isLocking, startLockTransition] = useTransition();
  const [isLocked, setIsLocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockedCalculation, setLockedCalculation] =
    useState<QuoteCalculation | null>(null);

  // --- Live preview math (client-side) ---------------------------------
  // These are for display only; the server re-calculates everything on lock.
  const partsSubtotalCents = calcPartsSubtotal(partsState);
  // Include 1 labor hour per added due service task.
  const effectiveLaborHours = Math.max(0, laborHours) + addedTasks.length;
  const laborSubtotalCents = Math.round(effectiveLaborHours * shopRateCents);
  const subtotalCents = partsSubtotalCents + laborSubtotalCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  // --- Due services toggle handler ------------------------------------
  function handleDueServiceToggle(task: string) {
    setAddedTasks((prev) => {
      const next = prev.includes(task)
        ? prev.filter((t) => t !== task)
        : [...prev, task];
      // Invalidate the locked calculation when tasks change.
      if (isLocked) {
        setIsLocked(false);
        setLockedCalculation(null);
      }
      return next;
    });
  }

  // --- Lock handler ----------------------------------------------------
  function handleLock() {
    startLockTransition(async () => {
      setLockError(null);
      // Persist per-line customer-supplied flags before locking.
      const persistResult = await updateCustomerSuppliedParts(
        workOrderId,
        partsState.map((p) => ({
          partId: p.partId,
          customerSupplied: !!p.customerSupplied,
        })),
      );

      if ("error" in persistResult) {
        setLockError(persistResult.error);
        return;
      }

      const result = await lockQuote(workOrderId, {
        laborHours: effectiveLaborHours,
        // Per-line flags are persisted above; this global flag is ignored.
        customerSuppliedParts: false,
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

          {/* ── Customer-supplied liability warning (Issue #45) ────────── */}
          {partsState.some((p) => p.customerSupplied) && (
            <div className="flex items-start gap-2 rounded-xl bg-danger-500/10 border border-danger-500/40 px-4 py-3">
              <span className="text-lg flex-shrink-0" aria-hidden="true">⚠️</span>
              <p className="text-xs text-danger-300 font-medium leading-snug">
                <strong className="text-danger-400">No Warranty</strong> provided
                for labor or failure of Customer-Supplied components. This flag
                will appear prominently on the Work Order and client invoice.
              </p>
            </div>
          )}

          {/* ── Parts ledger ───────────────────────────────────────────── */}
          <section aria-labelledby="parts-heading">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="parts-heading"
                className="text-xs font-bold uppercase tracking-widest text-gray-500"
              >
                Parts · {partsState.length} line{partsState.length !== 1 ? "s" : ""}
              </h2>
              {partsState.length > 0 && (
                <p className="text-[10px] text-gray-700">
                  Per-line margin: shop vs customer supplied
                </p>
              )}
            </div>

            {partsState.length === 0 ? (
              <EmptyPartsState workOrderId={workOrderId} />
            ) : (
              <ul className="space-y-2" aria-label="Parts ledger">
                {partsState.map((part) => (
                  <PartRow
                    key={part.partId}
                    part={part}
                    onToggleCustomerSupplied={() => {
                      setPartsState((prev) => {
                        const next = prev.map((p) =>
                          p.partId === part.partId
                            ? { ...p, customerSupplied: !p.customerSupplied }
                            : p,
                        );
                        if (isLocked) {
                          // Force re-review after any pricing change.
                          setIsLocked(false);
                          setLockedCalculation(null);
                        }
                        return next;
                      });
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* ── Manufacturer Recommended Due Services (Issue #57) ──────── */}
          <DueServicesSection
            dueServices={dueServices}
            addedTasks={addedTasks}
            onToggle={handleDueServiceToggle}
          />

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
