"use client";

import { use, useState, useTransition } from "react";
import { lookupTSBs, addToQuote, type TSB } from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip non-alphanumeric characters, uppercase, and cap at 5 characters. */
function formatObdCode(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 5);
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// ConfidenceBadge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const colorClass =
    confidence >= 85
      ? "bg-success-500/20 text-success-400 border-success-500/40"
      : confidence >= 65
        ? "bg-brand-400/20 text-brand-400 border-brand-400/40"
        : "bg-danger-500/20 text-danger-400 border-danger-500/40";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border",
        "px-2.5 py-0.5 text-xs font-black tracking-widest uppercase",
        colorClass,
      ].join(" ")}
      aria-label={`Match confidence: ${confidence}%`}
    >
      {confidence}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// TSBAccordionItem
// ---------------------------------------------------------------------------

interface TSBAccordionItemProps {
  tsb: TSB;
  workOrderId: string;
  isOpen: boolean;
  onToggle: () => void;
}

function TSBAccordionItem({
  tsb,
  workOrderId,
  isOpen,
  onToggle,
}: TSBAccordionItemProps) {
  const [addStatus, setAddStatus] = useState<
    "idle" | "pending" | "added" | "error"
  >("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddToQuote() {
    startTransition(async () => {
      setAddStatus("pending");
      setAddError(null);
      const result = await addToQuote(workOrderId, tsb);
      if (result.error) {
        setAddStatus("error");
        setAddError(result.error);
      } else {
        setAddStatus("added");
      }
    });
  }

  const totalCents = tsb.estimatedLaborCostCents + tsb.estimatedPartsCostCents;

  return (
    <article
      className={[
        "rounded-2xl border-2 bg-gray-900 overflow-hidden",
        "transition-colors duration-300",
        isOpen ? "border-brand-400/60" : "border-gray-700",
      ].join(" ")}
    >
      {/* ── Accordion header (always visible) ──────────────────────────── */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={[
          "flex w-full items-start gap-3 px-5 py-4 text-left",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400",
          isOpen ? "bg-brand-400/5" : "hover:bg-gray-800",
        ].join(" ")}
      >
        {/* Confidence badge */}
        <div className="flex-shrink-0 pt-0.5">
          <ConfidenceBadge confidence={tsb.confidence} />
        </div>

        {/* Title & metadata */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
            {tsb.bulletinNumber}
          </p>
          <h3 className="text-base font-bold text-white leading-snug mt-0.5">
            {tsb.title}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{tsb.affectedVehicles}</p>
        </div>

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={[
            "h-5 w-5 flex-shrink-0 mt-0.5 text-gray-500",
            "transition-transform duration-300",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      <div
        className={[
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
          isOpen ? "max-h-[700px] opacity-100" : "max-h-0 opacity-0",
        ].join(" ")}
        aria-hidden={!isOpen}
      >
        <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
          {/* Summary */}
          <p className="text-sm text-gray-400 leading-relaxed">{tsb.summary}</p>

          {/* Repair steps */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
              Repair Steps
            </h4>
            <ol className="space-y-2.5">
              {tsb.repairSteps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] font-black text-gray-400 mt-0.5"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm text-white leading-snug">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Cost estimate row */}
          <div className="flex gap-3 rounded-xl bg-gray-800 px-4 py-3">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                Est. Labour
              </p>
              <p className="text-sm font-black text-white">
                {tsb.estimatedLaborHours}h · ${formatCents(tsb.estimatedLaborCostCents)}
              </p>
            </div>

            {tsb.estimatedPartsCostCents > 0 && (
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  Est. Parts
                </p>
                <p className="text-sm font-black text-white">
                  ${formatCents(tsb.estimatedPartsCostCents)}
                </p>
              </div>
            )}

            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                Total Est.
              </p>
              <p className="text-sm font-black text-brand-400">
                ${formatCents(totalCents)}
              </p>
            </div>
          </div>

          {/* Add to Quote button / success state */}
          {addStatus === "added" ? (
            <div className="flex items-center gap-2 rounded-xl bg-success-500/10 border border-success-500/30 px-4 py-3">
              <span className="text-success-400 font-black text-sm" aria-hidden="true">
                ✓
              </span>
              <p className="text-sm font-bold text-success-400">
                Added to quote — ${formatCents(totalCents)}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAddToQuote}
              disabled={isPending}
              className={[
                "flex w-full items-center justify-center gap-2",
                "rounded-xl border-2 border-brand-400 bg-brand-400",
                "px-4 py-3 text-sm font-black uppercase tracking-widest text-black",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                isPending
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-brand-400/90 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] active:scale-[0.98]",
              ].join(" ")}
            >
              {isPending ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <span aria-hidden="true">＋</span>
                  Add to Quote · ${formatCents(totalCents)}
                </>
              )}
            </button>
          )}

          {/* Error message */}
          {addStatus === "error" && addError && (
            <p role="alert" className="text-xs text-danger-400 font-medium">
              {addError}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// DiagnosticsPage — Client Component
// ---------------------------------------------------------------------------

export default function DiagnosticsPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  // Next.js 15+ passes route params as a Promise — unwrap with React's use().
  const { workOrderId } = use(params);

  const [obdCode, setObdCode] = useState("");
  const [tsbs, setTsbs] = useState<TSB[] | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setObdCode(formatObdCode(e.target.value));
  }

  function handleLookup() {
    if (obdCode.length < 5) return;

    startTransition(async () => {
      setLookupError(null);
      setTsbs(null);
      setOpenIndex(null);

      const result = await lookupTSBs(workOrderId, obdCode);

      if ("error" in result) {
        setLookupError(result.error);
      } else {
        setTsbs(result.tsbs);
        // Auto-open the top-confidence TSB
        if (result.tsbs.length > 0) setOpenIndex(0);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleLookup();
  }

  const isCodeComplete = obdCode.length === 5;

  return (
    <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-8">
      <div className="mx-auto max-w-lg space-y-5">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Diagnostics
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Enter an OBD-II code to find matching Technical Service Bulletins.
          </p>
          <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest mt-1">
            WO · {workOrderId}
          </p>
        </div>

        {/* ── OBD-II Code Input ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <label
              htmlFor="obd-code-input"
              className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2"
            >
              OBD-II Fault Code
            </label>

            <div className="relative flex items-center">
              <input
                id="obd-code-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={5}
                placeholder="P0300"
                value={obdCode}
                onChange={handleCodeChange}
                onKeyDown={handleKeyDown}
                aria-label="OBD-II diagnostic trouble code"
                aria-describedby="obd-code-hint"
                className={[
                  "w-full rounded-xl border-2 bg-gray-900",
                  "px-5 py-4 font-mono text-3xl font-black tracking-[0.3em] uppercase text-white",
                  "placeholder:text-gray-700 placeholder:tracking-[0.3em]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
                  isCodeComplete
                    ? [
                        "border-brand-400",
                        "shadow-[0_0_32px_8px_rgba(250,204,21,0.25)]",
                        "focus-visible:ring-brand-400",
                      ].join(" ")
                    : [
                        "border-gray-700",
                        "focus-visible:ring-gray-500",
                      ].join(" "),
                ].join(" ")}
              />

              {/* Character counter */}
              <span
                aria-hidden="true"
                className={[
                  "absolute right-4 text-xs font-mono font-bold tabular-nums",
                  isCodeComplete ? "text-brand-400" : "text-gray-600",
                ].join(" ")}
              >
                {obdCode.length}/5
              </span>
            </div>

            <p id="obd-code-hint" className="mt-1.5 text-xs text-gray-600">
              Format: P0300 · B0100 · C0265 · U0100
            </p>
          </div>

          {/* Find TSBs button */}
          <button
            type="button"
            onClick={handleLookup}
            disabled={!isCodeComplete || isPending}
            aria-busy={isPending}
            className={[
              "flex w-full items-center justify-center gap-2",
              "rounded-xl border-2 px-4 py-4",
              "text-base font-black uppercase tracking-widest",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
              isCodeComplete && !isPending
                ? [
                    "border-brand-400 bg-brand-400 text-black",
                    "hover:shadow-[0_0_32px_8px_rgba(250,204,21,0.4)] active:scale-[0.98]",
                  ].join(" ")
                : "border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed",
            ].join(" ")}
          >
            {isPending ? (
              <>
                <span className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Searching TSBs…
              </>
            ) : (
              "Find TSBs"
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
        {tsbs !== null && !isPending && (
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {tsbs.length} TSB{tsbs.length !== 1 ? "s" : ""} found for{" "}
              <span className="font-mono text-white">{obdCode}</span>
            </p>
            <p className="text-[10px] text-gray-700">Sorted by confidence</p>
          </div>
        )}

        {/* ── TSB Accordion list ───────────────────────────────────────── */}
        {tsbs !== null && tsbs.length > 0 && (
          <div
            className="space-y-3"
            role="list"
            aria-label="Technical Service Bulletins"
          >
            {tsbs.map((tsb, idx) => (
              <div key={tsb.id} role="listitem">
                <TSBAccordionItem
                  tsb={tsb}
                  workOrderId={workOrderId}
                  isOpen={openIndex === idx}
                  onToggle={() =>
                    setOpenIndex(openIndex === idx ? null : idx)
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {tsbs !== null && tsbs.length === 0 && (
          <div className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-10 text-center">
            <p className="text-2xl mb-2" aria-hidden="true">
              🔍
            </p>
            <p className="text-sm font-bold text-white">No TSBs found</p>
            <p className="text-xs text-gray-500 mt-1">
              Try a different code or consult the OEM service portal directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
