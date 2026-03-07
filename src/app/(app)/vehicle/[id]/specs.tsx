"use client";

import { useState, useCallback } from "react";
import {
  lookupQuickSpecs,
  buildQuickSpecsKit,
  type QuickSpecsResult,
  type PartOption,
  type QuickSpecsKitItem,
} from "@/lib/parts-catalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VehicleSpecsProps {
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  engine?: string | null;
  trim?: string | null;
  /** workOrderId to link the "Add Kit to Quote" action */
  activeWorkOrderId?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// PartOptionRow
// ---------------------------------------------------------------------------

function PartOptionRow({ part }: { part: PartOption }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900 leading-snug">
            {part.brand}
          </span>
          {part.isOem && (
            <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              OEM
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 font-mono mt-0.5">
          {part.partNumber}
        </p>
      </div>
      <span className="text-sm font-bold text-gray-900 flex-shrink-0">
        ${formatCents(part.retailPriceCents)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategorySection — one category inside the accordion
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  title: string;
  icon: string;
  parts: PartOption[];
  subtitle?: string;
}

function CategorySection({
  title,
  icon,
  parts,
  subtitle,
}: CategorySectionProps) {
  return (
    <div className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="text-sm font-black text-gray-900">{title}</p>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="ml-7">
        {parts.map((p) => (
          <PartOptionRow key={p.partNumber} part={p} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddKitToQuoteButton
// ---------------------------------------------------------------------------

interface AddKitToQuoteButtonProps {
  kit: QuickSpecsKitItem[];
  workOrderId: string;
}

function AddKitToQuoteButton({ kit, workOrderId }: AddKitToQuoteButtonProps) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = kit.reduce(
    (sum, item) => sum + item.retailPriceCents * item.quantity,
    0,
  );

  async function handleAdd() {
    setAdding(true);
    setError(null);

    try {
      // In production, call a server action to insert these parts into the
      // work order's parts_json. For the prototype, we simulate success.
      await new Promise((resolve) => setTimeout(resolve, 600));

      // TODO: replace with real server action:
      // await addQuickSpecsKitToWorkOrder(workOrderId, kit);
      void workOrderId; // suppress unused var warning until real action wired up
      void kit;

      setAdded(true);
    } catch {
      setError("Failed to add kit. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  if (added) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center">
        <p className="text-green-700 font-bold text-sm">
          ✓ Kit added to Work Order
        </p>
        <p className="text-green-600 text-xs mt-0.5">
          {kit.length} items · ${formatCents(total)} total
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-xs text-red-600 font-medium text-center">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className={[
          "w-full rounded-xl px-4 py-3",
          "text-sm font-black uppercase tracking-widest text-gray-950",
          "bg-yellow-400",
          "shadow-[0_0_20px_4px_rgba(250,204,21,0.3)]",
          "hover:bg-yellow-300 hover:shadow-[0_0_28px_6px_rgba(250,204,21,0.45)]",
          "active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400",
        ].join(" ")}
      >
        {adding ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            Adding…
          </span>
        ) : (
          `⚡ Add Kit to Quote · $${formatCents(total)}`
        )}
      </button>
      <p className="text-center text-[10px] text-gray-400">
        {kit.length} items added to WO · {workOrderId}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickSpecsAccordion — main component
// ---------------------------------------------------------------------------

export function QuickSpecsAccordion({
  vehicleId,
  year,
  make,
  model,
  engine,
  trim,
  activeWorkOrderId,
}: VehicleSpecsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [specs, setSpecs] = useState<QuickSpecsResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const kit = specs ? buildQuickSpecsKit(specs) : null;

  const handleToggle = useCallback(async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);

    // Only fetch if we haven't already
    if (specs !== null) return;

    setLoading(true);
    setLoadError(null);

    try {
      const result = await lookupQuickSpecs({ year, make, model, engine, trim });
      setSpecs(result);
    } catch {
      setLoadError("Failed to load parts catalog. Please try again.");
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, [isOpen, specs, year, make, model, engine, trim]);

  void vehicleId; // available for future server-side lookup

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Accordion header */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="quick-specs-panel"
        onClick={handleToggle}
        className={[
          "w-full flex items-center justify-between gap-4",
          "px-5 py-4",
          "text-left",
          "hover:bg-gray-50 active:bg-gray-100",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-inset",
        ].join(" ")}
      >
        <div>
          <p className="text-sm font-black text-gray-900 flex items-center gap-2">
            🔩 Quick Specs
            <span className="rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Filters &amp; Wipers
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            OEM &amp; aftermarket part numbers · tap to expand
          </p>
        </div>

        <span
          className={[
            "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full",
            "bg-gray-100 text-gray-600 text-xs font-bold",
            "transition-transform duration-200",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {/* Accordion body */}
      <div
        id="quick-specs-panel"
        role="region"
        aria-label="Quick Specs parts catalog"
        className={[
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
        ].join(" ")}
      >
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6">
              <span className="h-5 w-5 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">
                Fetching catalog…
              </span>
            </div>
          )}

          {loadError && (
            <p role="alert" className="text-sm text-red-600 font-medium text-center py-4">
              {loadError}
            </p>
          )}

          {specs && (
            <>
              <CategorySection
                title="Oil Filter"
                icon="🛢"
                parts={specs.oilFilter}
              />
              <CategorySection
                title="Engine Air Filter"
                icon="🌬"
                parts={specs.airFilter}
              />
              <CategorySection
                title="Cabin Air Filter"
                icon="🫁"
                parts={specs.cabinAirFilter}
              />
              <CategorySection
                title="Wiper Blades"
                icon="🌧"
                parts={specs.wiperBlades.options}
                subtitle={`Driver ${specs.wiperBlades.sizes.driver} / Passenger ${specs.wiperBlades.sizes.passenger}`}
              />

              {/* Add Kit to Quote CTA */}
              {kit && activeWorkOrderId && (
                <div className="pt-2">
                  <AddKitToQuoteButton
                    kit={kit}
                    workOrderId={activeWorkOrderId}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
