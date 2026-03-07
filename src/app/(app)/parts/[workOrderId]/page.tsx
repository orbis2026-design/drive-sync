"use client";

import { use, useState, useTransition } from "react";
import {
  lookupParts,
  savePartsToWorkOrder,
  type Part,
  type SelectedPart,
} from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// SupplierBadge
// ---------------------------------------------------------------------------

function SupplierBadge({ supplier }: { supplier: Part["supplier"] }) {
  const isAutoZone = supplier === "AutoZone";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5",
        "text-xs font-black tracking-widest uppercase",
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
// PartCard
// ---------------------------------------------------------------------------

interface PartCardProps {
  part: Part;
  isInCart: boolean;
  onAdd: () => void;
}

function PartCard({ part, isInCart, onAdd }: PartCardProps) {
  const isAutoZone = part.supplier === "AutoZone";

  return (
    <article
      className={[
        "rounded-2xl border-2 bg-gray-900 overflow-hidden",
        "transition-colors duration-300",
        isInCart
          ? isAutoZone
            ? "border-brand-400/60"
            : "border-success-500/60"
          : "border-gray-700",
      ].join(" ")}
    >
      <div className="px-5 py-4 space-y-4">
        {/* Header row: badge + part number */}
        <div className="flex items-start justify-between gap-2">
          <SupplierBadge supplier={part.supplier} />
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">
            {part.partNumber}
          </p>
        </div>

        {/* Part name */}
        <h3 className="text-base font-bold text-white leading-snug">
          {part.name}
        </h3>

        {/* Price row */}
        <div className="flex gap-4 rounded-xl bg-gray-800 px-4 py-3">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Wholesale
            </p>
            <p className="text-sm font-black text-gray-300">
              ${formatCents(part.wholesalePriceCents)}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Retail (40% gross margin)
            </p>
            <p
              className={[
                "text-sm font-black",
                isAutoZone ? "text-brand-400" : "text-success-400",
              ].join(" ")}
            >
              ${formatCents(part.retailPriceCents)}
            </p>
          </div>
        </div>

        {/* ETA */}
        <p
          className={[
            "text-sm font-black",
            isAutoZone ? "text-brand-400" : "text-success-400",
          ].join(" ")}
          style={{
            textShadow: isAutoZone
              ? "0 0 10px rgba(250,204,21,0.7)"
              : "0 0 10px rgba(74,222,128,0.7)",
          }}
          aria-label={`ETA: ${part.etaLabel}`}
        >
          {part.etaLabel}
        </p>

        {/* Add to Cart / Added indicator */}
        {isInCart ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-500/10 border border-success-500/30 px-4 py-3">
            <span className="text-success-400 font-black text-sm" aria-hidden="true">
              ✓
            </span>
            <p className="text-sm font-bold text-success-400">Added to cart</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className={[
              "flex w-full items-center justify-center gap-2",
              "rounded-xl border-2 px-4 py-3",
              "text-sm font-black uppercase tracking-widest",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
              isAutoZone
                ? [
                    "border-brand-400 bg-brand-400 text-black",
                    "hover:bg-brand-400/90 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)]",
                    "active:scale-[0.98] focus-visible:ring-brand-400",
                  ].join(" ")
                : [
                    "border-success-500 bg-success-500 text-black",
                    "hover:bg-success-500/90 hover:shadow-[0_0_24px_6px_rgba(34,197,94,0.3)]",
                    "active:scale-[0.98] focus-visible:ring-success-500",
                  ].join(" "),
            ].join(" ")}
          >
            <span aria-hidden="true">＋</span>
            Add to Cart · ${formatCents(part.retailPriceCents)}
          </button>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// CartBottomSheet
// ---------------------------------------------------------------------------

interface CartBottomSheetProps {
  cartItems: SelectedPart[];
  onRemove: (partId: string) => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  isFinalized: boolean;
  finalizeError: string | null;
}

function CartBottomSheet({
  cartItems,
  onRemove,
  onFinalize,
  isFinalizing,
  isFinalized,
  finalizeError,
}: CartBottomSheetProps) {
  const totalRetailCents = cartItems.reduce(
    (sum, item) => sum + item.retailPriceCents * item.quantity,
    0,
  );
  const totalWholesaleCents = cartItems.reduce(
    (sum, item) => sum + item.wholesalePriceCents * item.quantity,
    0,
  );

  const isVisible = cartItems.length > 0;

  return (
    <div
      role="region"
      aria-label="Parts cart"
      aria-live="polite"
      className={[
        "fixed bottom-0 left-0 right-0 z-[nav]",
        "bg-gray-900 border-t-2 border-gray-700",
        "transition-transform duration-300 ease-in-out",
        "pb-[env(safe-area-inset-bottom)]",
        isVisible ? "translate-y-0" : "translate-y-full",
      ].join(" ")}
    >
      <div className="mx-auto max-w-lg px-4 py-4 space-y-3">
        {/* Sheet handle */}
        <div className="flex justify-center" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Parts Cart
          </p>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            {cartItems.length} item{cartItems.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Line items */}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {cartItems.map((item) => (
            <div
              key={item.partId}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {item.name}
                </p>
                <p className="text-[10px] text-gray-500 font-mono uppercase">
                  {item.supplier} · {item.partNumber}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <p className="text-sm font-black text-brand-400">
                  ${formatCents(item.retailPriceCents)}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(item.partId)}
                  aria-label={`Remove ${item.name} from cart`}
                  className="flex items-center justify-center h-6 w-6 rounded-full text-gray-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors duration-150"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals row */}
        <div className="flex gap-4 rounded-xl bg-gray-800 px-4 py-3 border border-gray-700">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Wholesale Total
            </p>
            <p className="text-sm font-black text-gray-300">
              ${formatCents(totalWholesaleCents)}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
              Retail Total
            </p>
            <p className="text-sm font-black text-brand-400">
              ${formatCents(totalRetailCents)}
            </p>
          </div>
        </div>

        {/* Finalize button / success state */}
        {isFinalized ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-500/10 border border-success-500/30 px-4 py-3">
            <span className="text-success-400 font-black text-sm" aria-hidden="true">
              ✓
            </span>
            <p className="text-sm font-bold text-success-400">
              Parts saved to work order
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onFinalize}
            disabled={isFinalizing}
            aria-busy={isFinalizing}
            className={[
              "flex w-full items-center justify-center gap-2",
              "rounded-xl border-2 border-brand-400 bg-brand-400",
              "px-4 py-3 text-sm font-black uppercase tracking-widest text-black",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
              isFinalizing
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-brand-400/90 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] active:scale-[0.98]",
            ].join(" ")}
          >
            {isFinalizing ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Finalize Parts · ${formatCents(totalRetailCents)}
              </>
            )}
          </button>
        )}

        {/* Error state */}
        {finalizeError && (
          <p role="alert" className="text-xs text-danger-400 font-medium">
            {finalizeError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PartsPage — Client Component
// ---------------------------------------------------------------------------

export default function PartsPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  // Next.js 15+ passes route params as a Promise — unwrap with React's use().
  const { workOrderId } = use(params);

  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<Part[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupPending, startLookupTransition] = useTransition();

  const [cart, setCart] = useState<SelectedPart[]>([]);
  const [isFinalizing, startFinalizeTransition] = useTransition();
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSearch() {
    if (query.trim().length < 2) return;

    startLookupTransition(async () => {
      setLookupError(null);
      setParts(null);

      const result = await lookupParts(workOrderId, query);

      if ("error" in result) {
        setLookupError(result.error);
      } else {
        setParts(result.parts);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  function handleAddToCart(part: Part) {
    setCart((prev) => {
      if (prev.some((item) => item.partId === part.id)) return prev;
      const item: SelectedPart = {
        partId: part.id,
        name: part.name,
        partNumber: part.partNumber,
        supplier: part.supplier,
        wholesalePriceCents: part.wholesalePriceCents,
        retailPriceCents: part.retailPriceCents,
        quantity: 1,
      };
      return [...prev, item];
    });
  }

  function handleRemoveFromCart(partId: string) {
    setCart((prev) => prev.filter((item) => item.partId !== partId));
  }

  function handleFinalize() {
    startFinalizeTransition(async () => {
      setFinalizeError(null);
      const result = await savePartsToWorkOrder(workOrderId, cart);
      if (result.error) {
        setFinalizeError(result.error);
      } else {
        setIsFinalized(true);
      }
    });
  }

  const isQueryReady = query.trim().length >= 2;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Extra bottom padding so content clears the bottom sheet */}
      <div
        className={[
          "min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8",
          "transition-[padding-bottom] duration-300",
          cart.length > 0
            ? "pb-[calc(env(safe-area-inset-bottom)+340px)]"
            : "pb-[calc(env(safe-area-inset-bottom)+80px)]",
        ].join(" ")}
      >
        <div className="mx-auto max-w-lg space-y-5">

          {/* ── Page header ──────────────────────────────────────────────── */}
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">
              Parts Sourcing
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Compare AutoZone and Worldpac pricing in real time.
            </p>
            <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest mt-1">
              WO · {workOrderId}
            </p>
          </div>

          {/* ── Search input ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="part-search-input"
                className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2"
              >
                Part Search
              </label>

              <input
                id="part-search-input"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. brake pads, oil filter, spark plugs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search for a part by name"
                className={[
                  "w-full rounded-xl border-2 bg-gray-900",
                  "px-5 py-4 text-base font-medium text-white",
                  "placeholder:text-gray-700",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
                  isQueryReady
                    ? "border-brand-400 shadow-[0_0_24px_6px_rgba(250,204,21,0.15)] focus-visible:ring-brand-400"
                    : "border-gray-700 focus-visible:ring-gray-500",
                ].join(" ")}
              />
            </div>

            {/* Search button */}
            <button
              type="button"
              onClick={handleSearch}
              disabled={!isQueryReady || isLookupPending}
              aria-busy={isLookupPending}
              className={[
                "flex w-full items-center justify-center gap-2",
                "rounded-xl border-2 px-4 py-4",
                "text-base font-black uppercase tracking-widest",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
                isQueryReady && !isLookupPending
                  ? "border-brand-400 bg-brand-400 text-black hover:shadow-[0_0_32px_8px_rgba(250,204,21,0.4)] active:scale-[0.98]"
                  : "border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed",
              ].join(" ")}
            >
              {isLookupPending ? (
                <>
                  <span className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Searching…
                </>
              ) : (
                "Find Parts"
              )}
            </button>
          </div>

          {/* ── Lookup error ─────────────────────────────────────────────── */}
          {lookupError && (
            <div
              role="alert"
              className="rounded-xl border border-danger-500/40 bg-danger-500/10 px-4 py-3"
            >
              <p className="text-sm font-bold text-danger-400">{lookupError}</p>
            </div>
          )}

          {/* ── Results header ───────────────────────────────────────────── */}
          {parts !== null && !isLookupPending && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                {parts.length} result{parts.length !== 1 ? "s" : ""} for{" "}
                <span className="text-white">&ldquo;{query}&rdquo;</span>
              </p>
              <p className="text-[10px] text-gray-700">AutoZone · Worldpac</p>
            </div>
          )}

          {/* ── Part cards — vertically stacked ──────────────────────────── */}
          {parts !== null && parts.length > 0 && (
            <div
              className="space-y-3"
              role="list"
              aria-label="Supplier part results"
            >
              {parts.map((part) => (
                <div key={part.id} role="listitem">
                  <PartCard
                    part={part}
                    isInCart={cart.some((item) => item.partId === part.id)}
                    onAdd={() => handleAddToCart(part)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────────────── */}
          {parts !== null && parts.length === 0 && !isLookupPending && (
            <div className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-10 text-center">
              <p className="text-2xl mb-2" aria-hidden="true">
                🔍
              </p>
              <p className="text-sm font-bold text-white">No parts found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try a different search term.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ── Sticky Bottom Sheet ───────────────────────────────────────────── */}
      <CartBottomSheet
        cartItems={cart}
        onRemove={handleRemoveFromCart}
        onFinalize={handleFinalize}
        isFinalizing={isFinalizing}
        isFinalized={isFinalized}
        finalizeError={finalizeError}
      />
    </>
  );
}
